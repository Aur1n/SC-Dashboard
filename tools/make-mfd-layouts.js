// Builds layouts/mfd-left.json and layouts/mfd-right.json from the HUD layout: one tablet
// per MFD. The left half is that screen, page by page as the game shows it (Power management,
// Weapon config, Shields, Self status...): each page has the screen's switch column on the side
// the game puts it and the buttons for what that page does. The half's
// bottom arrows page the tablet and the game's screen together. The right half is the HUD's.
//
//   node tools/make-mfd-layouts.js      (after editing layouts/hud.json)
//
// Every MFD button first selects its screen (left = MFD 1, right = MFD 2). Paging to a page
// with a direct page action (resource network, self status...) sends it, so the two can't
// drift apart; Weapon config and Shields have none, so paging there sends « / ». The page
// and other actions the game leaves unbound get Right Ctrl binds in the profile.
//
// The switch columns follow the player's ship as tested (the left screen carries the power
// column, the right one the flight column); other ships differ, which a ship choice will
// handle later. Switches with no action in the game (RADR, HIT, COOL as a toggle) are left out.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const hudText = fs.readFileSync(path.join(ROOT, "layouts", "hud.json"), "utf8");
const hud = JSON.parse(hudText);

const SCREEN = { left: 1, right: 2 };
// [label, scAction, own button when the HUD has none]. The rest copy the HUD's button for
// that action (same keys and state group), so their lights agree with it.
const SWITCHES = {
  left: [
    ["PWR", "v_power_toggle"], ["WPN", "v_power_toggle_weapons"], ["THR", "v_power_toggle_thrusters"],
    ["SHLD", "v_power_toggle_shields"], ["CPLD", "v_ifcs_vector_decoupling_toggle"], ["ESP", "v_ifcs_toggle_esp"],
    ["LOCK", "v_lock_rotation", { icon: "lock", keys: "rshift", mode: "tap", state: { group: "lock-rotation" } }],
  ],
  right: [
    ["QTM", "v_toggle_quantum_mode", { icon: "quantum-mode", keys: "rctrl+np_multiply", mode: "tap", state: { group: "quantum-mode" } }],
    ["PING", "v_invoke_ping"],
    ["PROX", "v_ifcs_proximity_assist_toggle", { icon: "target", keys: "rctrl+z", mode: "tap", state: { group: "proximity-assist" } }],
    ["MISL", "v_set_missile_mode"], ["VTOL", "v_vtol_toggle"], ["GEAR", "v_toggle_landing_system"], ["GSAF", "v_ifcs_toggle_gforce_safety"],
  ],
};

// Buttons the HUD doesn't have: [scAction, label, icon, keys, extra].
const POWER_ALL = { "weapons-power": true, "shield-power": true, "thruster-power": true, "life-support": true };
const POWER_NONE = { "weapons-power": false, "shield-power": false, "thruster-power": false, "life-support": false };
const OWN = {
  v_power_set_on: ["Power on", "power", "rctrl+c", { color: "green", state: { group: "power", set: true, with: { on: POWER_ALL } } }],
  v_power_set_off: ["Power off", "power", "rctrl+v", { color: "red", state: { group: "power", set: false, with: { off: POWER_NONE } } }],
  v_power_set_weapons_on: ["Weapons on", "power-weapons", "rctrl+r", { color: "green", state: { group: "weapons-power", set: true } }],
  v_power_set_weapons_off: ["Weapons off", "power-weapons", "rctrl+home", { color: "red", state: { group: "weapons-power", set: false } }],
  v_power_set_thrusters_on: ["Thrusters on", "power-engines", "rctrl+insert", { color: "green", state: { group: "thruster-power", set: true } }],
  v_power_set_thrusters_off: ["Thrusters off", "power-engines", "rctrl+delete", { color: "red", state: { group: "thruster-power", set: false } }],
  v_power_set_shields_on: ["Shields on", "power-shields", "rctrl+pgdn", { color: "green", state: { group: "shield-power", set: true } }],
  v_power_set_shields_off: ["Shields off", "power-shields", "rctrl+np_0", { color: "red", state: { group: "shield-power", set: false } }],
  // The game's own V (Data/Libs/Config/defaultProfile.xml): scanning works only in scan mode.
  v_toggle_scan_mode: ["Scan mode", "target", "v", { color: "amber", state: { group: "scan-mode" } }],
  // The game takes the scan only while held (activation mode "hold").
  v_scanning_trigger_scan: ["Scan", "target", "rctrl+np_divide", { color: "amber", mode: "hold" }],
  v_inc_scan_focus_level: ["Scan angle +", "chev-up", "rctrl+equals", {}],
  v_dec_scan_focus_level: ["Scan angle −", "chev-down", "rctrl+semicolon", {}],
  v_ifcs_proximity_assist_toggle: ["Proximity assist", "target", "rctrl+z", { state: { group: "proximity-assist" } }],
};

