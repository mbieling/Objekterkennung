// src/middleware.ts
// HTTP Basic Auth für den Admin-Katalog und alle schreibenden Admin-API-Routen.
// Passwort wird aus ADMIN_PASSWORD (.env.local / .env) gelesen — niemals hardcoden.
// Edge-Runtime: benutzt atob (kein Buffer verfügbar).

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const REALM = "Objekterkennung Admin";

function requiresAuth(req: NextRequest): boolean {
  const { pathname } = req.nextUrl;
  // Admin-Seite (Katalog) und alle Unterrouten
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  // Admin-API: schreibende Operationen auf Bauteilen
  const method = req.method;
  if (
    method === "POST" &&
    /^\/api\/parts\/[^/]+\/(archive|retry)\/?$/.test(pathname)
  ) {
    return true;
  }
  if (
    (method === "PATCH" || method === "DELETE") &&
    /^\/api\/parts\/[^/]+\/?$/.test(pathname)
  ) {
    return true;
  }
  return false;
}

function isAuthorized(authHeader: string | null): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  // Fail-closed: kein Passwort konfiguriert → kein Zugriff
  if (!expected) return false;
  if (!authHeader || !authHeader.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(authHeader.slice(6));
  } catch {
    return false;
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return false;
  const password = decoded.slice(sep + 1);
  return password === expected;
}

export function middleware(req: NextRequest) {
  if (!requiresAuth(req)) return NextResponse.next();
  if (isAuthorized(req.headers.get("authorization"))) {
    return NextResponse.next();
  }
  return new NextResponse("Authentifizierung erforderlich", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
    },
  });
}

// Matcher: Middleware läuft nur auf relevanten Pfaden — sonst Bypass per CDN.
export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/parts/:path*"],
};
