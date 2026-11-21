// Ship state from Star Citizen's local telemetry: a gRPC stream the game serves on this PC
// (127.0.0.1, no encryption, no sign-in) once GRPC_CLIENT_SERVER_ENABLED=true is set in
// Windows before the launcher starts. The game then writes "<GameTelemetry> Local services
// server is running on 127.0.0.1:2942" in its Game.log and streams about 17 frames a second
// once your character is in the world. It's read only: nothing here sends the game anything.
//
// The stream isn't documented by Cloud Imperium; the field numbers below follow the schema the
// community read out of the game, proto/sc/game/telemetry/v1/{api,types}.proto in
// https://github.com/zolij/sc-telemetry-gateway (Apache License 2.0, see
// THIRD-PARTY-NOTICES.md). A patch may change it: fields this doesn't know are skipped, and
// when the stream can't be reached the deck works as before, from what SC-Dashboard pressed.
//
// gRPC here is HTTP/2 with a 5-byte frame header, and protobuf a short walk over tagged
// fields, so this uses Node's built-in http2 and no gRPC library: the server requires this
// (and the installer build inlines it, scripts/build.js), so it uses Node's built-in modules only.
"use strict";
const http2 = require("http2");

const PATH = "/sc.game.telemetry.v1.GameTelemetryService/TelemetryStream";
const AGAIN_MS = 5000;   // try again this long after the stream can't be reached or ends
const STALE_MS = 2000;   // no frame for this long: the deck goes back to its own guesses

// ---------- protobuf ----------

// The fields of one message: { number: [values] }, each value a Number (varint), a Buffer
// (length-delimited: a string, bytes or a nested message) or a 4- or 8-byte Buffer (fixed).
// Throws on a message cut short.
function fields(buf) {
  const out = {};
  let i = 0;
  const varint = () => {
    let n = 0, mul = 1, b;
    do {
      if (i >= buf.length) throw new Error("message cut short");
      b = buf[i++];
      n += (b & 0x7f) * mul;
      mul *= 128;
    } while (b & 0x80);
    return n;
  };
  while (i < buf.length) {
    const tag = varint();
    const no = Math.floor(tag / 8), wire = tag % 8;
    let v;
    if (wire === 0) v = varint();
    else if (wire === 2) { const len = varint(); if (i + len > buf.length) throw new Error("message cut short"); v = buf.subarray(i, i + len); i += len; }
    else if (wire === 1) { v = buf.subarray(i, i + 8); i += 8; }
    else if (wire === 5) { v = buf.subarray(i, i + 4); i += 4; }
    else throw new Error(`unknown wire type ${wire}`);
    if (i > buf.length) throw new Error("message cut short");
    (out[no] = out[no] || []).push(v);
  }
  return out;
}
// The last value of a field (proto3: the last one wins), or undefined when it's absent; zero
// values are left out of the stream, so an absent number or bool is 0 or false.
const last = (f, no) => (f[no] ? f[no][f[no].length - 1] : undefined);
const msg = (f, no) => { const v = last(f, no); return Buffer.isBuffer(v) ? fields(v) : null; };
const num = (f, no) => { const v = last(f, no); return typeof v === "number" ? v : 0; };
const bool = (f, no) => num(f, no) !== 0;
const str = (f, no) => { const v = last(f, no); return Buffer.isBuffer(v) ? v.toString("utf8") : ""; };
const active = (f, no) => { const a = msg(f, no); return a ? bool(a, 2) : false; }; // Availability.active

// ---------- what the deck shows ----------

const DEPLOYED = new Set([2, 3]); // VehicleComponentDeploymentState DEPLOYING, DEPLOYED
const NAVIGATION = 1;             // VehicleMasterMode
const OPENED = 1, LOCKED = 2;     // VehicleDoorState
const ANNUNCIATOR_OFF = 2;        // AnnunciatorState (0 unspecified, 1 nominal, 3-6 minor/major)