// Power management as the HUD's power distribution: Weapons, Thrusters and Shields sliders
// (swipe up and down, max above, min below), Power on / off, and lamps for Life Support (on with
// Flight Ready and Power) and the Quantum Drive (on in Quantum mode, from the right half's
// operator modes). The game has no keys for those two or for the coolers (its cooler throttle
// does nothing in 4.x, tested), so the lamps only show. at: the block's top left cell.
function powerBlock(pid, pos) {
  const hudGroup = hud.panels["power-landing"].elements.find((e) => e.id === "pw-group");
  const ren = (id) => `${pid}-${id}`;
  const copy = (e) => {
    const c = JSON.parse(JSON.stringify(e));
    (function walk(n) {
      if (!n || typeof n !== "object") return;
      if (typeof n.id === "string") n.id = ren(n.id);
      delete n.voice; delete n.span; delete n.at;
      if (n.follows) for (const k of Object.keys(n.follows)) n.follows[k] = ren(n.follows[k]);
      for (const v of Object.values(n)) if (v && typeof v === "object") walk(v);
    })(c);
    return c;
  };
  const byId = (id) => copy(hudGroup.elements.find((e) => e.id === id));
  const at = (e, col, row, w, h) => ({ ...e, at: [col, row], span: [w, h] });
  const lamp = (id, label, icon, group) => ({ type: "button", id: ren(id), icon, label, voice: false, labels: "show", state: { group }, at: [6, id === "life" ? 0 : 4], span: [2, 1] });
  return {
    type: "group", id: ren("power"), cols: 8, span: [4, 6], at: pos,
    elements: [
      at(byId("pw-wep-max"), 0, 0, 2, 1), at(byId("pw-thr-max"), 2, 0, 2, 1), at(byId("pw-shd-max"), 4, 0, 2, 1),
      lamp("life", "Life", "power", "life-support"),
      at(byId("pw-wep-level"), 0, 1, 2, 3), at(byId("pw-thr-level"), 2, 1, 2, 3), at(byId("pw-shd-level"), 4, 1, 2, 3),
      actionButton(ren("on"), "v_power_set_on", { label: "On", at: [6, 1], span: [2, 1] }),
      actionButton(ren("off"), "v_power_set_off", { label: "Off", at: [6, 2], span: [2, 1] }),
      at(byId("pw-wep-min"), 0, 4, 2, 1), at(byId("pw-thr-min"), 2, 4, 2, 1), at(byId("pw-shd-min"), 4, 4, 2, 1),
      lamp("quantum", "QT drive", "quantum-mode", "quantum-mode"),
      at(byId("pw-reset"), 0, 5, 4, 1), at(byId("pw-center"), 4, 5, 4, 1),
    ],
  };
}

