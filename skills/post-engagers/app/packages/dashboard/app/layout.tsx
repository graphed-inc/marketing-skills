import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./post-engagers.css";

export const metadata: Metadata = { title: "Post Engagers" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
