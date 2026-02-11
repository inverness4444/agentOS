import type { Metadata } from "next";
import type { ReactNode } from "react";
import { privateRobots } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  robots: privateRobots
};

export default function WorkflowsLayout({ children }: { children: ReactNode }) {
  return children;
}