// One TelemetryStreamResponse: { vehicle, ship, groups } with the deck's state groups (layouts' "state":
// { "group" }) the frame can tell, or null when it carries no vehicle frame (weapons, actor and
// event frames come separately). A part of the vehicle left out tells nothing, so its groups
// are left out too, rather than turned off.
function readFrame(buf) {
  const res = fields(buf);
  const frame = msg(res, 3); // VehicleFrame
  if (!frame) return null;
  const v = msg(frame, 2);   // VehicleState; none while you aren't in a vehicle
  if (!v) return { vehicle: false, ship: "", groups: {} };
  const groups = {};
  const power = msg(v, 9);   // VehiclePowerState
  if (power) {
    groups.power = bool(power, 1);              // powerplants
    groups["thruster-power"] = bool(power, 2);  // engines
    groups["weapons-power"] = bool(power, 3);
    groups.coolers = bool(power, 4);
    groups["life-support"] = bool(power, 5);
    groups["shield-power"] = bool(power, 8);    // shield_generators
  }
  const flight = msg(v, 8);  // VehicleFlight
  const state = flight && msg(flight, 1);
  if (state) {
    if (state[2]) groups.gear = DEPLOYED.has(num(state, 2));
    if (state[3]) groups.vtol = DEPLOYED.has(num(state, 3));
  }
  const settings = flight && msg(flight, 2);
  if (settings) {
    groups.decoupled = !active(settings, 1);    // ifcs_coupled
    groups.esp = active(settings, 2);
    groups["g-safety"] = active(settings, 4);
    groups["speed-limiter"] = active(settings, 7);
    groups["proximity-assist"] = active(settings, 8);
    groups["light-amp"] = bool(settings, 19);   // flight_light_amplification
  }
  // lights_enabled sits on the vehicle itself, so it's known whenever the vehicle is.
  groups.lights = bool(v, 5);
  const doors = msg(v, 6);
  if (doors) {
    if (doors[1]) groups.doors = num(doors, 1) === OPENED;
    if (doors[2]) groups["door-lock"] = num(doors, 2) === LOCKED;
  }
  // NAV and Quantum mode: 4.10 sends no master mode (field 12), but in a live test its QDRV
  // annunciator went from OFF to NOMINAL each time the ship went to NAV / Quantum mode (and
  // shields went down with it), and back on SCM. A master mode, where a version sends one, wins.
  const ann = msg(v, 7);     // VehicleAnnunciator
  if (ann && num(ann, 6)) groups["nav-mode"] = groups["quantum-mode"] = num(ann, 6) !== ANNUNCIATOR_OFF;
  const master = msg(v, 12); // VehicleMasterModeState
  if (master && master[1]) groups["nav-mode"] = groups["quantum-mode"] = num(master, 1) === NAVIGATION;
  // Flight Ready has no field of its own (nothing in the frame changed with it in a live
  // test), so the deck keeps guessing that one from its presses.
  return { vehicle: true, ship: shipName(v), groups };
}

// 4.10 sends the entity as the name ("ANVL_Asgard_942761479621") and the class
// ("ANVL_Asgard") without a manufacturer, so the deck shows the class made readable
// ("ANVL Asgard"), else the name without its entity number.
function shipName(v) {
  const readable = (s) => s.replace(/_\d{6,}$/, "").replace(/_/g, " ").trim();
  return readable(str(v, 2)) || readable(str(v, 1)) || "Ship";
}

// ---------- the stream ----------

