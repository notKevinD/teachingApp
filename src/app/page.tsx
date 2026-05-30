"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Database,
  Gift,
  LayoutDashboard,
  LogOut,
  PlayCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Trophy,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  AppData,
  AttendanceStatus,
  ClassSession,
  formatDuration,
  initialData,
  Material,
  QuizQuestion,
  RewardItem,
  Role,
  Student,
  StudentStatus,
  todayIso,
  uid,
} from "@/lib/class-data";

type AnswerMap = Record<string, string>;
type TeacherTab = "dashboard" | "session" | "quiz" | "materials" | "rewards" | "reports";
type StudentTab = "live" | "quiz" | "materials" | "rewards";

export default function Home() {
  const [data, setData] = useState<AppData>(initialData);
  const [role, setRole] = useState<Role>("guest");
  const [teacherTab, setTeacherTab] = useState<TeacherTab>("dashboard");
  const [studentTab, setStudentTab] = useState<StudentTab>("live");
  const [studentName, setStudentName] = useState("Kevin");
  const [joinCode, setJoinCode] = useState("LAOSHI-01");
  const [focusSeconds, setFocusSeconds] = useState(0);
  const [awaySeconds, setAwaySeconds] = useState(0);
  const [isFocused, setIsFocused] = useState(true);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState("Menghubungkan ke server...");
  const [socket, setSocket] = useState<Socket | null>(null);
  const lastSyncedRef = useRef({ focus: 0, away: 0, points: 0 });

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        if (!response.ok) throw new Error("API state unavailable");
        const apiData = (await response.json()) as AppData;
        if (cancelled) return;
        setData(apiData);
        setNotice("Data PostgreSQL tersambung.");
      } catch {
        if (!cancelled) setNotice("Server/database belum siap. Cek DATABASE_URL dan seed database.");
      } finally {
        // Keep bundled sample data visible when the backend is not configured yet.
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const nextSocket = io();
    nextSocket.emit("room:join", "global");
    nextSocket.on("connect", () => setNotice("Realtime aktif."));
    nextSocket.on("state:refresh", () => {
      void loadState("Data diperbarui realtime.");
    });
    nextSocket.on("focus:updated", () => {
      if (role === "teacher") void loadState("Status siswa diperbarui.");
    });
    setSocket(nextSocket);
    return () => {
      nextSocket.disconnect();
    };
  }, [role]);

  useEffect(() => {
    if (role !== "student") return;

    function updateFocus() {
      setIsFocused(!document.hidden && document.hasFocus());
    }

    document.addEventListener("visibilitychange", updateFocus);
    window.addEventListener("focus", updateFocus);
    window.addEventListener("blur", updateFocus);
    updateFocus();

    return () => {
      document.removeEventListener("visibilitychange", updateFocus);
      window.removeEventListener("focus", updateFocus);
      window.removeEventListener("blur", updateFocus);
    };
  }, [role]);

  useEffect(() => {
    if (role !== "student") return;
    const timer = window.setInterval(() => {
      if (isFocused) setFocusSeconds((value) => value + 1);
      else setAwaySeconds((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isFocused, role]);

  const activeSession = data.sessions.find((session) => session.id === data.activeSessionId) ?? data.sessions[0];
  const activeMaterial = data.materials.find((material) => material.id === activeSession?.activeMaterialId) ?? data.materials[0];
  const currentStudent = data.students.find((student) => student.name.toLowerCase() === studentName.trim().toLowerCase());
  const score = useMemo(() => data.questions.reduce((total, question) => total + (answers[question.id] === question.answer ? 10 : 0), 0), [answers, data.questions]);
  const displayedStudents = useMemo(() => {
    if (role !== "student") return data.students;
    return data.students.map((student) =>
      student.name.toLowerCase() === studentName.trim().toLowerCase()
        ? {
            ...student,
            focusSeconds: student.focusSeconds + focusSeconds,
            awaySeconds: student.awaySeconds + awaySeconds,
            points: student.points + Math.floor(focusSeconds / 45) + score,
            status: isFocused ? ("active" as const) : ("away" as const),
            attendance: "present" as const,
          }
        : student,
    );
  }, [awaySeconds, data.students, focusSeconds, isFocused, role, score, studentName]);

  useEffect(() => {
    if (role !== "student" || !currentStudent) return;
    const timer = window.setInterval(() => {
      void syncStudentFocus(currentStudent.id, isFocused ? "active" : "away");
    }, 5000);
    return () => window.clearInterval(timer);
  }, [currentStudent, focusSeconds, awaySeconds, score, isFocused, role]);

  async function loadState(message?: string) {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      setData((await response.json()) as AppData);
      if (message) setNotice(message);
    } catch {
      setNotice("Server/database belum siap. Cek DATABASE_URL dan seed database.");
    }
  }

  async function mutate(body: Record<string, unknown>, message?: string) {
    const response = await fetch("/api/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) {
      setNotice(payload.error ?? "Mutasi gagal.");
      return null;
    }
    setData(payload as AppData);
    if (message) setNotice(message);
    socket?.emit("state:changed", "global");
    return payload as AppData;
  }

  async function syncStudentFocus(studentId: string, status: StudentStatus) {
    const points = Math.floor(focusSeconds / 45) + score;
    const focusDelta = focusSeconds - lastSyncedRef.current.focus;
    const awayDelta = awaySeconds - lastSyncedRef.current.away;
    const pointsDelta = points - lastSyncedRef.current.points;
    if (focusDelta <= 0 && awayDelta <= 0 && pointsDelta <= 0 && status !== "offline") return;
    lastSyncedRef.current = { focus: focusSeconds, away: awaySeconds, points };
    await mutate({ action: "studentFocus", studentId, focusDelta, awayDelta, pointsDelta, status });
    socket?.emit("focus:update", { room: "global", studentId, status });
  }

  function loginTeacher() {
    setRole("teacher");
    setTeacherTab("dashboard");
    setNotice("Masuk sebagai guru.");
  }

  async function joinClass() {
    const cleanName = studentName.trim() || "Murid";
    const nextData = await mutate({ action: "join", name: cleanName, code: joinCode.trim().toUpperCase() }, `${cleanName} masuk ke kelas.`);
    if (!nextData) return;
    setStudentName(cleanName);
    setRole("student");
    setStudentTab("live");
    setFocusSeconds(0);
    setAwaySeconds(0);
    setAnswers({});
    setSubmitted(false);
    lastSyncedRef.current = { focus: 0, away: 0, points: 0 };
  }

  async function logout() {
    if (role === "student" && currentStudent) {
      await syncStudentFocus(currentStudent.id, "offline");
    }
    setRole("guest");
    setFocusSeconds(0);
    setAwaySeconds(0);
    setAnswers({});
    setSubmitted(false);
  }

  async function resetData() {
    await mutate({ action: "reset" }, "Data database dikembalikan ke contoh awal.");
    setAnswers({});
    setSubmitted(false);
  }

  async function addSession(session: ClassSession) {
    await mutate({ action: "sessionCreate", title: session.title, code: session.code }, "Sesi baru dibuat.");
  }

  async function updateSession(id: string, patch: Partial<ClassSession>) {
    await mutate({ action: "sessionPatch", id, patch }, "Sesi diperbarui.");
  }

  async function addQuestion(question: QuizQuestion) {
    await mutate({ action: "questionCreate", term: question.term, answer: question.answer }, "Soal quiz ditambahkan.");
  }

  async function addMaterial(material: Material) {
    await mutate({ action: "materialCreate", title: material.title, body: material.body }, "Materi ditambahkan.");
  }

  async function addReward(reward: RewardItem) {
    await mutate({ action: "rewardCreate", name: reward.name, cost: reward.cost }, "Reward ditambahkan.");
  }

  async function redeemReward(reward: RewardItem) {
    if (!currentStudent) return;
    await mutate({ action: "redeem", studentId: currentStudent.id, rewardId: reward.id }, "Reward ditukar.");
  }

  return (
    <main className="app-shell">
      <aside className="side-panel">
        <Brand />
        {role === "guest" ? (
          <LoginPanel studentName={studentName} setStudentName={setStudentName} joinCode={joinCode} setJoinCode={setJoinCode} joinClass={joinClass} loginTeacher={loginTeacher} />
        ) : (
          <SessionIdentity role={role} studentName={studentName} activeSession={activeSession} logout={logout} />
        )}
        <button className="reset-button" onClick={resetData}>
          <RefreshCw size={17} />
          Reset data contoh
        </button>
      </aside>

      <section className="workspace">
        <div className="notice">{notice}</div>
        {role === "guest" && <GuestPreview data={data} />}
        {role === "teacher" && (
          <>
            <Header title="Teacher Dashboard" subtitle={`Kode aktif: ${activeSession?.code ?? "-"}`} tabs={teacherTabs} activeTab={teacherTab} setActiveTab={(tab) => setTeacherTab(tab as TeacherTab)} />
            {teacherTab === "dashboard" && <TeacherDashboard students={displayedStudents} data={data} />}
            {teacherTab === "session" && <SessionManager data={data} activeSession={activeSession} addSession={addSession} updateSession={updateSession} />}
            {teacherTab === "quiz" && <QuizManager questions={data.questions} answers={answers} setAnswers={setAnswers} submitted={submitted} setSubmitted={setSubmitted} score={score} addQuestion={addQuestion} />}
            {teacherTab === "materials" && <MaterialsManager data={data} activeSession={activeSession} addMaterial={addMaterial} updateSession={updateSession} />}
            {teacherTab === "rewards" && <RewardsManager rewards={data.rewards} addReward={addReward} redemptions={data.redemptions} students={data.students} />}
            {teacherTab === "reports" && <Reports data={{ ...data, students: displayedStudents }} />}
          </>
        )}
        {role === "student" && (
          <>
            <Header title="Ruang Belajar" subtitle={`${studentName} - ${activeSession?.title ?? "Kelas"}`} tabs={studentTabs} activeTab={studentTab} setActiveTab={(tab) => setStudentTab(tab as StudentTab)} />
            {studentTab === "live" && <LiveClass material={activeMaterial} session={activeSession} focusSeconds={focusSeconds} awaySeconds={awaySeconds} isFocused={isFocused} />}
            {studentTab === "quiz" && <QuizPractice questions={data.questions} answers={answers} setAnswers={setAnswers} submitted={submitted} setSubmitted={setSubmitted} score={score} />}
            {studentTab === "materials" && <StudentMaterials materials={data.materials} activeMaterialId={activeSession?.activeMaterialId} />}
            {studentTab === "rewards" && <StudentRewards rewards={data.rewards} student={currentStudent} sessionPoints={Math.floor(focusSeconds / 45) + score} redeemReward={redeemReward} />}
          </>
        )}
      </section>
    </main>
  );
}

const teacherTabs = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "session", label: "Sesi", icon: PlayCircle },
  { id: "quiz", label: "Quiz", icon: Trophy },
  { id: "materials", label: "Materi", icon: BookOpen },
  { id: "rewards", label: "Reward", icon: Gift },
  { id: "reports", label: "Laporan", icon: BarChart3 },
];

