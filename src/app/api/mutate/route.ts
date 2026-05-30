import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAppData } from "@/lib/server-data";
import { initialData, uid } from "@/lib/class-data";

type MutationBody =
  | { action: "reset" }
  | { action: "join"; name: string; code: string }
  | { action: "studentFocus"; studentId: string; focusDelta: number; awayDelta: number; status: "active" | "away" | "offline"; pointsDelta?: number }
  | { action: "sessionCreate"; title: string; code: string }
  | { action: "sessionPatch"; id: string; patch: { status?: "draft" | "live" | "closed"; activeMaterialId?: string } }
  | { action: "questionCreate"; term: string; answer: string }
  | { action: "materialCreate"; title: string; body: string }
  | { action: "rewardCreate"; name: string; cost: number }
  | { action: "redeem"; studentId: string; rewardId: string };

export async function POST(request: Request) {
  try {
    const prisma = getPrisma();
    const body = (await request.json()) as MutationBody;

    if (body.action === "reset") {
      await resetDatabase(prisma);
    }

    if (body.action === "join") {
      const session = await prisma.classSession.findFirst({
        where: { code: body.code.trim().toUpperCase(), NOT: { status: "closed" } },
      });
      if (!session) return NextResponse.json({ error: "Kode kelas tidak valid atau sesi sudah ditutup." }, { status: 400 });

      await prisma.student.upsert({
        where: { name: body.name.trim() },
        update: { status: "active", attendance: "present", level: session.level },
        create: {
          id: uid("student"),
          name: body.name.trim(),
          level: session.level,
          status: "active",
          attendance: "present",
        },
      });
    }

    if (body.action === "studentFocus") {
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
    }

    if (body.action === "sessionCreate") {
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
    }

    if (body.action === "sessionPatch") {
      await prisma.classSession.update({ where: { id: body.id }, data: body.patch });
    }

    if (body.action === "questionCreate") {
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
    }

    if (body.action === "materialCreate") {
      await prisma.material.create({
        data: {
          id: uid("mat"),
          type: "vocab",
          title: body.title,
          body: body.body,
          hint: "Materi tambahan dari guru.",
        },
      });
    }

    if (body.action === "rewardCreate") {
      await prisma.rewardItem.create({
        data: {
          id: uid("reward"),
          name: body.name,
          cost: Number(body.cost) || 10,
          rarity: "common",
          stock: 10,
        },
      });
    }

    if (body.action === "redeem") {
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
    }

    return NextResponse.json(await getAppData());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Mutation failed" }, { status: 500 });
  }
}

async function resetDatabase(prisma: ReturnType<typeof getPrisma>) {
  await prisma.quizAnswer.deleteMany();
  await prisma.redemption.deleteMany();
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
}
