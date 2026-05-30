import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mandarin Class MVP",
  description: "Prototype kelas live, fokus, dan quiz untuk pembelajaran Mandarin.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
