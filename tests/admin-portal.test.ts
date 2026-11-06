import { describe, it, expect } from "vitest";
import { POST as handleLoginPost } from "@/app/api/admin/auth/login/route";
import { POST as handleLogoutPost } from "@/app/api/admin/auth/logout/route";
import { GET as handleMeGet } from "@/app/api/admin/auth/me/route";
import { GET as handleDataGet } from "@/app/api/admin/data/route";
import { GET as handleExportGet } from "@/app/api/admin/export/route";
import { ADMIN_COOKIE_NAME, createAdminToken } from "@/lib/admin-auth";
import { NextRequest } from "next/server";

function createJsonRequest(url: string, method: string, body?: any, cookieToken?: string): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookieToken) {
    headers["Cookie"] = `${ADMIN_COOKIE_NAME}=${cookieToken}`;
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Admin Portal Authentication & Data Export", () => {
  it("rejects unauthorized emails", async () => {
    const req = createJsonRequest("http://localhost:3000/api/admin/auth/login", "POST", {
      email: "hacker@gmail.com",
      password: "LULUSSEMESTERINI",
    });
    const res = await handleLoginPost(req);
    expect(res.status).toBe(401);
  });

  it("rejects incorrect password", async () => {
    const req = createJsonRequest("http://localhost:3000/api/admin/auth/login", "POST", {
      email: "aruanregina@gmail.com",
      password: "WRONGPASSWORD",
    });
    const res = await handleLoginPost(req);
    expect(res.status).toBe(401);
  });

  it("allows login for aruanregina@gmail.com with password LULUSSEMESTERINI", async () => {
    const req = createJsonRequest("http://localhost:3000/api/admin/auth/login", "POST", {
      email: "aruanregina@gmail.com",
      password: "LULUSSEMESTERINI",
    });
    const res = await handleLoginPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.email).toBe("aruanregina@gmail.com");

    const cookie = res.cookies.get(ADMIN_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBeDefined();
  });

  it("allows login for alfian.firja@gmail.com with password LULUSSEMESTERINI", async () => {
    const req = createJsonRequest("http://localhost:3000/api/admin/auth/login", "POST", {
      email: "alfian.firja@gmail.com",
      password: "LULUSSEMESTERINI",
    });
    const res = await handleLoginPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.email).toBe("alfian.firja@gmail.com");
  });

  it("protects /api/admin/data from unauthenticated requests", async () => {
    const req = createJsonRequest("http://localhost:3000/api/admin/data", "GET");
    const res = await handleDataGet(req);
    expect(res.status).toBe(401);
  });

  it("allows authenticated admin to fetch database statistics & participants", async () => {
    const token = createAdminToken("aruanregina@gmail.com");
    const req = createJsonRequest("http://localhost:3000/api/admin/data", "GET", undefined, token);
    const res = await handleDataGet(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.stats).toBeDefined();
    expect(data.stats.cellStats).toBeDefined();
    expect(data.stats.cellStats.length).toBe(8);
    expect(Array.isArray(data.participants)).toBe(true);
  });

  it("allows authenticated admin to export Excel (.xlsx) file with multi-sheets", async () => {
    const token = createAdminToken("alfian.firja@gmail.com");
    const req = createJsonRequest("http://localhost:3000/api/admin/export?format=xlsx", "GET", undefined, token);
    const res = await handleExportGet(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("content-disposition")).toContain(".xlsx");
  });

  it("allows authenticated admin to export CSV file with BOM", async () => {
    const token = createAdminToken("aruanregina@gmail.com");
    const req = createJsonRequest("http://localhost:3000/api/admin/export?format=csv", "GET", undefined, token);
    const res = await handleExportGet(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain("ID Partisipan");
    expect(text).toContain("PART-");
  });

  it("logs out and clears admin session cookie", async () => {
    const res = await handleLogoutPost();
    expect(res.status).toBe(200);
    const cookie = res.cookies.get(ADMIN_COOKIE_NAME);
    expect(cookie?.value).toBe("");
  });
});
