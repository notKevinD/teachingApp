import { NextResponse } from "next/server";
import { AttendanceStatus, uid } from "@/lib/class-data";
import { getPrisma } from "@/lib/prisma";

interface ManagementAttendance {
  studentId: string;
  studentName?: string;
  status: AttendanceStatus;
}

interface ManagementPayload {
  externalSessionId: string;
  className?: string;
  levelName?: string;
  date: string;
  status: string;
  topic?: string;
  attendance?: ManagementAttendance[];
}

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
  const expectedToken = process.env.IMPORT_API_TOKEN;
  const authHeader = request.headers.get("authorization") ?? "";
  const receivedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!expectedToken) {
    return NextResponse.json({ ok: false, error: "IMPORT_API_TOKEN is not configured" }, { status: 503 });
  }

  if (receivedToken !== expectedToken) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as ManagementPayload;
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

  return NextResponse.json({ ok: true, sessionId: payload.externalSessionId, code });
}
