import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./spreadsheet.css";

export const metadata: Metadata = { title: "Tables" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
