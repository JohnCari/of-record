// Kept free of server imports so the browser can use it too.

/** The case prepared in advance, the one every visitor can draft. */
export const MATTER_ID = "granite-v-alberta";

/** Where the opinions live. One library, shared by every case. */
export const LAW_LIBRARY_ID = "law";

export const SECTIONS = [
  { id: "facts", title: "Statement of Undisputed Material Facts" },
  { id: "standard", title: "Legal Standard" },
  { id: "argument", title: "Argument" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
