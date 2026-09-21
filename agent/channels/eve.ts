import { type AuthFn, localDev, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { INVITE_COOKIE, isValidInviteCookie, readCookie } from "../../src/lib/invite";

/**
 * Admits a browser that holds a valid invite cookie. The cookie is minted by /api/invite from the
 * code in the invite link. There are no accounts in this demo; the link is the credential, and it
 * keeps a public URL from becoming a free model endpoint.
 */
function invited(): AuthFn<Request> {
  return async (request) => {
    const secret = process.env.INVITE_SECRET;
    if (!secret) return null;
    const cookie = readCookie(request.headers.get("cookie"), INVITE_COOKIE);
    if (!isValidInviteCookie(cookie, secret)) return null;
    return {
      attributes: {},
      authenticator: "invite",
      principalId: "invited-attorney",
      principalType: "user",
    };
  };
}

export default eveChannel({
  auth: [invited(), vercelOidc(), localDev()],
});
