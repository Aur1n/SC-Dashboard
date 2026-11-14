// Builds layouts/mfd-left.json and layouts/mfd-right.json from the HUD layout: one tablet
// per MFD. The left half opens on that screen's own panel (its pages, the cockpit switches
// the game shows beside an MFD, moves, and the page tabs at the bottom), followed by the
// HUD's left panels; the right half is the HUD's.
//
//   node tools/make-mfd-layouts.js      (after editing layouts/hud.json)
//
// Every MFD button first selects its screen (left = MFD 1, right = MFD 2), then sends its
// page or move. Those actions are unbound in Star Citizen 4.10; the profile binds them on
// Right Ctrl, which the game's defaults leave free.
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
// The switches Star Citizen lists beside its MFDs, by the game's own short names. Each is a
// copy of the HUD's button for that action (same keys and state group, so the lights agree).
const SWITCHES = [
  ["QTM", "v_set_quantum_mode"], ["MISL", "v_set_missile_mode"], ["VTOL", "v_vtol_toggle"],
  ["GEAR", "v_toggle_landing_system"], ["GSAF", "v_ifcs_toggle_gforce_safety"], ["PING", "v_invoke_ping"],
  ["PWR", "v_power_toggle"], ["WPN", "v_power_toggle_weapons"], ["THR", "v_power_toggle_thrusters"],
  ["SHLD", "v_power_toggle_shields"], ["CPLD", "v_ifcs_vector_decoupling_toggle"], ["ESP", "v_ifcs_toggle_esp"],
];

// The HUD's first button for an action.
function hudButton(scAction) {
  let found = null;
  (function walk(node) {
    if (found || !node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node.id === "string" && typeof node.keys === "string" && node.scAction === scAction) { found = node; return; }
    Object.values(node).forEach(walk);
  })(hud.panels);
  if (!found) throw new Error(`layouts/hud.json has no button for ${scAction}`);
  return found;
}

function mfdLayout(side) {
  const n = SCREEN[side], tag = `${side}-mfd`;
  const select = { keys: `rctrl+${n}`, scAction: `v_mfd_soft_select_mfd_${n}_short` };
  const onScreen = (id, label, icon, step, extra = {}) => ({
    type: "button", id: `${tag}-${id}`, icon, label, voice: false, ...select, then: [step], mode: "tap", labels: "show", ...extra,
  });
  const move = (dir, label, icon) => onScreen(`move-${dir}`, label, icon, { keys: { up: "rctrl+e", down: "rctrl+x", left: "rctrl+a", right: "rctrl+d" }[dir], scAction: `v_mfd_movement_${dir}_short` }, { span: [1, 1], labels: "hide" });
  // Headers start a new row, so each group keeps together however many columns the screen
  // gives the half (6 on a tablet, up to 12 on a wide monitor).
  const head = (id, text) => ({ type: "header", id: `${tag}-head-${id}`, text });
  const elements = [
    ...PAGES.map(([label, icon, keys, view, color]) =>
      onScreen(view, label, icon, { keys, scAction: `v_mfd_select_view_${view}_short` }, { span: [2, 1], ...(color ? { color } : {}) })),
    onScreen("repair", "Self Repair All", "power-reset", { keys: "rctrl+q", scAction: "v_mfd_quick_action_repair_all" }, { span: [2, 1], color: "amber" }),
    head("switches", "Switches"),
    ...SWITCHES.map(([label, scAction]) => {
      const { icon, state, keys, mode, ms, color, whenOn } = hudButton(scAction);
      const b = { type: "button", id: `${tag}-sw-${label.toLowerCase()}`, icon, label, voice: false, keys, scAction, mode, span: [1, 1], labels: "show" };
      if (state) b.state = state;
      if (ms) b.ms = ms;
      if (color) b.color = color;
      if (whenOn) b.whenOn = whenOn;
      return b;
    }),
    move("left", "Left", "chev-left"), move("up", "Up", "chev-up"), move("down", "Down", "chev-down"), move("right", "Right", "chev-right"),
    { type: "button", id: `${tag}-select`, icon: "target", label: side === "left" ? "Select left MFD" : "Select right MFD", voice: false, ...select, mode: "tap", span: [2, 1], labels: "show", color: "blue" },
    onScreen("tab-back", "Prev tab", "chev-left", { keys: "lalt+q", scAction: "v_mfd_interact_cycle_backwards_short" }, { span: [3, 1] }),
    onScreen("tab-fwd", "Next tab", "chev-right", { keys: "lalt+e", scAction: "v_mfd_interact_cycle_forwards_short" }, { span: [3, 1] }),
  ];
  const panels = { [tag]: { title: side === "left" ? "Left MFD" : "Right MFD", cols: 6, elements } };
  for (const [id, panel] of Object.entries(hud.panels)) if (id !== "mfd") panels[id] = panel;
  return {
    name: side === "left" ? "Left MFD" : "Right MFD",
    notes: `Generated by tools/make-mfd-layouts.js from the HUD layout; edit that script, not this file. One tablet for the ${side} MFD (MFD ${n}): ` +
      "its panel opens the left half, the HUD's panels follow. One way only: a page picked in the game doesn't show here.",
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
