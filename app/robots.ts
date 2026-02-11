import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/faq", "/terms", "/privacy", "/demo", "/contacts"],
        disallow: [
          "/api/",
          "/admin",
          "/dashboard",
          "/account",
          "/app",
          "/agents",
          "/board",
          "/billing",
          "/tasks",
          "/tools",
          "/knowledge",
          "/workflow",
          "/workflows",
          "/workforce",
          "/login",
          "/register",
          "/auth"
        ]
      }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL
  };
}
