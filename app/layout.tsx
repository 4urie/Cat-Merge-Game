import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cat Merge — A little room for a lot of cats",
  description:
    "Drop, merge, repeat. A cozy, notebook-inspired cat merging game.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
