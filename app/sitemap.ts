import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/metadata";

const PUBLIC_ROUTES = ["/", "/pricing", "/faq", "/terms", "/privacy", "/contacts", "/demo"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route),
    lastModified: now,
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : route === "/pricing" ? 0.9 : 0.7
  }));
}
