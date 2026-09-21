// Kept free of server imports so the browser can use it too.
export const MATTER_ID = "granite-v-alberta";

export const MATTER_CAPTION = "Granite Southlands Town Center, LLC v. Alberta Town Center, LLC";
export const MATTER_COURT = "United States District Court for the District of Colorado";
export const MATTER_DOCKET = "No. 1:09-cv-00799";
export const MATTER_URL =
  "https://www.courtlistener.com/docket/4195314/granite-southlands-town-center-llc-v-alberta-town-center-llc/";

export const MOTION_TITLE = "Plaintiff's Motion for Summary Judgment";

export const SECTIONS = [
  { id: "facts", title: "Statement of Undisputed Material Facts" },
  { id: "standard", title: "Legal Standard" },
  { id: "argument", title: "Argument" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
