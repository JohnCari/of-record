import type { Metadata } from "next";
import { SignedDrafts } from "@/components/signed-drafts";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Signed drafts, ${APP_NAME}` };

export default function SignedPage() {
  return <SignedDrafts />;
}
