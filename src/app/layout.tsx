import type { Metadata } from "next";
import { IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import { AppHeader } from "@/components/app-header";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { Providers } from "./providers";
import "./globals.css";

// Plex for the interface; Source Serif for anything that is, or quotes, a legal document.
const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
  display: "swap",
});
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: `${APP_TAGLINE} A litigation drafting demo on a real federal case, with every sentence checked against the record and the cited opinion.`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plex.variable} ${sourceSerif.variable} h-full antialiased`}>
      <body className="flex h-full flex-col font-sans">
        <Providers>
          <AppHeader />
          <main className="min-h-0 flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
