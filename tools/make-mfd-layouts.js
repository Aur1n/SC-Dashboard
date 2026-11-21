// Builds layouts/mfd-left.json and layouts/mfd-right.json from the HUD layout: one tablet
// per MFD. The left half is five dense MFD pages (Power, Weapons, Targets, Comms, Scan /
// Config); the half's bottom arrows page the tablet and the game's screen together. The right
// half is six panels made of the HUD's own buttons (Flight, Combat, Ship, Industry, On Foot /
// Comms, Emotes). layouts/hud.json itself, and every other layout made from it, stay as they are.
//
//   node tools/make-mfd-layouts.js      (after editing layouts/hud.json)
//
// Every MFD button first selects its screen (left = MFD 1, right = MFD 2), so the two
// tablets' pages are the same apart from that. Paging sends the new page's direct page action
// (resource network, target status...), so the tablet and the game can't drift apart. Weapon
// config has no such action: its page selects Power management and then steps one page on
// (»), which is the next page on the player's ship as tested; other ships may differ, which a
// ship choice will handle later. The page and other actions the game leaves unbound get Right
// Ctrl binds in the profile.
//
// Each switch sits once, on the page of its topic (power on Power, flight assists on the right
// half's Flight panel), rather than in a column repeated on every page. Switches with no
// action in the game (RADR, HIT, COOL as a toggle) are left out; the coolers show as a lamp.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const hudText = fs.readFileSync(path.join(ROOT, "layouts", "hud.json"), "utf8");
const hud = JSON.parse(hudText);

const SCREEN = { left: 1, right: 2 };

// Lamps that come on with Power (Life Support and the coolers have no keys in the game).
const POWER_ALL = { "weapons-power": true, "shield-power": true, "thruster-power": true, "life-support": true, coolers: true };
const POWER_NONE = { "weapons-power": false, "shield-power": false, "thruster-power": false, "life-support": false, coolers: false };

// Buttons the HUD doesn't have: [label, icon, keys, extra].
const OWN = {
  v_power_set_on: ["Power on", "power", "rctrl+c", { color: "green", state: { group: "power", set: true, with: { on: POWER_ALL } } }],
  v_power_set_off: ["Power off", "power", "rctrl+v", { color: "red", state: { group: "power", set: false, with: { off: POWER_NONE } } }],
  // The game's own V (Data/Libs/Config/defaultProfile.xml): scanning works only in scan mode.
  v_toggle_scan_mode: ["Scan mode", "target", "v", { color: "amber", state: { group: "scan-mode" } }],
  // The game takes the scan only while held (activation mode "hold").
  v_scanning_trigger_scan: ["Scan", "target", "rctrl+np_divide", { color: "amber", mode: "hold" }],
  // Focus + narrows the scan cone (90° → 45° ...), as the game's "Focus +/-". A 60 ms tap was
  // missed now and then in a live test, so these press a little longer.
  v_inc_scan_focus_level: ["Focus +", "chev-up", "rctrl+equals", { mode: "timed", ms: 200 }],
  v_dec_scan_focus_level: ["Focus −", "chev-down", "rctrl+semicolon", { mode: "timed", ms: 200 }],
  v_ifcs_proximity_assist_toggle: ["Proximity assist", "target", "rctrl+z", { state: { group: "proximity-assist" } }],
  v_lock_rotation: ["Lock rotation", "lock", "rshift", { state: { group: "lock-rotation" } }],
  v_toggle_quantum_mode: ["Quantum mode", "quantum-mode", "rctrl+np_multiply", { state: { group: "quantum-mode" } }],
  // The game's own keys for these (defaultProfile.xml).
  v_weapon_gimbals_state_toggle: ["Gimbal lock", "lock", "g", {}],
  v_weapon_aim_type_cycle: ["Aim mode", "target", "ralt+g", {}],
  v_target_toggle_lock_index_1: ["Lock pin 1", "target", "1", {}],
  v_target_toggle_lock_index_2: ["Lock pin 2", "target", "2", {}],
  v_target_toggle_lock_index_3: ["Lock pin 3", "target", "3", {}],
  v_target_cycle_subitem_reset: ["Sub reset", "target", "lalt+r", {}],
};