// create({ ports, onUpdate, log }): follows the telemetry on the first of `ports` that answers,
// trying again every few seconds while none does. onUpdate(status) hears every change of
// status(): { live, vehicle, ship, groups }. live is true while frames arrive, vehicle while
// they come from a vehicle you sit in; groups holds the state groups the game told last (kept
// after the stream stops, but no longer live).
function create({ ports = [2942, 50051], onUpdate = () => {}, log = () => {} } = {}) {
  let session = null, timer = null, staleTimer = null, stopped = true;
  let portIndex = 0, reported = "";
  let st = { live: false, vehicle: false, ship: "", groups: {} };

  const set = (next) => {
    const changed = next.live !== st.live || next.vehicle !== st.vehicle || next.ship !== st.ship
      || Object.keys(next.groups).length !== Object.keys(st.groups).length
      || Object.entries(next.groups).some(([g, on]) => st.groups[g] !== on);
    st = next;
    if (changed) onUpdate(status());
  };
  // One line per kind of trouble, not one every few seconds.
  const note = (text) => { if (text !== reported) { reported = text; log(text); } };

  function again() {
    if (stopped || timer) return;
    timer = setTimeout(() => { timer = null; connect(); }, AGAIN_MS);
    timer.unref();
  }
  function drop() {
    if (session) { const s = session; session = null; s.destroy(); }
    clearTimeout(staleTimer);
    if (st.live) set({ ...st, live: false });
  }

  function connect() {
    if (stopped) return;
    const port = ports[portIndex % ports.length];
    let s;
    try { s = http2.connect(`http://127.0.0.1:${port}`); } catch (err) { note(`Telemetry: ${err.message}`); portIndex++; again(); return; }
    session = s;
    s.on("error", () => {}); // reported by "close" below
    s.on("close", () => {
      if (session !== s) return;
      session = null; drop(); portIndex++; again();
      note(`Telemetry: no stream from the game on port ${ports.join(" or ")}; looking again every ${AGAIN_MS / 1000} s.`);
    });
    s.on("connect", () => {
      const req = s.request({ ":method": "POST", ":path": PATH, "content-type": "application/grpc", te: "trailers" });
      req.on("error", () => {});
      req.on("response", (headers) => {
        if (headers[":status"] !== 200) note(`Telemetry: the game answered ${headers[":status"]} on port ${port}`);
      });
      let pending = Buffer.alloc(0), heard = false;
      req.on("data", (chunk) => {
        pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
        // gRPC frames: 1 byte compressed flag, 4 bytes length (big-endian), the message.
        while (pending.length >= 5) {
          const len = pending.readUInt32BE(1);
          if (pending.length < 5 + len) break;
          const compressed = pending[0] === 1, body = pending.subarray(5, 5 + len);
          pending = pending.subarray(5 + len);
          if (compressed) continue; // not asked for (no grpc-accept-encoding), so not expected
          let frame;
          try { frame = readFrame(body); } catch (err) { note(`Telemetry: a frame didn't read (${err.message})`); continue; }
          if (!heard) { heard = true; note(`Telemetry: reading the game on port ${port}.`); }
          clearTimeout(staleTimer);
          staleTimer = setTimeout(() => set({ ...st, live: false }), STALE_MS);
          staleTimer.unref();
          if (frame) set({ live: true, vehicle: frame.vehicle, ship: frame.ship, groups: frame.vehicle ? frame.groups : st.groups });
          else if (!st.live) set({ ...st, live: true });
        }
      });
      // The game ended the stream (it quit, or the server restarted): start over.
      req.on("close", () => { if (session === s) { session = null; s.close(); drop(); again(); } });
      req.end(Buffer.from([0, 0, 0, 0, 0])); // one empty TelemetryStreamRequest
    });
  }

  function status() { return { live: st.live, vehicle: st.vehicle, ship: st.ship, groups: { ...st.groups } }; }

  return {
    start() { if (!stopped) return; stopped = false; connect(); },
    stop() { stopped = true; clearTimeout(timer); timer = null; drop(); },
    status,
    // True while frames arrive from a vehicle and the last one told this group.
    owns: (group) => st.live && st.vehicle && Object.prototype.hasOwnProperty.call(st.groups, group),
  };
}

module.exports = { create, readFrame, fields };
