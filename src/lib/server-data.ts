import type { AppData } from "./class-data";
import { getPrisma } from "./prisma";

export async function getAppData(): Promise<AppData> {
  const prisma = getPrisma();
  const [sessions, students, questions, materials, rewards, redemptions] = await Promise.all([
    prisma.classSession.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.student.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.quizQuestion.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.material.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.rewardItem.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.redemption.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  const activeSession = sessions.find((session) => session.status === "live") ?? sessions[0];

  return {
    activeSessionId: activeSession?.id ?? "",
    sessions: sessions.map((session) => ({
      id: session.id,
      title: session.title,
      code: session.code,
      level: session.level,
      date: session.date.toISOString().slice(0, 10),
      durationMinutes: session.durationMinutes,
      status: session.status,
      activeMaterialId: session.activeMaterialId ?? "",
    })),
    students: students.map((student) => ({
      id: student.id,
      name: student.name,
      level: student.level,
      focusSeconds: student.focusSeconds,
      awaySeconds: student.awaySeconds,
      points: student.points,
      status: student.status,
      attendance: student.attendance,
      badges: student.badges,
    })),
    questions: questions.map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      term: question.term,
      options: question.options,
      answer: question.answer,
      explanation: question.explanation,
    })),
    materials: materials.map((material) => ({
      id: material.id,
      type: material.type,
      title: material.title,
      body: material.body,
      hint: material.hint,
    })),
    rewards: rewards.map((reward) => ({
      id: reward.id,
      name: reward.name,
      cost: reward.cost,
      rarity: reward.rarity,
      stock: reward.stock,
    })),
    redemptions: redemptions.map((redemption) => ({
      id: redemption.id,
      studentId: redemption.studentId,
      rewardId: redemption.rewardId,
      createdAt: redemption.createdAt.toISOString().slice(0, 10),
    })),
  };
}
