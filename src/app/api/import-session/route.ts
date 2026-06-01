import { NextResponse } from "next/server";
import { z } from "zod";
import { AttendanceStatus, uid } from "@/lib/class-data";
import { getPrisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/security";

interface ManagementAttendance {
  studentId: string;
  studentName?: string;
  status: AttendanceStatus;
}

interface ManagementPayload {
  externalSessionId: string;
  className?: string;
  classId?: string;
  teacherName?: string;
  teacherId?: string;
  levelName?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  status: string;
  topic?: string;
  summary?: string;
  homework?: string;
  nextPlan?: string;
  attendance?: ManagementAttendance[];
}

const payloadSchema = z.object({
  externalSessionId: z.string().min(1).max(120),
  className: z.string().max(160).optional(),
  classId: z.string().max(120).optional(),
  teacherName: z.string().max(160).optional(),
  teacherId: z.string().max(120).optional(),
  levelName: z.string().max(80).optional(),
  date: z.string().min(1).max(40),
  startTime: z.string().max(20).optional(),
  endTime: z.string().max(20).optional(),
  status: z.string().min(1).max(40),
  topic: z.string().max(500).optional(),
  summary: z.string().max(2000).optional(),
  homework: z.string().max(1000).optional(),
  nextPlan: z.string().max(1000).optional(),
  attendance: z.array(z.object({
    studentId: z.string().min(1).max(120),
    studentName: z.string().max(160).optional(),
    status: z.enum(["present", "absent", "excused", "late"]),
  })).optional(),
});

function statusFromManagement(status: string) {
  if (status === "completed" || status === "cancelled") return "closed";
  if (status === "scheduled" || status === "rescheduled") return "draft";
  return "live";
}

function attendanceToFocus(status: AttendanceStatus) {
  if (status === "present") return { focusSeconds: 900, awaySeconds: 60, points: 20, status: "active" as const };
  if (status === "late") return { focusSeconds: 600, awaySeconds: 180, points: 12, status: "away" as const };
  return { focusSeconds: 0, awaySeconds: 0, points: 0, status: "offline" as const };
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "import-session", 60, 60_000);
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

  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload tidak valid" }, { status: 400 });
  }
  const payload = parsed.data as ManagementPayload;
  if (!payload.externalSessionId || !payload.date) {
    return NextResponse.json({ ok: false, error: "externalSessionId and date are required" }, { status: 400 });
  }

  const prisma = getPrisma();
  const activeMaterial = await prisma.material.findFirst();
  const code = `UM-${payload.externalSessionId.slice(-6).toUpperCase()}`;

  await prisma.classSession.upsert({
    where: { id: payload.externalSessionId },
    update: {
      title: payload.className ?? payload.topic ?? "Sesi Universal Mandarin",
      code,
      level: payload.levelName ?? "HSK",
      date: new Date(payload.date),
      status: statusFromManagement(payload.status),
      activeMaterialId: activeMaterial?.id,
    },
    create: {
      id: payload.externalSessionId,
      title: payload.className ?? payload.topic ?? "Sesi Universal Mandarin",
      code,
      level: payload.levelName ?? "HSK",
      date: new Date(payload.date),
      durationMinutes: 75,
      status: statusFromManagement(payload.status),
      activeMaterialId: activeMaterial?.id,
    },
  });

  for (const attendance of payload.attendance ?? []) {
    const focus = attendanceToFocus(attendance.status);
    await prisma.student.upsert({
      where: { id: attendance.studentId },
      update: {
        name: attendance.studentName ?? attendance.studentId,
        level: payload.levelName ?? "HSK",
        attendance: attendance.status,
        ...focus,
      },
      create: {
        id: attendance.studentId || uid("student"),
        name: attendance.studentName ?? attendance.studentId,
        level: payload.levelName ?? "HSK",
        attendance: attendance.status,
        badges: attendance.status === "present" ? ["Synced Attendance"] : [],
        ...focus,
      },
    });
  }

  await audit("integration.import_session", null, { sessionId: payload.externalSessionId, code });
  return NextResponse.json({
    ok: true,
    sessionId: payload.externalSessionId,
    code,
    liveUrl: process.env.PUBLIC_APP_URL ? `${process.env.PUBLIC_APP_URL}?code=${encodeURIComponent(code)}` : undefined,
  });
}
