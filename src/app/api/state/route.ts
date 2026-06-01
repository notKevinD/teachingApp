import { NextResponse } from "next/server";
import { getAppData } from "@/lib/server-data";
import { getSession } from "@/lib/auth";
import { rateLimit } from "@/lib/security";

export async function GET(request: Request) {
  try {
    const limited = rateLimit(request, "state", 120, 60_000);
    if (limited) return limited;
    const [data, session] = await Promise.all([getAppData(), getSession()]);
    if (session?.role === "teacher") return NextResponse.json(data);
    if (session?.role === "student") {
      return NextResponse.json({
        ...data,
        students: data.students.filter((student) => student.id === session.sub),
        redemptions: data.redemptions.filter((redemption) => redemption.studentId === session.sub),
      });
    }
    return NextResponse.json({
      ...data,
      students: [],
      redemptions: [],
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load state" }, { status: 500 });
  }
}
