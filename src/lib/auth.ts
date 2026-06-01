import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

export type AuthRole = "teacher" | "student";

export interface AuthSession {
  sub: string;
  role: AuthRole;
  name?: string;
  sessionId?: string;
}

const cookieName = "mandarin_session";

function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET harus diset minimal 32 karakter.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: AuthSession) {
  return new SignJWT({ role: payload.role, name: payload.name, sessionId: payload.sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

export async function setSessionCookie(payload: AuthSession) {
  const token = await createSessionToken(payload);
  const jar = await cookies();
  jar.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(cookieName);
}

export async function getSession(): Promise<AuthSession | null> {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (!token) return null;

  try {
    const verified = await jwtVerify(token, secretKey());
    const role = verified.payload.role;
    if (role !== "teacher" && role !== "student") return null;
    return {
      sub: verified.payload.sub ?? "",
      role,
      name: typeof verified.payload.name === "string" ? verified.payload.name : undefined,
      sessionId: typeof verified.payload.sessionId === "string" ? verified.payload.sessionId : undefined,
    };
  } catch {
    return null;
  }
}

export async function requireTeacher() {
  const session = await getSession();
  if (session?.role !== "teacher") throw new Error("Teacher auth required.");
  return session;
}

export async function requireStudent() {
  const session = await getSession();
  if (session?.role !== "student") throw new Error("Student auth required.");
  return session;
}
