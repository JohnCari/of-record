/** The cases this browser attached. Kept here so an attached case is not listed to everyone. */
const OWN_CASES = "rossrecall.cases";

export function readOwnCases(): string[] {
  try {
    return JSON.parse(localStorage.getItem(OWN_CASES) ?? "[]");
  } catch {
    return [];
  }
}

export function writeOwnCases(ids: string[]) {
  try {
    localStorage.setItem(OWN_CASES, JSON.stringify(ids));
  } catch {}
}
