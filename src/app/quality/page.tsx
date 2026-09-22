import { redirect } from "next/navigation";

/** The numbers moved onto How it works. Old links still land on them. */
export default function QualityPage() {
  redirect("/how-it-works#accuracy");
}
