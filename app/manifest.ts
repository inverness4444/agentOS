import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/seo/metadata";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: "ru-RU",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F6F7FF",
    theme_color: "#5C5BD6",
    icons: [
      {
        src: "/icons/icon.svg",
        type: "image/svg+xml",
        sizes: "any"
      },
      {
        src: "/icons/apple-touch-icon.svg",
        type: "image/svg+xml",
        sizes: "180x180",
        purpose: "any"
      }
    ]
  };
}
