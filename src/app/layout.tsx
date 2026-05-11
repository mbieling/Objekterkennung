import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Bauteil-Finder",
  description: "CAD-Bauteile per Kamera geometrisch ähnliche Teile finden",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3 group">
              <Image
                src="/bbs-logo.svg"
                alt="BBS Automation Stuttgart"
                width={156}
                height={80}
                priority
                className="h-10 w-auto"
              />
              <span className="hidden sm:flex items-center text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors pl-3 border-l border-border h-6">
                Objekterkennung
              </span>
            </Link>
            <nav className="flex items-center gap-1 sm:gap-2 text-sm">
              <Link
                href="/upload"
                className="px-3 py-2 rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                Hochladen
              </Link>
              <Link
                href="/search"
                className="px-3 py-2 rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                Suchen
              </Link>
              <Link
                href="/admin"
                className="px-3 py-2 rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                Katalog
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-border bg-card mt-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 text-center text-sm text-muted-foreground">
            © 2025 BBS Automation Stuttgart GmbH · Objekterkennung
          </div>
        </footer>

        <Toaster />
      </body>
    </html>
  );
}
