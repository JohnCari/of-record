import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { INVITE_COOKIE, isInviteCode, mintInviteCookie } from "@/lib/invite";

/** The invite link lands here: /api/invite?code=... sets the cookie and returns to the workspace. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.INVITE_SECRET;
  const code = url.searchParams.get("code") ?? "";
  if (!secret || !isInviteCode(code, secret)) {
    return NextResponse.redirect(new URL("/?invite=invalid", url));
  }
  const { value, maxAge } = mintInviteCookie(secret);
  (await cookies()).set(INVITE_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
    maxAge,
  });
  return NextResponse.redirect(new URL("/", url));
}
