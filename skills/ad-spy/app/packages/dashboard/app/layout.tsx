import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./ad-spy.css";

export const metadata: Metadata = { title: "Ad Spy" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="light" />
      </head>
      <body>{children}</body>
    </html>
  );
}