// ---------- the HUD's elements ----------

// The HUD's element with this id (a panel item or a group's), or null.
function hudElement(id) {
  let found = null;
  (function walk(node) {
    if (found || !node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.id === id && node.type) { found = node; return; }
    if (Array.isArray(node.elements)) node.elements.forEach(walk);
  })(Object.values(hud.panels));
  if (!found) throw new Error(`layouts/hud.json has no element "${id}"`);
  return found;
}

// The HUD's first button for an action (its panels, then its top bar), or null.
function hudButton(scAction) {
  let found = null;
  (function walk(node) {
    if (found || !node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node.id === "string" && typeof node.keys === "string" && node.scAction === scAction) { found = node; return; }
    Object.values(node).forEach(walk);
  })([hud.panels, hud.chrome]);
  return found;
}

const clone = (v) => JSON.parse(JSON.stringify(v));
const at = (e, col, row, w, h) => {
  const c = { ...e, at: [col, row], span: [w, h] };
  delete c.size;
  return c;
};

// A copy of a HUD element for an MFD page: ids get the page's prefix (ids are unique per
// layout), and voice phrases stay with the HUD's own copy on the right half.
function renamed(e, prefix) {
  const c = clone(e);
  const ren = (id) => `${prefix}-${id}`;
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    if (typeof n.id === "string") n.id = ren(n.id);
    delete n.voice;
    if (n.follows) for (const k of Object.keys(n.follows)) n.follows[k] = ren(n.follows[k]);
    for (const v of Object.values(n)) if (v && typeof v === "object") walk(v);
  })(c);
  return c;
}

// A copy of an action's button: the HUD's (keys, state, lights) or the OWN entry.
function actionButton(id, scAction, extra = {}) {
  const h = hudButton(scAction);
  if (h) {
    const b = { type: "button", id, icon: h.icon, label: h.short || h.label, voice: false, keys: h.keys, scAction, mode: h.mode === "hold" ? "hold" : (h.mode || "tap"), labels: "show", ...extra };
    for (const k of ["state", "ms", "color", "whenOn"]) if (h[k] && !(k in extra)) b[k] = clone(h[k]);
    return b;
  }
  const own = OWN[scAction];
  if (!own) throw new Error(`no button for ${scAction}: add it to the HUD or to OWN`);
  const [label, icon, keys, more] = own;
  return { type: "button", id, icon, label, voice: false, keys, scAction, mode: "tap", labels: "show", ...clone(more), ...extra };
}

// ---------- the left half: MFD pages ----------

// Power management as the HUD's power distribution, 6 × 4: Weapons, Thrusters and Shields
// sliders (swipe up and down, max above, min below); beside them Power on / off, the Quantum
// Drive lamp (on in Quantum mode) and Center sliders.
function powerBlock(pid, pos) {
  const hudGroup = hudElement("pw-group");
  const byId = (id) => {
    const c = renamed(hudGroup.elements.find((e) => e.id === id), pid);
    delete c.span; delete c.at;
    return c;
  };
  return {
    type: "group", id: `${pid}-power`, cols: 8, span: [6, 4], at: pos,
    elements: [
      at(byId("pw-wep-max"), 0, 0, 2, 1), at(byId("pw-thr-max"), 2, 0, 2, 1), at(byId("pw-shd-max"), 4, 0, 2, 1),
      actionButton(`${pid}-on`, "v_power_set_on", { label: "On", at: [6, 0], span: [2, 1] }),
      at(byId("pw-wep-level"), 0, 1, 2, 2), at(byId("pw-thr-level"), 2, 1, 2, 2), at(byId("pw-shd-level"), 4, 1, 2, 2),
      actionButton(`${pid}-off`, "v_power_set_off", { label: "Off", at: [6, 1], span: [2, 1] }),
      lamp(`${pid}-quantum`, "QT drive", "quantum-mode", "quantum-mode", 6, 2, 2),
      at(byId("pw-wep-min"), 0, 3, 2, 1), at(byId("pw-thr-min"), 2, 3, 2, 1), at(byId("pw-shd-min"), 4, 3, 2, 1),
      at(byId("pw-center"), 6, 3, 2, 1),
    ],
  };
}

