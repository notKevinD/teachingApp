import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit, requireSameOrigin } from "@/lib/security";

const schema = z.object({
  username: z.string().min(1).max(80),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, "teacher-login", 8, 60_000);
    if (limited) return limited;
    await requireSameOrigin();
    const { username, password } = schema.parse(await request.json());

    const teacher = await getPrisma().teacher.findUnique({ where: { username } });
    if (!teacher) {
      await audit("auth.teacher_login_failed", null, { username });
      return NextResponse.json({ error: "Login guru tidak valid." }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, teacher.passwordHash);
    if (!valid) {
      await audit("auth.teacher_login_failed", null, { username });
      return NextResponse.json({ error: "Login guru tidak valid." }, { status: 401 });
    }

    await setSessionCookie({ sub: teacher.id, role: "teacher", name: teacher.name });
    await audit("auth.teacher_login_success", { sub: teacher.id, role: "teacher", name: teacher.name });
    return NextResponse.json({ role: "teacher", name: teacher.name });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof Error && error.message.includes("origin") ? 403 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Teacher login failed" }, { status });
  }
}
