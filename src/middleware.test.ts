// src/middleware.test.ts
// Unit-Tests für die Admin-Auth-Middleware.
// Geprüft werden Pfad-/Methoden-Filter und die Basic-Auth-Header-Auswertung —
// nicht der Edge-Runtime-Stack (NextRequest/Response).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function makeReq(
  pathname: string,
  init: { method?: string; authorization?: string } = {},
): NextRequest {
  const headers = new Headers();
  if (init.authorization) headers.set("authorization", init.authorization);
  return new NextRequest(`http://localhost${pathname}`, {
    method: init.method ?? "GET",
    headers,
  });
}

function basic(password: string, user = "admin"): string {
  return `Basic ${btoa(`${user}:${password}`)}`;
}

describe("middleware (Admin Basic Auth)", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD = "test-secret";
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = saved;
  });

  it("lässt nicht-geschützte Pfade durch", async () => {
    const res = await middleware(makeReq("/search"));
    expect(res.status).toBe(200);
  });

  it("erfordert Auth auf /admin", async () => {
    const res = await middleware(makeReq("/admin"));
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toMatch(/^Basic realm=/);
  });

  it("akzeptiert korrektes Passwort auf /admin", async () => {
    const res = await middleware(
      makeReq("/admin", { authorization: basic("test-secret") }),
    );
    expect(res.status).toBe(200);
  });

  it("lehnt falsches Passwort ab", async () => {
    const res = await middleware(
      makeReq("/admin", { authorization: basic("wrong") }),
    );
    expect(res.status).toBe(401);
  });

  it("schützt POST /api/parts/[id]/archive", async () => {
    const path = "/api/parts/123e4567-e89b-12d3-a456-426614174000/archive";
    const open = await middleware(makeReq(path, { method: "POST" }));
    expect(open.status).toBe(401);
    const auth = await middleware(
      makeReq(path, { method: "POST", authorization: basic("test-secret") }),
    );
    expect(auth.status).toBe(200);
  });

  it("schützt POST /api/parts/[id]/retry", async () => {
    const path = "/api/parts/123e4567-e89b-12d3-a456-426614174000/retry";
    const res = await middleware(makeReq(path, { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("schützt PATCH und DELETE auf /api/parts/[id]", async () => {
    const path = "/api/parts/123e4567-e89b-12d3-a456-426614174000";
    const patch = await middleware(makeReq(path, { method: "PATCH" }));
    const del = await middleware(makeReq(path, { method: "DELETE" }));
    expect(patch.status).toBe(401);
    expect(del.status).toBe(401);
  });

  it("lässt GET /api/parts und GET /api/parts/[id] offen", async () => {
    const list = await middleware(makeReq("/api/parts"));
    const detail = await middleware(
      makeReq("/api/parts/123e4567-e89b-12d3-a456-426614174000"),
    );
    expect(list.status).toBe(200);
    expect(detail.status).toBe(200);
  });

  it("lässt GET-Subrouten offen (status, thumbnail, download)", async () => {
    const status = await middleware(
      makeReq("/api/parts/123e4567-e89b-12d3-a456-426614174000/status"),
    );
    const thumb = await middleware(
      makeReq("/api/parts/123e4567-e89b-12d3-a456-426614174000/thumbnail"),
    );
    const dl = await middleware(
      makeReq("/api/parts/123e4567-e89b-12d3-a456-426614174000/download"),
    );
    expect(status.status).toBe(200);
    expect(thumb.status).toBe(200);
    expect(dl.status).toBe(200);
  });

  it("blockiert wenn ADMIN_PASSWORD fehlt (fail-closed)", async () => {
    delete process.env.ADMIN_PASSWORD;
    const res = await middleware(
      makeReq("/admin", { authorization: basic("anything") }),
    );
    expect(res.status).toBe(401);
  });

  it("akzeptiert Basic-Auth ohne Username", async () => {
    const res = await middleware(
      makeReq("/admin", { authorization: `Basic ${btoa(":test-secret")}` }),
    );
    expect(res.status).toBe(200);
  });

  it("ignoriert kaputten Basic-Header", async () => {
    const res = await middleware(
      makeReq("/admin", { authorization: "Basic not-base64@@@" }),
    );
    expect(res.status).toBe(401);
  });
});
