import { pricing } from "@/lib/data";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo/metadata";

export type JsonLdNode = Record<string, unknown>;

const offerPriceRub = Number(process.env.NEXT_PUBLIC_SEO_PRICE_RUB || pricing.monthlyPrice || 2000);

export const buildOrganizationSchema = (): JsonLdNode => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: absoluteUrl("/icons/icon.svg"),
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "agentos@mail.ru",
      availableLanguage: ["Russian"]
    }
  ],
  sameAs: ["https://t.me/QuadrantManager", "https://t.me/QuadrantAgentOS"]
});

export const buildWebApplicationSchema = (): JsonLdNode => ({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: "ru-RU",
  description:
    "Платформа ИИ-агентов для продаж и маркетинга: ресёрч, персонализация, аутрич, контент и workflow-автоматизация."
});

export const buildProductSchema = (path = "/pricing"): JsonLdNode => ({
  "@context": "https://schema.org",
  "@type": "Product",
  name: `${SITE_NAME} — подписка`,
  description:
    "Подписка на AgentOS: доступ к ИИ-агентам для лидогенерации, аутрича, анализа конкурентов и контент-воронки.",
  brand: {
    "@type": "Brand",
    name: SITE_NAME
  },
  offers: {
    "@type": "Offer",
    price: String(offerPriceRub),
    priceCurrency: "RUB",
    availability: "https://schema.org/InStock",
    category: "SaaS subscription",
    url: absoluteUrl(path)
  }
});

export const buildFaqSchema = (
  items: Array<{ question: string; answer: string }>
): JsonLdNode => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer
    }
  }))
});
