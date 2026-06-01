import { getPrisma } from "./prisma";
import type { AuthSession } from "./auth";
import type { Prisma } from "@prisma/client";

export async function audit(action: string, session: AuthSession | null, details: Record<string, unknown> = {}) {
  try {
    await getPrisma().auditLog.create({
      data: {
        actorId: session?.sub,
        actorRole: session?.role,
        action,
        details: details as Prisma.InputJsonValue,
      },
    });
  } catch {
    // Audit must not break classroom flow.
  }
}
