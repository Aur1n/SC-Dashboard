// A stand-in for Star Citizen's local telemetry stream, to try telemetry.js without the game:
// it serves the same gRPC call on 127.0.0.1 and sends a made-up ship whose power, flight
// assists, gear, doors and lights change every few seconds. For development only.
//
//   node tools/fake-telemetry.js [--port 2943] [--ship "Anvil Arrow"]
//   node server.js --dry-run --port 8790 --telemetry-port 2943
//
// Port 2943 by default, so it never stands in front of the real game's 2942.
"use strict";
const http2 = require("http2");

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback; };
const PORT = Number(arg("--port", 2943));
const SHIP = String(arg("--ship", "Anvil Arrow"));
const FRAME_MS = 60;  // about the game's 17 frames a second
const STEP_MS = 3000; // the made-up ship changes this often

// ---------- protobuf ----------

const varint = (n) => { const out = []; do { let b = n % 128; n = Math.floor(n / 128); if (n) b |= 0x80; out.push(b); } while (n); return Buffer.from(out); };
const tag = (no, wire) => varint(no * 8 + wire);
// A message from [number, value] pairs: a number or bool as a varint (left out when zero, as
// proto3 does), a string or Buffer as length-delimited, null skipped.
function message(pairs) {
  const parts = [];
  for (const [no, v] of pairs) {
    if (v === null || v === undefined || v === false || v === 0 || v === "") continue;
    if (typeof v === "number" || v === true) parts.push(tag(no, 0), varint(Number(v)));
    else { const b = Buffer.isBuffer(v) ? v : Buffer.from(String(v), "utf8"); parts.push(tag(no, 2), varint(b.length), b); }
  }
  return Buffer.concat(parts);
}
// Availability { enabled = 1, active = 2 }.
const avail = (on) => message([[1, true], [2, on]]);

// One TelemetryStreamResponse with a vehicle frame, for step `n` of the made-up flight.
function frame(n) {
  const on = (period, phase = 0) => Math.floor(n / period + phase) % 2 === 1;
  const power = message([[1, !on(9)], [2, !on(9)], [3, on(2)], [4, !on(9)], [5, !on(9)], [8, !on(3)], [9, !on(3)]]);
  const state = message([[1, on(4)], [2, on(4) ? 3 : 1], [3, on(5) ? 3 : 1]]);
  const settings = message([[1, avail(!on(6))], [2, avail(true)], [4, avail(on(7))], [7, avail(false)], [8, avail(on(3, 0.5))], [19, on(8)]]);
  const flight = message([[1, state], [2, settings]]);
  const doors = message([[1, on(5) ? 1 : 2], [2, on(10) ? 2 : 1]]);
  // 4.10 sends no master mode; its QDRV annunciator is NOMINAL (1) in NAV / Quantum mode, else OFF (2).
  const annunciators = message([[1, 1], [6, on(6, 0.5) ? 1 : 2]]);
  const vehicle = message([[1, `${SHIP.replace(/ /g, "_")}_942761479621`], [2, SHIP.replace(/ /g, "_")], [4, 1], [5, on(2, 0.5)], [6, doors], [7, annunciators], [8, flight], [9, power]]);
  return message([[3, message([[2, vehicle]])]]);
}

const server = http2.createServer();
server.on("stream", (stream, headers) => {
  if (headers[":path"] !== "/sc.game.telemetry.v1.GameTelemetryService/TelemetryStream") {
    stream.respond({ ":status": 200, "content-type": "application/grpc" }, { waitForTrailers: true });
    stream.on("wantTrailers", () => stream.sendTrailers({ "grpc-status": "12" }));
    stream.end();
    return;
  }
  stream.respond({ ":status": 200, "content-type": "application/grpc" });
  console.log("A reader joined.");
  const started = Date.now();
  let last = -1;
  const timer = setInterval(() => {
    const n = Math.floor((Date.now() - started) / STEP_MS);
    if (n !== last) { last = n; console.log(`Step ${n}`); }
    const body = frame(n);
    const head = Buffer.alloc(5);
    head.writeUInt32BE(body.length, 1);
    stream.write(Buffer.concat([head, body]));
  }, FRAME_MS);
  stream.on("close", () => { clearInterval(timer); console.log("The reader left."); });
});
server.listen(PORT, "127.0.0.1", () => console.log(`Fake Star Citizen telemetry on 127.0.0.1:${PORT}, ship "${SHIP}".`));
