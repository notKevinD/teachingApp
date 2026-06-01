import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { initialData } from "../src/lib/class-data";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL belum diset.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  await prisma.quizAnswer.deleteMany();
  await prisma.redemption.deleteMany();
  await prisma.teacher.deleteMany();
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

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
