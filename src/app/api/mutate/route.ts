import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getAppData } from "@/lib/server-data";
import { initialData, uid } from "@/lib/class-data";
import { getSession, requireStudent, requireTeacher } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { audit } from "@/lib/audit";
import { rateLimit, requireSameOrigin } from "@/lib/security";

type MutationBody =
  | { action: "reset" }
  | { action: "studentFocus"; studentId: string; focusDelta: number; awayDelta: number; status: "active" | "away" | "offline"; pointsDelta?: number }
  | { action: "sessionCreate"; title: string; code: string }
  | { action: "sessionPatch"; id: string; patch: { status?: "draft" | "live" | "closed"; activeMaterialId?: string } }
  | { action: "questionCreate"; term: string; answer: string }
  | { action: "materialCreate"; title: string; body: string }
  | { action: "rewardCreate"; name: string; cost: number }
  | { action: "redeem"; studentId: string; rewardId: string };

const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset") }),
  z.object({ action: z.literal("studentFocus"), studentId: z.string().min(1), focusDelta: z.number(), awayDelta: z.number(), status: z.enum(["active", "away", "offline"]), pointsDelta: z.number().optional() }),
  z.object({ action: z.literal("sessionCreate"), title: z.string().min(1).max(160), code: z.string().min(3).max(40) }),
  z.object({ action: z.literal("sessionPatch"), id: z.string().min(1), patch: z.object({ status: z.enum(["draft", "live", "closed"]).optional(), activeMaterialId: z.string().optional() }) }),
  z.object({ action: z.literal("questionCreate"), term: z.string().min(1).max(120), answer: z.string().min(1).max(160) }),
  z.object({ action: z.literal("materialCreate"), title: z.string().min(1).max(160), body: z.string().min(1).max(2000) }),
  z.object({ action: z.literal("rewardCreate"), name: z.string().min(1).max(120), cost: z.number().int().min(1).max(10000) }),
  z.object({ action: z.literal("redeem"), studentId: z.string().min(1), rewardId: z.string().min(1) }),
]);

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, "mutate", 80, 60_000);
    if (limited) return limited;
    await requireSameOrigin();
    const prisma = getPrisma();
    const body = mutationSchema.parse(await request.json()) as MutationBody;

    if (body.action === "reset") {
      const session = await requireTeacher();
      await resetDatabase(prisma);
      await audit("data.reset", session);
    }

    if (body.action === "studentFocus") {
      const session = await requireStudent();
      if (session.sub !== body.studentId) return NextResponse.json({ error: "Siswa hanya bisa update datanya sendiri." }, { status: 403 });
      await prisma.student.update({
        where: { id: body.studentId },
        data: {
          focusSeconds: { increment: Math.max(0, body.focusDelta) },
          awaySeconds: { increment: Math.max(0, body.awayDelta) },
          points: { increment: Math.max(0, body.pointsDelta ?? 0) },
          status: body.status,
          attendance: "present",
        },
      });
      await audit("student.focus_update", session, { studentId: body.studentId, status: body.status });
    }

    if (body.action === "sessionCreate") {
      const session = await requireTeacher();
      await prisma.classSession.create({
        data: {
          id: uid("session"),
          title: body.title,
          code: body.code.trim().toUpperCase(),
          level: "HSK 1",
          date: new Date(),
          durationMinutes: 75,
          status: "live",
          activeMaterialId: (await prisma.material.findFirst())?.id,
        },
      });
      await audit("session.create", session, { code: body.code });
    }

    if (body.action === "sessionPatch") {
      const session = await requireTeacher();
      await prisma.classSession.update({ where: { id: body.id }, data: body.patch });
      await audit("session.patch", session, { id: body.id, patch: body.patch });
    }

    if (body.action === "questionCreate") {
      const session = await requireTeacher();
      await prisma.quizQuestion.create({
        data: {
          id: uid("q"),
          type: "meaning",
          prompt: `Apa arti '${body.term}'?`,
          term: body.term,
          options: [body.answer, "Tidak tahu", "Besok", "Kelas"],
          answer: body.answer,
          explanation: `${body.term} berarti ${body.answer}.`,
        },
      });
      await audit("question.create", session, { term: body.term });
    }

    if (body.action === "materialCreate") {
      const session = await requireTeacher();
      await prisma.material.create({
        data: {
          id: uid("mat"),
          type: "vocab",
          title: body.title,
          body: body.body,
          hint: "Materi tambahan dari guru.",
        },
      });
      await audit("material.create", session, { title: body.title });
    }

    if (body.action === "rewardCreate") {
      const session = await requireTeacher();
      await prisma.rewardItem.create({
        data: {
          id: uid("reward"),
          name: body.name,
          cost: Number(body.cost) || 10,
          rarity: "common",
          stock: 10,
        },
      });
      await audit("reward.create", session, { name: body.name, cost: body.cost });
    }

    if (body.action === "redeem") {
      const session = await requireStudent();
      if (session.sub !== body.studentId) return NextResponse.json({ error: "Siswa hanya bisa redeem untuk dirinya sendiri." }, { status: 403 });
      await prisma.$transaction(async (tx) => {
        const [student, reward] = await Promise.all([
          tx.student.findUniqueOrThrow({ where: { id: body.studentId } }),
          tx.rewardItem.findUniqueOrThrow({ where: { id: body.rewardId } }),
        ]);
        if (student.points < reward.cost || reward.stock <= 0) throw new Error("Poin atau stok tidak cukup.");
        await tx.student.update({
          where: { id: student.id },
          data: { points: { decrement: reward.cost }, badges: [...student.badges, reward.name] },
        });
        await tx.rewardItem.update({ where: { id: reward.id }, data: { stock: { decrement: 1 } } });
        await tx.redemption.create({ data: { id: uid("redeem"), studentId: student.id, rewardId: reward.id } });
      });
      await audit("reward.redeem", session, { studentId: body.studentId, rewardId: body.rewardId });
    }

    return NextResponse.json(await getAppData());
  } catch (error) {
    await audit("api.mutate_failed", null, { message: error instanceof Error ? error.message : "Mutation failed" });
    if (error instanceof Error && error.message.includes("auth required")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
    if (error instanceof Error && error.message.includes("origin")) return NextResponse.json({ error: "Forbidden origin." }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Mutation failed" }, { status: 500 });
  }
}

async function resetDatabase(prisma: ReturnType<typeof getPrisma>) {
  await prisma.quizAnswer.deleteMany();
  await prisma.redemption.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.rewardItem.deleteMany();
  await prisma.quizQuestion.deleteMany();
  await prisma.material.deleteMany();
  await prisma.student.deleteMany();
  await prisma.classSession.deleteMany();

  await prisma.material.createMany({ data: initialData.materials });
  await prisma.classSession.createMany({
    data: initialData.sessions.map((session) => ({
      ...session,
      date: new Date(`${session.date}T00:00:00.000Z`),
    })),
  });
  await prisma.student.createMany({ data: initialData.students });
  await prisma.quizQuestion.createMany({ data: initialData.questions });
  await prisma.rewardItem.createMany({ data: initialData.rewards });
  await prisma.teacher.create({
    data: {
      id: "teacher-default",
      username: process.env.DEFAULT_TEACHER_USERNAME ?? "laoshi",
      name: "Laoshi",
      passwordHash: await bcrypt.hash(process.env.DEFAULT_TEACHER_PASSWORD ?? "change-this-password", 12),
    },
  });
}
