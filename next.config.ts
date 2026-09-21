import { withEve } from "eve/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

// Runs the eve agent in agent/ beside Next.js: one dev command, one Vercel deployment, and
// same-origin /eve/v1/* routes so the browser needs no CORS and no agent URL.
export default withEve(nextConfig);
