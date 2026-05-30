import { NextResponse } from "next/server";
import { getAppData } from "@/lib/server-data";

export async function GET() {
  try {
    return NextResponse.json(await getAppData());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load state" }, { status: 500 });
  }
}
