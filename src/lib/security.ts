import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(request: Request | NextRequest, key: string, limit = 30, windowMs = 60_000) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const id = `${key}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(id);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(id, { count: 1, resetAt: now + windowMs });
    return null;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return NextResponse.json({ error: "Terlalu banyak request. Coba lagi sebentar." }, { status: 429 });
  }
  return null;
}

export async function requireSameOrigin() {
  const headerStore = await headers();
  const origin = headerStore.get("origin");
  const host = headerStore.get("host");
  if (!origin || !host) return;
  const allowedOrigin = process.env.PUBLIC_APP_URL || `https://${host}`;
  const localOrigin = `http://${host}`;
  if (origin !== allowedOrigin && origin !== localOrigin) {
    throw new Error("Invalid request origin.");
  }
}
