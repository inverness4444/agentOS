import { notFound } from "next/navigation";
import SystemAuditClient from "./system-audit-client";

export default function SystemAuditPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <SystemAuditClient />;
}
