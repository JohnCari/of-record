// Deletes a matter's sources, passages and drafts from Convex. Used to retire a case file
// once another has replaced it.   node --import tsx scripts/purge-matter.mts <matterId>
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const [matterId] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const secret = process.env.SERVER_SECRET;
if (!matterId || !url || !secret)
  throw new Error(
    "usage: purge-matter <matterId>, with NEXT_PUBLIC_CONVEX_URL and SERVER_SECRET set",
  );

const convex = new ConvexHttpClient(url);
let rows = 0;
for (;;) {
  const result = await convex.mutation(api.knowledge.purgeMatter, { secret, matterId });
  rows += result.deleted;
  if (result.done) break;
}
let drafts = 0;
while (await convex.mutation(api.drafts.purgeOne, { secret, matterId })) drafts += 1;
console.log(`purged "${matterId}": ${rows} sources and passages, ${drafts} drafts`);
