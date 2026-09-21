import { cookies } from "next/headers";
import { INVITE_COOKIE, isValidInviteCookie } from "../invite";

/** True when the request carries a valid invite cookie. Every mutating route checks this first. */
export async function isInvited(): Promise<boolean> {
  const secret = process.env.INVITE_SECRET;
  if (!secret) return false;
  return isValidInviteCookie((await cookies()).get(INVITE_COOKIE)?.value, secret);
}

export const NOT_INVITED = Response.json(
  {
    error: "This demo runs live models, so it needs the invite link. Open the link you were sent.",
  },
  { status: 401 },
);
