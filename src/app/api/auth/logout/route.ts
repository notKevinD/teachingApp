import { NextResponse } from "next/server";
import { clearSessionCookie, getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { requireSameOrigin } from "@/lib/security";

export async function POST() {
  await requireSameOrigin();
  const session = await getSession();
  await clearSessionCookie();
  await audit("auth.logout", session);
  return NextResponse.json({ ok: true });
}