// A light with no key: it only shows its state group.
function lamp(id, label, icon, group, col, row, w = 1) {
  return { type: "button", id, icon, label, voice: false, labels: "show", state: { group }, at: [col, row], span: [w, 1] };
}

// The page's buttons: [scAction, label, col, row, w = 2, h = 1].
const buttons = (pid, list) => list.map(([scAction, label, col, row, w = 2, h = 1], i) =>
  actionButton(`${pid}-${i + 1}`, scAction, { ...(label ? { label } : {}), at: [col, row], span: [w, h] }));

// [title, enter: [scAction, keys] steps (after selecting the screen), elements(pid, screenButton)].
const PAGES = [
  ["Power", [["v_mfd_select_view_resource_network_short", "rctrl+3"]], (pid) => {
    const pwr = actionButton(`${pid}-sw-pwr`, "v_power_toggle", { label: "PWR", at: [0, 0], span: [1, 1] });
    if (pwr.state && pwr.state.with) pwr.state.with = { on: POWER_ALL, off: POWER_NONE };
    return [
      pwr,
      actionButton(`${pid}-sw-wpn`, "v_power_toggle_weapons", { label: "WPN", at: [1, 0], span: [1, 1] }),
      actionButton(`${pid}-sw-thr`, "v_power_toggle_thrusters", { label: "THR", at: [2, 0], span: [1, 1] }),
      actionButton(`${pid}-sw-shld`, "v_power_toggle_shields", { label: "SHLD", at: [3, 0], span: [1, 1] }),
      lamp(`${pid}-life`, "Life", "power", "life-support", 4, 0),
      lamp(`${pid}-cool`, "Cool", "power", "coolers", 5, 0),
      powerBlock(pid, [0, 1]),
      // The HUD's shield cluster: tap a side to raise it (the game only raises a face, which
      // lowers the others), the hull to balance them, the ring to turn them on or off.
      at(renamed(hudElement("sh-cluster"), pid), 0, 5, 4, 3),
      // Shld + needs free power (OUTPUT above 0). The power throttle (F9 / F10) changed nothing
      // in a live test, so it's left out.
      ...buttons(pid, [
        ["v_engineering_assignment_shields_increase", "Shld +", 4, 5],
        ["v_engineering_assignment_shields_decrease", "Shld −", 4, 6],
        ["v_engineering_assignment_reset", "Reset all", 4, 7],
      ]),
    ];
  }],
  // No direct page action: Power management, then one page on (»).
  ["Weapons", [["v_mfd_select_view_resource_network_short", "rctrl+3"], ["v_mfd_interact_cycle_forwards_short", "lalt+e"]], (pid) => [
    at(renamed(hudElement("cb-cluster"), pid), 0, 0, 6, 5),
    ...buttons(pid, [
      ["v_set_guns_mode", "Guns mode", 0, 5], ["v_set_missile_mode", "Missile mode", 2, 5], ["v_weapon_pip_toggle_lead_lag", "Lead/lag", 4, 5],
      ["v_engineering_assignment_weapons_increase", "Wpn +", 0, 6], ["v_engineering_assignment_weapons_decrease", "Wpn −", 2, 6], ["v_weapon_gimbals_state_toggle", "Gimbal", 4, 6],
      ["v_weapon_countermeasure_decoy_burst_decrease", "Burst −", 0, 7], ["v_weapon_countermeasure_decoy_burst_increase", "Burst +", 2, 7], ["v_weapon_aim_type_cycle", "Aim mode", 4, 7],
    ]),
  ]],
  ["Targets", [["v_mfd_select_view_target_status_short", "rctrl+5"]], (pid) => [
    at(renamed(hudElement("tg-cluster"), pid), 0, 0, 4, 4),
    ...buttons(pid, [
      ["v_target_toggle_pin_index_1", "Pin 1", 4, 0], ["v_target_toggle_pin_index_2", "Pin 2", 4, 1], ["v_target_toggle_pin_index_3", "Pin 3", 4, 2], ["v_target_unlock", "Unlock", 4, 3],
      ["v_target_toggle_lock_index_1", "Lock pin 1", 0, 4], ["v_target_toggle_lock_index_2", "Lock pin 2", 2, 4], ["v_target_toggle_lock_index_3", "Lock pin 3", 4, 4],
      ["v_target_cycle_subitem_reset", "Sub reset", 0, 5], ["v_target_hail", "Hail", 2, 5], ["v_invoke_ping", "Ping", 4, 5],
    ]),
  ]],
  ["Comms", [["v_mfd_select_view_comms_short", "rctrl+6"]], (pid) => buttons(pid, [
    ["foip_pushtotalk", "PTT", 0, 0, 2, 2], ["foip_pushtotalk_proximity", "Prox PTT", 2, 0, 2, 2], ["v_target_hail", "Hail", 4, 0], ["foip_cyclechannel", "Channel", 4, 1],
    ["ui_notification_accept", "Accept", 0, 2], ["ui_notification_decline", "Decline", 2, 2], ["v_atc_request", "ATC", 4, 2],
    ["v_toggle_docking_request", "Docking", 0, 3], ["v_dock_toggle_view", "Dock cam", 2, 3], ["v_autoland", "Auto land", 4, 3],
    ["toggle_chat", "Chat", 0, 4], ["toggle_contact", "Contacts", 2, 4], ["pc_personal_thought", "Thought", 4, 4],
  ])],
  ["Scan / Config", [["v_mfd_select_view_scanning_short", "rctrl+comma"]], (pid, screenButton) => [
    ...buttons(pid, [
      ["v_toggle_scan_mode", "Scan mode", 0, 0], ["v_invoke_ping", "Ping", 2, 0], ["v_scanning_trigger_scan", "Scan", 4, 0, 2, 2],
      ["v_inc_scan_focus_level", "Focus +", 0, 1], ["v_dec_scan_focus_level", "Focus −", 2, 1],
      ["v_ifcs_speed_limiter_toggle", "Speed limiter", 0, 2], ["v_ifcs_proximity_assist_toggle", "Prox assist", 2, 2], ["v_ifcs_throttle_swap_mode", "Throttle mode", 4, 2],
      ["v_lights", "Lights", 0, 3], ["v_light_amplification_toggle", "Light amp", 2, 3], ["v_lock_rotation", "Lock rot", 4, 3],
    ]),
    // The game's pages with no tablet page of their own: these only show them on the screen.
    screenButton("config", "Config page", [["v_mfd_select_view_configuration_short", "rctrl+9"]], { at: [0, 4], span: [2, 1] }),
    screenButton("diag", "Diag page", [["v_mfd_select_view_diagnostics_short", "rctrl+0"]], { at: [2, 4], span: [2, 1] }),
    screenButton("self", "Self status", [["v_mfd_select_view_self_status_short", "rctrl+4"]], { at: [4, 4], span: [2, 1] }),
  ]],
];

