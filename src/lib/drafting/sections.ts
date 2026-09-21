// Kept free of server imports so the browser can use it too.
export const MATTER_ID = "cottonwood-v-tumbleweed";

export const MATTER_CAPTION =
  "Cottonwood Gulch Fabrication LLC v. Tumbleweed Ridge Outfitters Inc.";

export const SECTIONS = [
  { id: "facts", title: "Statement of Undisputed Material Facts" },
  { id: "standard", title: "Summary Judgment Standard" },
  { id: "argument", title: "Argument" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