// Shields as the HUD's shield cluster: tap a side to raise it (the game only raises a face,
// which lowers the others), the hull to balance them, the switch to turn them on or off.
function shieldBlock(pid, pos) {
  const c = JSON.parse(JSON.stringify(hud.panels.shields.elements.find((e) => e.type === "shields")));
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    if (typeof n.id === "string") n.id = `${pid}-${n.id}`;
    delete n.voice;
    for (const v of Object.values(n)) if (v && typeof v === "object") walk(v);
  })(c);
  delete c.size;
  return { ...c, span: [4, 6], at: pos };
}

// Short labels for the tall buttons beside a block (the narrow column cuts longer ones).
const TALL = { v_power_throttle_up: "Pwr +", v_power_throttle_down: "Pwr −", v_engineering_assignment_shields_increase: "Shld +", v_engineering_assignment_shields_decrease: "Shld −" };

// The game's pages in its own order (« » steps through them). view: the direct page action, or
// null. items: [scAction, label?] for what the page does.
const PAGES = [
  // The game's power throttle (F9 / F10) changed nothing in a live test, so it's left out.
  ["Power management", "resource_network", "rctrl+3", [["@power"]]],
  ["Weapon config", null, null, [
    ["v_set_guns_mode"], ["v_set_missile_mode"], ["v_weapon_launch_missile"], ["v_weapon_pip_toggle_lead_lag"],
    ["v_weapon_increase_max_missiles"], ["v_weapon_decrease_max_missiles"],
    ["v_engineering_assignment_weapons_increase"], ["v_engineering_assignment_weapons_decrease"],
  ]],
  // No switch column here: the shield cluster takes the room. Shld + needs free power (OUTPUT above 0).
  ["Shields", null, null, [["@shields"], ["v_engineering_assignment_shields_increase"], ["v_engineering_assignment_shields_decrease"]], { noSwitches: true }],
  ["Self status", "self_status", "rctrl+4", [
    ["v_weapon_countermeasure_decoy_launch"], ["v_weapon_countermeasure_noise_launch"], ["v_weapon_countermeasure_decoy_launch_panic"],
  ]],
  ["Target status", "target_status", "rctrl+5", [
    ["v_target_cycle_hostile_fwd"], ["v_target_cycle_attacker_fwd"], ["v_target_cycle_subitem_fwd"],
    ["v_target_toggle_pin_index_1"], ["v_target_unlock"], ["v_target_hail"],
  ]],
  ["Communications", "comms", "rctrl+6", [
    ["v_target_hail"], ["ui_notification_accept"], ["ui_notification_decline"], ["foip_cyclechannel"], ["foip_pushtotalk"],
    ["v_atc_request"], ["v_toggle_docking_request"],
  ]],
  ["Configuration", "configuration", "rctrl+9", [
    ["v_ifcs_speed_limiter_toggle"], ["v_ifcs_proximity_assist_toggle"], ["v_lights"], ["v_light_amplification_toggle"],
    ["v_ifcs_throttle_swap_mode"],
  ]],
  ["Diagnostics", "diagnostics", "rctrl+0", []],
  ["Scanning", "scanning", "rctrl+comma", [
    ["v_toggle_scan_mode"], ["v_invoke_ping"], ["v_scanning_trigger_scan"], ["v_inc_scan_focus_level"], ["v_dec_scan_focus_level"],
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

// A copy of an action's button: the HUD's (keys, state, lights) or the OWN entry.
function actionButton(id, scAction, extra = {}) {
  const h = hudButton(scAction);
  if (h) {
    const b = { type: "button", id, icon: h.icon, label: h.short || h.label, voice: false, keys: h.keys, scAction, mode: h.mode === "hold" ? "hold" : (h.mode || "tap"), labels: "show", ...extra };
    for (const k of ["state", "ms", "color", "whenOn"]) if (h[k]) b[k] = h[k];
    return b;
  }
  const own = OWN[scAction];
  if (!own) throw new Error(`no button for ${scAction}: add it to the HUD or to OWN`);
  const [label, icon, keys, more] = own;
  return { type: "button", id, icon, label, voice: false, keys, scAction, mode: "tap", labels: "show", ...more, ...extra };
}

function mfdLayout(side) {
  const n = SCREEN[side], tag = `${side}-mfd`;
  // Beside the display: the switch column; the page's buttons fill the other five columns two by
  // two. Left screen: switches on the right; right screen: on the left. (The game's MFD cursor
  // moves don't answer keys in 4.x, tested, so there's no column of moves.)
  const sw = side === "left" ? 5 : 0, c0 = side === "left" ? 0 : 1;
  const select = { keys: `rctrl+${n}`, scAction: `v_mfd_soft_select_mfd_${n}_short` };
  const onScreen = (id, label, icon, step, extra = {}) => ({
    type: "button", id: `${tag}-${id}`, icon, label, voice: false, ...select, ...(step ? { then: [step] } : {}), mode: "tap", labels: "show", ...extra,
  });
  const panels = {};
  PAGES.forEach(([title, view, viewKeys, items, opts = {}], p) => {
    const pid = `${tag}-${p + 1}`;
    // A page with a big block (power, shields): the block fills the page, or leaves one column
    // for its other two buttons, stacked tall.
    const block = items.length && items[0][0].startsWith("@");
    const x0 = opts.noSwitches ? 0 : c0, width = (opts.noSwitches ? 6 : 5) - (items.length > 1 ? 1 : 0);
    const elements = [
      ...(opts.noSwitches ? [] : SWITCHES[side]).map(([label, scAction, own], i) => {
        const from = hudButton(scAction);
        const b = from ? actionButton(`${pid}-sw-${label.toLowerCase()}`, scAction, { label }) : (() => {
          const { icon, keys, mode, state } = own;
          return { type: "button", id: `${pid}-sw-${label.toLowerCase()}`, icon, label, voice: false, keys, scAction, mode, labels: "show", ...(state ? { state } : {}) };
        })();
        return { ...b, span: [1, 1], at: [sw, i] };
      }),
      ...items.map(([scAction], i) => {
        if (scAction === "@power") return { ...powerBlock(pid, [x0, 0]), span: [width, 6] };
        if (scAction === "@shields") return { ...shieldBlock(pid, [x0, 0]), span: [width, 6] };
        if (block) return actionButton(`${pid}-${i + 1}`, scAction, { ...(TALL[scAction] ? { label: TALL[scAction] } : {}), span: [1, 3], at: [x0 + width, (i - 1) * 3] });
        return actionButton(`${pid}-${i + 1}`, scAction, { span: [2, 1] });
      }),
    ];
    // Each page has its own pair (ids are unique per layout); they send « / » after selecting the screen.
    const pager = {
      prev: onScreen(`${p + 1}-tab-back`, "Prev tab", "chev-left", { keys: "lalt+q", scAction: "v_mfd_interact_cycle_backwards_short" }),
      next: onScreen(`${p + 1}-tab-fwd`, "Next tab", "chev-right", { keys: "lalt+e", scAction: "v_mfd_interact_cycle_forwards_short" }),
    };
    const panel = { title, cols: 6, elements, pager };
    if (view) panel.enter = onScreen(`${p + 1}-enter`, title, "target", { keys: viewKeys, scAction: `v_mfd_select_view_${view}_short` });
    panels[pid] = english(panel);
  });
  for (const [id, panel] of Object.entries(hud.panels)) if (id !== "mfd") panels[id] = panel;
  return {
    name: side === "left" ? "Left MFD" : "Right MFD",
    notes: `Generated by tools/make-mfd-layouts.js from the HUD layout; edit that script, not this file. One tablet for the ${side} MFD (MFD ${n}): ` +
      "the left half is that screen page by page; its bottom arrows page the tablet and the game together. The right half is the HUD's.",
    grid: { ...hud.grid, halves: { left: Object.keys(panels).filter((id) => id.startsWith(`${tag}-`)), right: [...hud.grid.halves.right, ...hud.grid.halves.left.filter((p) => p !== "mfd")] } },
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