const studentTabs = [
  { id: "live", label: "Live", icon: BookOpen },
  { id: "quiz", label: "Quiz", icon: Trophy },
  { id: "materials", label: "Materi", icon: ClipboardList },
  { id: "rewards", label: "Reward", icon: Gift },
];

function Brand() {
  return (
    <div className="brand-row">
      <div className="brand-mark">Xue</div>
      <div>
        <p>Mandarin Class</p>
        <h1>Focus class MVP</h1>
      </div>
    </div>
  );
}

function LoginPanel({ studentName, setStudentName, joinCode, setJoinCode, joinClass, loginTeacher }: { studentName: string; setStudentName: (value: string) => void; joinCode: string; setJoinCode: (value: string) => void; joinClass: () => void; loginTeacher: () => void }) {
  return (
    <div className="login-grid">
      <section className="login-card">
        <LayoutDashboard size={24} />
        <h2>Guru / Admin</h2>
        <p>Kelola sesi, quiz, materi, reward, absensi, dan laporan kelas.</p>
        <button className="primary-button" onClick={loginTeacher}>
          <UsersRound size={18} />
          Login Guru
        </button>
      </section>
      <section className="login-card">
        <UserRound size={24} />
        <h2>Siswa</h2>
        <label>
          Nama
          <input value={studentName} onChange={(event) => setStudentName(event.target.value)} />
        </label>
        <label>
          Kode kelas
          <input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} />
        </label>
        <button className="primary-button green" onClick={joinClass}>
          <PlayCircle size={18} />
          Join Class
        </button>
      </section>
    </div>
  );
}

