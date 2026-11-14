// Builds layouts/mfd-left.json and layouts/mfd-right.json from the HUD layout: one tablet
// per MFD. The left half opens on that screen's own panel, laid out like the screen in the
// cockpit: its switch column on the side the game puts it, the pages where the display is,
// the four-way moves under them and the page arrows (« ») in the bottom corners. The HUD's
// left panels follow; the right half is the HUD's.
//
//   node tools/make-mfd-layouts.js      (after editing layouts/hud.json)
//
// Every MFD button first selects its screen (left = MFD 1, right = MFD 2), then sends its
// page or move. Those actions are unbound in Star Citizen 4.10; the profile binds them on
// Right Ctrl, which the game's defaults leave free.
//
// The switch columns follow the player's ship as tested (the left screen carries the power
// column, the right one the flight column); other ships swap or change them, which a ship
// choice will handle later. Switches the game offers no key for (COOL, RADR, HIT: mouse only
// on the screen) are left out.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const hudText = fs.readFileSync(path.join(ROOT, "layouts", "hud.json"), "utf8");
const hud = JSON.parse(hudText);

const SCREEN = { left: 1, right: 2 };
const PAGES = [
  ["Power", "power", "rctrl+3", "resource_network", "green"],
  ["Self status", "power-shields", "rctrl+4", "self_status", "blue"],
  ["Target status", "target", "rctrl+5", "target_status", "amber"],
  ["Comms", "chat", "rctrl+6", "comms"],
  ["Configuration", "swap", "rctrl+9", "configuration"],
  ["Diagnostics", "power-reset", "rctrl+0", "diagnostics"],
  ["Scanning", "target", "rctrl+comma", "scanning"],
  ["IFCS", "speed", "rctrl+period", "ifcs"],
];
// [label, scAction, own button when the HUD has none]. The rest copy the HUD's button for
// that action (same keys and state group), so their lights agree with it.
const SWITCHES = {
  left: [
    ["PWR", "v_power_toggle"], ["WPN", "v_power_toggle_weapons"], ["THR", "v_power_toggle_thrusters"],
    ["SHLD", "v_power_toggle_shields"], ["CPLD", "v_ifcs_vector_decoupling_toggle"], ["ESP", "v_ifcs_toggle_esp"],
    ["LOCK", "v_lock_rotation", { icon: "lock", keys: "rshift", mode: "tap", state: { group: "lock-rotation" } }],
  ],
  right: [
    ["QTM", "v_set_quantum_mode"],
    ["PROX", "v_ifcs_proximity_assist_toggle", { icon: "target", keys: "rctrl+z", mode: "tap", state: { group: "proximity-assist" } }],
    ["MISL", "v_set_missile_mode"], ["VTOL", "v_vtol_toggle"], ["GEAR", "v_toggle_landing_system"], ["GSAF", "v_ifcs_toggle_gforce_safety"],
  ],
};

// The HUD's first button for an action, or null.
function hudButton(scAction) {
  let found = null;
  (function walk(node) {
    if (found || !node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node.id === "string" && typeof node.keys === "string" && node.scAction === scAction) { found = node; return; }
    Object.values(node).forEach(walk);
  })(hud.panels);
  return found;
}

function mfdLayout(side) {
  const n = SCREEN[side], tag = `${side}-mfd`;
  // The switch column sits beside the display: right of the left screen, left of the right one.
  const sw = side === "left" ? 5 : 0, x0 = side === "left" ? 0 : 1; // switch column, display's first column
  const select = { keys: `rctrl+${n}`, scAction: `v_mfd_soft_select_mfd_${n}_short` };
  const onScreen = (id, label, icon, step, extra = {}) => ({
    type: "button", id: `${tag}-${id}`, icon, label, voice: false, ...select, then: [step], mode: "tap", labels: "show", ...extra,
  });
  const move = (dir, icon, at) => onScreen(`move-${dir}`, dir[0].toUpperCase() + dir.slice(1), icon,
    { keys: { up: "rctrl+e", down: "rctrl+x", left: "rctrl+a", right: "rctrl+d" }[dir], scAction: `v_mfd_movement_${dir}_short` },
    { span: [1, 1], labels: "hide", at });
  const elements = [
    // The display: the eight pages two by two, Self Repair All and Select on the column
    // between them and the switches.
    ...PAGES.map(([label, icon, keys, view, color]) =>
      onScreen(view, label, icon, { keys, scAction: `v_mfd_select_view_${view}_short` }, { span: [2, 1], ...(color ? { color } : {}) })),
    onScreen("repair", "Repair", "power-reset", { keys: "rctrl+q", scAction: "v_mfd_quick_action_repair_all" },
      { span: [1, 2], color: "amber", labels: "hide", at: [side === "left" ? 4 : 1, 0] }),
    { type: "button", id: `${tag}-select`, icon: "target", label: "Select", voice: false,
      ...select, mode: "tap", span: [1, 2], labels: "hide", color: "blue", at: [side === "left" ? 4 : 1, 2] },
    // The switch column.
    ...SWITCHES[side].map(([label, scAction, own], i) => {
      const from = hudButton(scAction) || own;
      if (!from) throw new Error(`layouts/hud.json has no button for ${scAction}`);
      const { icon, state, keys, mode, ms, color, whenOn } = from;
      const b = { type: "button", id: `${tag}-sw-${label.toLowerCase()}`, icon, label, voice: false, keys, scAction, mode, span: [1, 1], labels: "show", at: [sw, i] };
      if (state) b.state = state;
      if (ms) b.ms = ms;
      if (color) b.color = color;
      if (whenOn) b.whenOn = whenOn;
      return b;
    }),
    // Moves as a cross under the display, the page arrows in its bottom corners as in the game.
    move("up", "chev-up", [x0 + 2, 4]), move("left", "chev-left", [x0 + 1, 5]),
    move("right", "chev-right", [x0 + 3, 5]), move("down", "chev-down", [x0 + 2, 6]),
    onScreen("tab-back", "Prev tab", "chev-left", { keys: "lalt+q", scAction: "v_mfd_interact_cycle_backwards_short" }, { span: [1, 1], labels: "hide", at: [x0, 7] }),
    onScreen("tab-fwd", "Next tab", "chev-right", { keys: "lalt+e", scAction: "v_mfd_interact_cycle_forwards_short" }, { span: [1, 1], labels: "hide", at: [x0 + 4, 7] }),
  ];
  const panels = { [tag]: { title: side === "left" ? "Left MFD" : "Right MFD", cols: 6, elements } };
  for (const [id, panel] of Object.entries(hud.panels)) if (id !== "mfd") panels[id] = panel;
  return {
    name: side === "left" ? "Left MFD" : "Right MFD",
    notes: `Generated by tools/make-mfd-layouts.js from the HUD layout; edit that script, not this file. One tablet for the ${side} MFD (MFD ${n}): ` +
      "its panel opens the left half, laid out like the screen in the cockpit; the HUD's panels follow. One way only: a page picked in the game doesn't show here.",
    grid: { ...hud.grid, halves: { left: [tag, ...hud.grid.halves.left.filter((p) => p !== "mfd")], right: hud.grid.halves.right } },
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
