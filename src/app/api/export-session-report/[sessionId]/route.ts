import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/security";

function focusRate(focusSeconds: number, awaySeconds: number) {
  return Math.round((focusSeconds / Math.max(focusSeconds + awaySeconds, 1)) * 100);
}

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const limited = rateLimit(request, "export-session-report", 120, 60_000);
  if (limited) return limited;
  const expectedToken = process.env.IMPORT_API_TOKEN;
  const authHeader = request.headers.get("authorization") ?? "";
  const receivedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!expectedToken) {
    return NextResponse.json({ ok: false, error: "IMPORT_API_TOKEN is not configured" }, { status: 503 });
  }

  if (receivedToken !== expectedToken) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const prisma = getPrisma();
  const session = await prisma.classSession.findUnique({ where: { id: sessionId } });
  if (!session) return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });

  const [students, answers, redemptions] = await Promise.all([
    prisma.student.findMany({ orderBy: { name: "asc" } }),
    prisma.quizAnswer.findMany({ include: { question: true } }),
    prisma.redemption.findMany({ include: { reward: true } }),
  ]);

  const studentReports = students.map((student) => {
    const studentAnswers = answers.filter((answer) => answer.studentId === student.id);
    return {
      studentId: student.id,
      studentName: student.name,
      attendance: student.attendance,
      focusSeconds: student.focusSeconds,
      awaySeconds: student.awaySeconds,
      focusRate: focusRate(student.focusSeconds, student.awaySeconds),
      points: student.points,
      status: student.status,
      badges: student.badges,
      quiz: {
        total: studentAnswers.length,
        correct: studentAnswers.filter((answer) => answer.correct).length,
      },
      rewards: redemptions
        .filter((redemption) => redemption.studentId === student.id)
        .map((redemption) => ({ rewardId: redemption.rewardId, rewardName: redemption.reward.name, createdAt: redemption.createdAt.toISOString() })),
    };
  });

  await audit("integration.export_session_report", null, { sessionId });
  return NextResponse.json({
    ok: true,
    session: {
      id: session.id,
      title: session.title,
      code: session.code,
      status: session.status,
      date: session.date.toISOString().slice(0, 10),
    },
    summary: {
      students: studentReports.length,
      averageFocusRate: Math.round(studentReports.reduce((total, item) => total + item.focusRate, 0) / Math.max(studentReports.length, 1)),
      totalFocusSeconds: studentReports.reduce((total, item) => total + item.focusSeconds, 0),
      totalAwaySeconds: studentReports.reduce((total, item) => total + item.awaySeconds, 0),
    },
    students: studentReports,
  });
}
