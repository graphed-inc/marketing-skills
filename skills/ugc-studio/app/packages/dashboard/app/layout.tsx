import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./studio.css";

export const metadata: Metadata = { title: "UGC Studio" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
