import type { Metadata } from "next";

const normalizeUrl = (rawUrl?: string | null) => {
  const fallback = "https://agentos.ru";
  const base = String(rawUrl || fallback).trim();
  if (!base) return fallback;
  const withProtocol = base.startsWith("http://") || base.startsWith("https://") ? base : `https://${base}`;
  try {
    const url = new URL(withProtocol);
    return url.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
};

export const SITE_NAME = "AgentOS";
export const SITE_LOCALE = "ru_RU";
export const SITE_LANGUAGE = "ru";
export const SITE_DESCRIPTION =
  "AgentOS — платформа ИИ-агентов для лидогенерации, персонализации, аутрича и контента для рынка РФ и СНГ.";
export const SITE_URL = normalizeUrl(process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL);
export const OG_IMAGE_PATH = "/og/agentos-og.svg";
export const OG_FALLBACK_PATH = "/og/agentos-og-fallback.svg";

export const absoluteUrl = (path = "/") => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, `${SITE_URL}/`).toString();
};

export const privateRobots: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
  noarchive: true,
  nosnippet: true,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
    nosnippet: true,
    "max-video-preview": 0,
    "max-image-preview": "none",
    "max-snippet": 0
  }
};

export const publicRobots: NonNullable<Metadata["robots"]> = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    "max-video-preview": -1,
    "max-image-preview": "large",
    "max-snippet": 160
  }
};

type BuildPageMetadataInput = {
  title: string;
  description: string;
  path?: string;
  keywords?: string[];
  noIndex?: boolean;
  type?: "website" | "article";
  imagePath?: string;
};

export const buildPageMetadata = ({
  title,
  description,
  path = "/",
  keywords = [],
  noIndex = false,
  type = "website",
  imagePath
}: BuildPageMetadataInput): Metadata => {
  const image = imagePath || OG_IMAGE_PATH;
  const canonical = absoluteUrl(path);
  const imageUrl = absoluteUrl(image);
  const fallbackImageUrl = absoluteUrl(OG_FALLBACK_PATH);

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale: SITE_LOCALE,
      type,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} — AI агенты для продаж и маркетинга`
        },
        {
          url: fallbackImageUrl,
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} — fallback image`
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl]
    },
    robots: noIndex ? privateRobots : publicRobots
  };
};