// The MFD pages speak the game's English, as on its screens: labels and titles in capitals,
// which the deck shows anyway, aren't in the translation tables (keys are case-sensitive),
// so they stay English in every language. State words (ON / OFF) still translate.
function english(node) {
  if (Array.isArray(node)) return node.map(english);
  if (!node || typeof node !== "object") return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = (k === "label" || k === "title" || k === "short") && typeof v === "string" ? v.toUpperCase() : english(v);
  return out;
}

// ---------- the right half: the HUD's buttons, six panels ----------

// [id, title, elements]: HUD elements by id with their place, [id, col, row, w, h], or a ready
// element. They keep the HUD's ids, keys, voice phrases and lights.
function rightPanels(side) {
  const el = (id, col, row, w, h) => at(clone(hudElement(id)), col, row, w, h);
  // The flight assists with Proximity assist and Lock rotation added, as switches.
  const bank = el("fa-bank", 0, 1, 6, 1);
  for (const [scAction, id, label, icon] of [["v_ifcs_proximity_assist_toggle", "fa-prox", "Proximity Assist", "target"], ["v_lock_rotation", "fa-lock", "Lock Rotation", "lock"]]) {
    const [, , keys, more] = OWN[scAction];
    bank.buttons.push({ id, icon, label, ...clone(more), keys, scAction, mode: "tap" });
  }
  const atc = hud.chrome.find((c) => c.id === "top-atc");
  return [
    ["flight", "Flight", [
      el("qt-flight-ready", 0, 0, 2, 1), el("fa-scm", 2, 0, 2, 1), el("fa-nav", 4, 0, 2, 1),
      bank,
      el("pl-group", 0, 2, 6, 3),
      el("qt-quantum", 0, 5, 4, 2),
      { type: "button", id: `${side}-fl-qt-mode`, icon: "quantum-mode", label: "Quantum Mode", keys: OWN.v_toggle_quantum_mode[2], scAction: "v_toggle_quantum_mode", mode: "tap", state: { group: "quantum-mode" }, at: [4, 5], span: [2, 1] },
      // The game's one ATC request asks for landing in flight and for takeoff on a pad; with
      // the game's telemetry the label follows (the "landed" group), without it it stays as is.
      { type: "button", id: `${side}-fl-atc`, icon: atc.icon || "comms", label: "Request Landing", keys: atc.keys, scAction: atc.scAction, mode: "tap",
        state: { group: "landed", display: "label", label: { on: "Request Takeoff", off: "Request Landing" } }, at: [4, 6], span: [2, 1] },
      el("fa-range", 0, 7, 4, 1), el("fa-exit", 4, 7, 2, 1),
    ]],
    ["combat", "Combat", [
      el("tg-cluster", 0, 0, 4, 4),
      el("tg-pin-1", 4, 0, 2, 1), el("tg-pin-2", 4, 1, 2, 1), el("tg-pin-3", 4, 2, 2, 1), el("tg-unlock", 4, 3, 2, 1),
      el("cb-cluster", 0, 4, 4, 3),
      el("cb-burst-up", 4, 4, 2, 1), el("cb-burst-down", 4, 5, 2, 1), el("fa-look-behind", 4, 6, 2, 1),
      el("cb-hits", 0, 7, 6, 1),
    ]],
    ["ship", "Ship", [
      el("cr-hull", 0, 0, 4, 3),
      el("cr-light-amp", 4, 0, 2, 1), el("cr-port-locks", 4, 1, 2, 1), el("md-ping", 4, 2, 2, 1),
      el("qt-modes", 0, 3, 4, 4),
      el("qt-self-destruct", 4, 3, 2, 2), el("cr-turrets", 4, 5, 2, 2),
      el("qt-eject", 0, 7, 4, 1), el("qt-emergency-exit", 4, 7, 2, 1),
    ]],
    ["industry", "Industry", [
      el("mn-cluster", 0, 0, 6, 4),
      el("sv-cluster", 0, 4, 4, 3),
      el("sv-fire-left", 4, 4, 2, 1), el("sv-fire-right", 4, 5, 2, 1), el("sv-focus-all", 4, 6, 2, 1),
      el("sv-focus-left", 0, 7, 2, 1), el("mn-jettison", 2, 7, 2, 1), el("sv-focus-right", 4, 7, 2, 1),
    ]],
    ["on-foot", "On Foot/Comms", [
      el("ft-inventory", 0, 0, 2, 1), el("ft-camera", 2, 0, 2, 1), el("ft-walk", 4, 0, 2, 1),
      el("ft-drop", 0, 1, 2, 1), el("ft-inspect", 2, 1, 2, 1), el("ft-escape", 4, 1, 2, 1),
      el("cm-ptt", 0, 2, 2, 2), el("cm-ptt-prox", 2, 2, 2, 2), el("cm-channel", 4, 2, 2, 1), el("cm-hail", 4, 3, 2, 1),
      el("cm-accept", 0, 4, 2, 1), el("cm-decline", 2, 4, 2, 1), el("cm-pit", 4, 4, 2, 1),
      el("cm-visor", 0, 5, 2, 1), el("cm-chat", 2, 5, 2, 1), el("cm-contacts", 4, 5, 2, 1),
    ]],
    ["emotes", "Emotes", [el("em-board", 0, 0, 6, 8)]],
  ];
}

