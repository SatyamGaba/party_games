import { createLucideIcon, type LucideIconNode } from "lucide-react";

// Side-profile chameleon on a branch, drawn in Lucide style (24x24, stroke only).
// Lucide icon nodes are flat (no nested <g>), so the green tint lives in CSS
// (.lucide-chameleon), which applies wherever the icon is shown.
const chameleonNode: LucideIconNode[] = [
  // Arched back, casqued head and jaw back to the hip.
  ["path", { d: "M7 13.5C7.5 10 10 7.5 14 7.5L17.5 5L22.5 10.5L19.5 13C15.5 14.8 10 14.8 7 13.5", key: "body" }],
  // Tail curling into a spiral.
  ["path", { d: "M7 13.5C4.5 13 2.5 14 2.5 16.5A2.5 2.5 0 0 0 7.5 16.5A1.25 1.25 0 0 0 5 16.5", key: "tail" }],
  ["path", { d: "M10.5 14.6 9.5 19.5", key: "back-leg" }],
  ["path", { d: "M16.5 14 17.5 19.5", key: "front-leg" }],
  // Branch.
  ["path", { d: "M8 19.5h14", key: "branch" }],
  // Bulging eye and pupil.
  ["circle", { cx: "18.2", cy: "9.6", r: "2.2", key: "eye" }],
  ["path", { d: "M18.2 9.6h.01", key: "pupil" }],
];

export const Chameleon = createLucideIcon("chameleon", chameleonNode);
