import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "__PROJECT_NAME__",
  description: "__PROJECT_NAME__ — running on Graphed",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // SidebarProvider writes sidebar_state and uses defaultOpen as its initial
  // value. It does not read the cookie itself.
  const defaultOpen = cookies().get("sidebar_state")?.value !== "false";

  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppShell defaultOpen={defaultOpen}>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