// ---------- the layout ----------

function mfdLayout(side) {
  const n = SCREEN[side], tag = `${side}-mfd`;
  const select = { keys: `rctrl+${n}`, scAction: `v_mfd_soft_select_mfd_${n}_short` };
  // A button that selects this MFD, then sends its steps one after another.
  const onScreen = (id, label, icon, steps, extra = {}) => ({
    type: "button", id: `${tag}-${id}`, icon, label, voice: false, ...select,
    ...(steps.length ? { then: steps.map(([scAction, keys]) => ({ keys, scAction })) } : {}), mode: "tap", labels: "show", ...extra,
  });
  const panels = {};
  PAGES.forEach(([title, enter, build], p) => {
    const pid = `${tag}-${p + 1}`;
    const screenButton = (id, label, steps, extra) => onScreen(`${p + 1}-${id}`, label, "target", steps, extra);
    // Each page has its own pair (ids are unique per layout); they send « / » after selecting the screen.
    const pager = {
      prev: onScreen(`${p + 1}-tab-back`, "Prev tab", "chev-left", [["v_mfd_interact_cycle_backwards_short", "lalt+q"]]),
      next: onScreen(`${p + 1}-tab-fwd`, "Next tab", "chev-right", [["v_mfd_interact_cycle_forwards_short", "lalt+e"]]),
    };
    panels[pid] = english({ title, cols: 6, elements: build(pid, screenButton), pager, enter: onScreen(`${p + 1}-enter`, title, "target", enter) });
  });
  const right = rightPanels(side).map(([id, title, elements]) => {
    panels[`${side}-${id}`] = { title, cols: 6, elements };
    return `${side}-${id}`;
  });
  const grid = { ...clone(hud.grid), halves: { left: Object.keys(panels).filter((id) => id.startsWith(`${tag}-`)), right } };
  // The two tablets always show two halves, so the HUD's dashboards (which show its other
  // panels) aren't part of these layouts.
  delete grid.full; delete grid.primary;
  return {
    name: side === "left" ? "Left MFD" : "Right MFD",
    notes: `Generated by tools/make-mfd-layouts.js from the HUD layout; edit that script, not this file. One tablet for the ${side} MFD (MFD ${n}): ` +
      "the left half is that screen in five pages; its bottom arrows page the tablet and the game together. The right half is six panels of the HUD's buttons.",
    grid,
    chrome: hud.chrome,
    panels,
  };
}

const eol = hudText.includes("\r\n") ? "\r\n" : "\n";
for (const side of ["left", "right"]) {
  const file = path.join(ROOT, "layouts", `mfd-${side}.json`);
  fs.writeFileSync(file, (JSON.stringify(mfdLayout(side), null, 2) + "\n").replace(/\n/g, eol));
  console.log(`Wrote layouts/mfd-${side}.json.`);
}
