import type { Metadata } from "next";
import type { ReactNode } from "react";
import AppShell from "@/components/app/AppShell";
import { privateRobots } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  robots: privateRobots
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
