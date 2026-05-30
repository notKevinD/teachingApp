export type Role = "guest" | "teacher" | "student";
export type StudentStatus = "active" | "away" | "offline";
export type AttendanceStatus = "present" | "late" | "excused" | "absent";
export type QuestionType = "meaning" | "pinyin" | "sentence";
export type MaterialType = "vocab" | "grammar" | "slide" | "audio";
export type RewardRarity = "common" | "rare" | "epic";

export interface Student {
  id: string;
  name: string;
  level: string;
  focusSeconds: number;
  awaySeconds: number;
  points: number;
  status: StudentStatus;
  attendance: AttendanceStatus;
  badges: string[];
}

export interface ClassSession {
  id: string;
  title: string;
  code: string;
  level: string;
  date: string;
  durationMinutes: number;
  status: "draft" | "live" | "closed";
  activeMaterialId: string;
}

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  term: string;
  options: string[];
  answer: string;
  explanation: string;
}

export interface Material {
  id: string;
  type: MaterialType;
  title: string;
  body: string;
  hint: string;
}

export interface RewardItem {
  id: string;
  name: string;
  cost: number;
  rarity: RewardRarity;
  stock: number;
}

export interface Redemption {
  id: string;
  studentId: string;
  rewardId: string;
  createdAt: string;
}

export interface AppData {
  sessions: ClassSession[];
  activeSessionId: string;
  students: Student[];
  questions: QuizQuestion[];
  materials: Material[];
  rewards: RewardItem[];
  redemptions: Redemption[];
}

export const storageKey = "mandarin-class-mvp-v2";

export const initialData: AppData = {
  activeSessionId: "session-hsk1",
  sessions: [
    {
      id: "session-hsk1",
      title: "HSK 1 - Waktu dan Kegiatan",
      code: "LAOSHI-01",
      level: "HSK 1",
      date: "2026-05-30",
      durationMinutes: 75,
      status: "live",
      activeMaterialId: "mat-today",
    },
  ],
  students: [
    { id: "s1", name: "Kevin", level: "HSK 1", focusSeconds: 1320, awaySeconds: 95, points: 72, status: "active", attendance: "present", badges: ["Focus Starter"] },
    { id: "s2", name: "Cindy", level: "HSK 1", focusSeconds: 1180, awaySeconds: 210, points: 61, status: "away", attendance: "late", badges: ["Quiz Ready"] },
    { id: "s3", name: "Michelle", level: "HSK 2", focusSeconds: 1440, awaySeconds: 42, points: 89, status: "active", attendance: "present", badges: ["Tone Keeper"] },
    { id: "s4", name: "Jason", level: "HSK 1", focusSeconds: 860, awaySeconds: 380, points: 34, status: "offline", attendance: "absent", badges: [] },
  ],
  questions: [
    {
      id: "q1",
      type: "meaning",
      prompt: "Apa arti 'jintian'?",
      term: "jintian",
      options: ["Kemarin", "Hari ini", "Besok", "Minggu depan"],
      answer: "Hari ini",
      explanation: "Jintian berarti hari ini.",
    },
    {
      id: "q2",
      type: "pinyin",
      prompt: "Pilih arti yang tepat untuk 'laoshi'.",
      term: "laoshi",
      options: ["Guru", "Murid", "Teman", "Kelas"],
      answer: "Guru",
      explanation: "Laoshi berarti guru.",
    },
    {
      id: "q3",
      type: "sentence",
      prompt: "Kalimat mana yang berarti 'Saya sangat sibuk'?",
      term: "wo hen mang",
      options: ["Saya sangat sibuk", "Kamu sangat baik", "Dia tidak datang", "Kami pergi"],
      answer: "Saya sangat sibuk",
      explanation: "Wo hen mang berarti saya sangat sibuk.",
    },
  ],
  materials: [
    { id: "mat-today", type: "vocab", title: "Kosakata Hari Ini", body: "jintian, mingtian, laoshi, xuesheng, hen mang, xuexi", hint: "Fokus: waktu dan aktivitas harian." },
    { id: "mat-pattern", type: "grammar", title: "Pola Kalimat", body: "Subjek + hen + kondisi. Contoh: Wo hen mang.", hint: "Gunakan untuk menjawab pertanyaan singkat." },
    { id: "mat-slide", type: "slide", title: "Slide Guru", body: "Hari ini kita latihan bertanya: Ni jintian mang ma?", hint: "Siswa bisa zoom dari HP." },
  ],
  rewards: [
    { id: "r1", name: "Stiker digital", cost: 20, rarity: "common", stock: 20 },
    { id: "r2", name: "Pilih urutan game", cost: 45, rarity: "rare", stock: 6 },
    { id: "r3", name: "Lucky capsule", cost: 60, rarity: "epic", stock: 4 },
  ],
  redemptions: [],
};

export function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
