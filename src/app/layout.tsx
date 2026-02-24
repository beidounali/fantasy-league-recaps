import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Peer Pressure Fantasy Football League",
  description: "Weekly recaps, trades, and power rankings",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        {/* HERO HEADER */}
        <header className="border-b border-slate-200 bg-white">
          <div className="bg-[#0076B6]">
            <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 md:flex-row md:items-center md:justify-between">
              <Link href="/" className="flex items-center gap-4">
                <img
                  src="/peer-pressure-logo.png"
                  alt="Peer Pressure"
                  className="h-20 w-20 rounded-2xl bg-white object-cover shadow-md md:h-24 md:w-24"
                />
                <div>
                  <div className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">
                    Peer Pressure
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white/90 md:text-base">
                    Dynasty Superflex PPR • Sleeper League
                  </div>
                </div>
              </Link>

              <nav className="flex flex-wrap gap-2">
                <Link
                  href="/weeks"
                  className="rounded-lg bg-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/25"
                >
                  Weekly Recaps
                </Link>
                <Link
                  href="/teams"
                  className="rounded-lg bg-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/25"
                >
                  Teams
                </Link>
                <Link
                  href="/power-rankings"
                  className="rounded-lg bg-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/25"
                >
                  Power Rankings
                </Link>
              </nav>
            </div>
          </div>

          {/* silver accent bar */}
          <div className="h-1 w-full bg-[#B0B7BC]" />
        </header>

        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}



