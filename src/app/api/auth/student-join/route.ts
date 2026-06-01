import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth";
import { getAppData } from "@/lib/server-data";
import { uid } from "@/lib/class-data";
import { audit } from "@/lib/audit";
import { rateLimit, requireSameOrigin } from "@/lib/security";

const schema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(3).max(40),
});

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, "student-join", 20, 60_000);
    if (limited) return limited;
    await requireSameOrigin();
    const { name, code } = schema.parse(await request.json());
    const cleanName = name.trim();
    const cleanCode = code.trim().toUpperCase();

    const prisma = getPrisma();
    const session = await prisma.classSession.findFirst({
      where: { code: cleanCode, NOT: { status: "closed" } },
    });
    if (!session) {
      await audit("auth.student_join_failed", null, { code: cleanCode });
      return NextResponse.json({ error: "Kode kelas tidak valid atau sesi sudah ditutup." }, { status: 400 });
    }

    const student = await prisma.student.upsert({
      where: { name: cleanName },
      update: { status: "active", attendance: "present", level: session.level },
      create: {
        id: uid("student"),
        name: cleanName,
        level: session.level,
        status: "active",
        attendance: "present",
      },
    });

    await setSessionCookie({ sub: student.id, role: "student", name: student.name, sessionId: session.id });
    await audit("auth.student_join_success", { sub: student.id, role: "student", name: student.name, sessionId: session.id });
    return NextResponse.json(await getAppData());
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof Error && error.message.includes("origin") ? 403 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Student join failed" }, { status });
  }
}
