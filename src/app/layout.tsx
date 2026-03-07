import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

const LEAGUE_NAME = process.env.NEXT_PUBLIC_LEAGUE_NAME ?? "Peer Pressure";
const TAGLINE = process.env.NEXT_PUBLIC_LEAGUE_TAGLINE ?? "Dynasty Superflex PPR • Sleeper League";
const LOGO_URL = process.env.NEXT_PUBLIC_LOGO_URL ?? "/peer-pressure-logo.png";

// Lions defaults (override per project if you want)
const PRIMARY = process.env.NEXT_PUBLIC_PRIMARY_COLOR ?? "#0076B6";
const ACCENT = process.env.NEXT_PUBLIC_ACCENT_COLOR ?? "#B0B7BC";

export const metadata: Metadata = {
  title: LEAGUE_NAME,
  description: "Weekly recaps, trades, and power rankings",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen text-slate-900 antialiased">
        <header className="border-b border-slate-200/60 bg-white/70 backdrop-blur">
          <div className="header-band">
            <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-7 md:flex-row md:items-center md:justify-between">
              <Link href="/" className="flex items-center gap-4">
                <img
                  src={LOGO_URL}
                  alt={LEAGUE_NAME}
                  className="h-28 w-28 rounded-2xl bg-white object-cover shadow-lg md:h-36 md:w-36 mt-2"
                />
                <div className="relative z-10">
                  <div className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">
                    {LEAGUE_NAME}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white/90 md:text-base">
                    {TAGLINE}
                  </div>
                </div>
              </Link>

              <nav className="flex flex-wrap gap-2">
                <Link href="/weeks" className="nav-pill">
                  Weekly Recaps
                </Link>
                <Link href="/teams" className="nav-pill">
                  Teams
                </Link>
                <Link href="/power-rankings" className="nav-pill">
                  Power Rankings
                </Link>
              </nav>
            </div>
          </div>

          <div className="h-1 w-full" style={{ background: ACCENT }} />
        </header>

        <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
      </body>
    </html>
  );
}


