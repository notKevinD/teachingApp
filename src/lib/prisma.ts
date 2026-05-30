import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; pgPool?: Pool };

export function getPrisma() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL belum diset. Isi .env dengan koneksi PostgreSQL VPS.");
  }

  if (!globalForPrisma.prisma) {
    const pool = globalForPrisma.pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL });
    globalForPrisma.pgPool = pool;
    globalForPrisma.prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  }

  return globalForPrisma.prisma;
}