function SessionIdentity({ role, studentName, activeSession, logout }: { role: Role; studentName: string; activeSession?: ClassSession; logout: () => void }) {
  return (
    <section className="identity-card">
      <span>Masuk sebagai</span>
      <h2>{role === "teacher" ? "Laoshi" : studentName}</h2>
      <p>{activeSession?.title ?? "Belum ada sesi aktif"}</p>
      <button className="ghost-button" onClick={logout}>
        <LogOut size={18} />
        Keluar
      </button>
    </section>
  );
}

function Header({ title, subtitle, tabs, activeTab, setActiveTab }: { title: string; subtitle: string; tabs: typeof teacherTabs; activeTab: string; setActiveTab: (tab: string) => void }) {
  return (
    <header className="topbar">
      <div>
        <span className="eyebrow">{subtitle}</span>
        <h2>{title}</h2>
      </div>
      <nav className="tabbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}>
              <Icon size={17} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
}

function GuestPreview({ data }: { data: AppData }) {
  return (
    <div className="guest-preview">
      <section className="hero-copy">
        <span className="eyebrow">Versi MVP lokal</span>
        <h2>Semua fitur inti sudah bisa dicoba dari satu halaman.</h2>
        <p>Data disimpan di browser. Untuk pemakaian banyak HP secara nyata, tahap berikutnya tetap perlu backend real-time.</p>
      </section>
      <section className="metric-grid">
        <Metric icon={PlayCircle} label="Sesi aktif" value={data.sessions.length} tone="blue" />
        <Metric icon={UsersRound} label="Siswa" value={data.students.length} tone="green" />
        <Metric icon={Trophy} label="Soal quiz" value={data.questions.length} tone="pink" />
      </section>
      <section className="feature-grid">
        {["Login role", "Join class", "Live focus", "Quiz builder", "Absensi", "Materi", "Reward", "Laporan"].map((item) => (
          <div className="feature-chip" key={item}>
            <CheckCircle2 size={16} />
            {item}
          </div>
        ))}
      </section>
    </div>
  );
}

function TeacherDashboard({ students, data }: { students: Student[]; data: AppData }) {
  const active = students.filter((student) => student.status === "active").length;
  const away = students.filter((student) => student.status === "away").length;
  const avg = averageFocus(students);
  return (
    <div className="page-grid">
      <section className="metric-grid">
        <Metric icon={UsersRound} label="Aktif" value={active} tone="green" />
        <Metric icon={Clock3} label="Away" value={away} tone="orange" />
        <Metric icon={Award} label="Rata-rata fokus" value={`${avg}%`} tone="blue" />
      </section>
      <section className="panel">
        <PanelTitle label="Live monitoring" title="Status siswa" action="Browser focus" />
        <div className="student-table">
          {students.map((student) => (
            <div className="student-row" key={student.id}>
              <div>
                <strong>{student.name}</strong>
                <span>{student.level}</span>
              </div>
              <Status value={student.status} />
              <span>{formatDuration(student.focusSeconds)}</span>
              <span>{formatDuration(student.awaySeconds)}</span>
              <strong>{student.points} pts</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <PanelTitle label="Ringkasan" title="Aktivitas kelas" action={`${data.redemptions.length} penukaran`} />
        <div className="activity-grid">
          <InfoCard title="Materi tersedia" value={`${data.materials.length} item`} />
          <InfoCard title="Reward aktif" value={`${data.rewards.length} item`} />
          <InfoCard title="Sesi kelas" value={`${data.sessions.length} sesi`} />
        </div>
      </section>
    </div>
  );
}

function SessionManager({ data, activeSession, addSession, updateSession }: { data: AppData; activeSession?: ClassSession; addSession: (session: ClassSession) => void; updateSession: (id: string, patch: Partial<ClassSession>) => void }) {
  const [title, setTitle] = useState("HSK 1 - Sesi Baru");
  const [code, setCode] = useState(`LAOSHI-${Math.floor(10 + Math.random() * 89)}`);
  return (
    <div className="two-col">
      <section className="panel">
        <PanelTitle label="Class session" title="Buat sesi kelas" action="Join code unik" />
        <div className="form-grid">
          <Field label="Judul sesi" value={title} setValue={setTitle} />
          <Field label="Kode kelas" value={code} setValue={setCode} />
        </div>
        <button className="primary-button" onClick={() => addSession({ id: uid("session"), title, code: code.toUpperCase(), level: "HSK 1", date: todayIso(), durationMinutes: 75, status: "live", activeMaterialId: data.materials[0]?.id ?? "" })}>
          <Plus size={18} />
          Buat Sesi
        </button>
      </section>
      <section className="panel">
        <PanelTitle label="Sesi aktif" title={activeSession?.title ?? "Tidak ada sesi"} action={activeSession?.code ?? "-"} />
        <div className="stack">
          {data.sessions.map((session) => (
            <div className="list-row" key={session.id}>
              <div>
                <strong>{session.title}</strong>
                <span>{session.code} - {session.status}</span>
              </div>
              <button className="small-button" onClick={() => updateSession(session.id, { status: "live" })}>Aktifkan</button>
              <button className="small-button" onClick={() => updateSession(session.id, { status: session.status === "live" ? "closed" : "live" })}>{session.status === "live" ? "Tutup" : "Live"}</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function QuizManager({ questions, answers, setAnswers, submitted, setSubmitted, score, addQuestion }: { questions: QuizQuestion[]; answers: AnswerMap; setAnswers: (answers: AnswerMap) => void; submitted: boolean; setSubmitted: (value: boolean) => void; score: number; addQuestion: (question: QuizQuestion) => void }) {
  const [term, setTerm] = useState("zaijian");
  const [answer, setAnswer] = useState("Sampai jumpa");
  return (
    <div className="two-col">
      <QuizPractice questions={questions} answers={answers} setAnswers={setAnswers} submitted={submitted} setSubmitted={setSubmitted} score={score} />
      <section className="panel">
        <PanelTitle label="Quiz builder" title="Tambah soal cepat" action={`${questions.length} soal`} />
        <div className="form-stack">
          <Field label="Term/pinyin" value={term} setValue={setTerm} />
          <Field label="Jawaban benar" value={answer} setValue={setAnswer} />
        </div>
        <button className="primary-button" onClick={() => addQuestion({ id: uid("q"), type: "meaning", prompt: `Apa arti '${term}'?`, term, options: [answer, "Tidak tahu", "Besok", "Kelas"], answer, explanation: `${term} berarti ${answer}.` })}>
          <Plus size={18} />
          Tambah Soal
        </button>
      </section>
    </div>
  );
}

function QuizPractice({ questions, answers, setAnswers, submitted, setSubmitted, score }: { questions: QuizQuestion[]; answers: AnswerMap; setAnswers: (answers: AnswerMap) => void; submitted: boolean; setSubmitted: (value: boolean) => void; score: number }) {
  return (
    <section className="panel">
      <PanelTitle label="Quiz live" title="Latihan cepat" action={`${score} poin`} />
      <div className="question-list">
        {questions.map((question, index) => (
          <article className="question-card" key={question.id}>
            <span>Soal {index + 1}</span>
            <h4>{question.prompt}</h4>
            <div className="term-box">{question.term}</div>
            <div className="option-grid">
              {question.options.map((option) => (
                <button key={option} className={answers[question.id] === option ? "selected" : ""} onClick={() => setAnswers({ ...answers, [question.id]: option })}>{option}</button>
              ))}
            </div>
            {submitted && <p className={answers[question.id] === question.answer ? "correct" : "incorrect"}>{question.explanation}</p>}
          </article>
        ))}
      </div>
      <button className="primary-button" onClick={() => setSubmitted(true)}>
        <Trophy size={18} />
        Submit Quiz
      </button>
    </section>
  );
}

function MaterialsManager({ data, activeSession, addMaterial, updateSession }: { data: AppData; activeSession?: ClassSession; addMaterial: (material: Material) => void; updateSession: (id: string, patch: Partial<ClassSession>) => void }) {
  const [title, setTitle] = useState("Materi Baru");
  const [body, setBody] = useState("Isi materi singkat untuk siswa.");
  return (
    <div className="two-col">
      <section className="panel">
        <PanelTitle label="Materi" title="Tambah materi" action="Mobile readable" />
        <div className="form-stack">
          <Field label="Judul" value={title} setValue={setTitle} />
          <label className="field">
            Isi
            <textarea value={body} onChange={(event) => setBody(event.target.value)} />
          </label>
        </div>
        <button className="primary-button" onClick={() => addMaterial({ id: uid("mat"), type: "vocab", title, body, hint: "Materi tambahan dari guru." })}>
          <Plus size={18} />
          Tambah Materi
        </button>
      </section>
      <section className="panel">
        <PanelTitle label="Sync material" title="Materi kelas" action={activeSession?.code ?? "-"} />
        <div className="stack">
          {data.materials.map((material) => (
            <div className="list-row" key={material.id}>
              <div>
                <strong>{material.title}</strong>
                <span>{material.hint}</span>
              </div>
              <button className="small-button" disabled={!activeSession} onClick={() => activeSession && updateSession(activeSession.id, { activeMaterialId: material.id })}>Tampilkan</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function LiveClass({ material, session, focusSeconds, awaySeconds, isFocused }: { material?: Material; session?: ClassSession; focusSeconds: number; awaySeconds: number; isFocused: boolean }) {
  const rate = Math.round((focusSeconds / Math.max(focusSeconds + awaySeconds, 1)) * 100);
  return (
    <div className="page-grid">
      <section className="metric-grid">
        <Metric icon={CheckCircle2} label="Status" value={isFocused ? "Fokus" : "Away"} tone={isFocused ? "green" : "orange"} />
        <Metric icon={Clock3} label="Waktu fokus" value={formatDuration(focusSeconds)} tone="blue" />
        <Metric icon={Sparkles} label="Focus rate" value={`${rate}%`} tone="pink" />
      </section>
      <section className="live-layout">
        <div className="panel lesson-panel">
          <PanelTitle label={session?.title ?? "Live class"} title={material?.title ?? "Materi"} action="Zoom friendly" />
          <div className="material-board">
            <strong>{material?.body ?? "Belum ada materi."}</strong>
            <p>{material?.hint}</p>
          </div>
        </div>
        <aside className="panel">
          <PanelTitle label="Focus log" title="Catatan sesi" action={formatDuration(awaySeconds)} />
          <p className="muted">Timer fokus berjalan selama tab ini aktif. Saat pindah tab/aplikasi, waktu away bertambah.</p>
        </aside>
      </section>
    </div>
  );
}

function StudentMaterials({ materials, activeMaterialId }: { materials: Material[]; activeMaterialId?: string }) {
  return (
    <section className="panel">
      <PanelTitle label="Materi belajar" title="Daftar materi" action={`${materials.length} item`} />
      <div className="card-grid">
        {materials.map((material) => (
          <article className={`mini-card ${material.id === activeMaterialId ? "highlight" : ""}`} key={material.id}>
            <h4>{material.title}</h4>
            <p>{material.body}</p>
            <small>{material.hint}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function RewardsManager({ rewards, addReward, redemptions, students }: { rewards: RewardItem[]; addReward: (reward: RewardItem) => void; redemptions: { studentId: string; rewardId: string; createdAt: string }[]; students: Student[] }) {
  const [name, setName] = useState("Bonus stiker");
  const [cost, setCost] = useState("25");
  return (
    <div className="two-col">
      <section className="panel">
        <PanelTitle label="Reward manager" title="Tambah reward" action="Gacha sehat siap" />
        <div className="form-grid">
          <Field label="Nama reward" value={name} setValue={setName} />
          <Field label="Biaya poin" value={cost} setValue={setCost} />
        </div>
        <button className="primary-button" onClick={() => addReward({ id: uid("reward"), name, cost: Number(cost) || 10, rarity: "common", stock: 10 })}>
          <Plus size={18} />
          Tambah Reward
        </button>
      </section>
      <section className="panel">
        <PanelTitle label="Penukaran" title="Reward aktif" action={`${redemptions.length} redeem`} />
        <div className="stack">
          {rewards.map((reward) => (
            <div className="list-row" key={reward.id}>
              <div>
                <strong>{reward.name}</strong>
                <span>{reward.cost} pts - stok {reward.stock} - {reward.rarity}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="muted">{students.length} siswa bisa mengumpulkan poin dari fokus dan quiz.</p>
      </section>
    </div>
  );
}

function StudentRewards({ rewards, student, sessionPoints, redeemReward }: { rewards: RewardItem[]; student?: Student; sessionPoints: number; redeemReward: (reward: RewardItem) => void }) {
  const totalPoints = (student?.points ?? 0) + sessionPoints;
  return (
    <section className="panel">
      <PanelTitle label="Reward shop" title={`${totalPoints} poin tersedia`} action="Tanpa uang asli" />
      <div className="card-grid">
        {rewards.map((reward) => (
          <article className="mini-card reward-item" key={reward.id}>
            <Gift size={22} />
            <h4>{reward.name}</h4>
            <p>{reward.cost} poin - stok {reward.stock}</p>
            <button className="small-button" disabled={totalPoints < reward.cost || reward.stock <= 0} onClick={() => redeemReward(reward)}>Tukar</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Reports({ data }: { data: AppData }) {
  return (
    <div className="page-grid">
      <section className="metric-grid">
        <Metric icon={BarChart3} label="Rata-rata fokus" value={`${averageFocus(data.students)}%`} tone="blue" />
        <Metric icon={ClipboardList} label="Hadir" value={data.students.filter((student) => student.attendance === "present").length} tone="green" />
        <Metric icon={Gift} label="Redeem" value={data.redemptions.length} tone="pink" />
      </section>
      <section className="panel">
        <PanelTitle label="Laporan siswa" title="Progress kelas" action="Export nanti" />
        <div className="student-table">
          {data.students.map((student) => (
            <div className="student-row" key={student.id}>
              <div>
                <strong>{student.name}</strong>
                <span>{student.badges.join(", ") || "Belum ada badge"}</span>
              </div>
              <AttendanceBadge value={student.attendance} />
              <span>{formatDuration(student.focusSeconds)}</span>
              <span>{formatDuration(student.awaySeconds)}</span>
              <strong>{student.points} pts</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof UsersRound; label: string; value: string | number; tone: "blue" | "green" | "orange" | "pink" }) {
  return (
    <article className={`metric ${tone}`}>
      <Icon size={22} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function PanelTitle({ label, title, action }: { label: string; title: string; action?: string }) {
  return (
    <div className="panel-header">
      <div>
        <span className="eyebrow">{label}</span>
        <h3>{title}</h3>
      </div>
      {action && <span className="soft-pill">{action}</span>}
    </div>
  );
}

function Field({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) {
  return (
    <label className="field">
      {label}
      <input value={value} onChange={(event) => setValue(event.target.value)} />
    </label>
  );
}

function Status({ value }: { value: StudentStatus }) {
  const label = value === "active" ? "Aktif" : value === "away" ? "Away" : "Offline";
  return <span className={`status ${value}`}>{label}</span>;
}

function AttendanceBadge({ value }: { value: AttendanceStatus }) {
  return <span className={`status ${value}`}>{value}</span>;
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <article className="info-card">
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  );
}

function averageFocus(students: Student[]) {
  if (students.length === 0) return 0;
  return Math.round((students.reduce((total, student) => total + student.focusSeconds / Math.max(student.focusSeconds + student.awaySeconds, 1), 0) / students.length) * 100);
}
