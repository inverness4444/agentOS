import type { Metadata } from "next";
import DepartmentSection from "@/components/DepartmentSection";
import Comparison from "@/components/Comparison";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import GettingStarted from "@/components/GettingStarted";
import PricingSection from "@/components/PricingSection";
import Testimonials from "@/components/Testimonials";
import WorkBlock from "@/components/WorkBlock";
import ScrollCta from "@/components/ScrollCta";
import LegalSection from "@/components/LegalSection";
import SeoContentSection from "@/components/landing/SeoContentSection";
import JsonLd from "@/components/seo/JsonLd";
import { departments, trustBadges } from "@/lib/data";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
  buildOrganizationSchema,
  buildProductSchema,
  buildWebApplicationSchema
} from "@/lib/seo/schema";

export const metadata: Metadata = buildPageMetadata({
  title: "AgentOS — AI-агенты для продаж, маркетинга и контента",
  description:
    "Платформа из 20 ИИ-агентов для рынка РФ/СНГ: лидогенерация, персонализация, аутрич, контент и совет директоров.",
  path: "/",
  keywords: [
    "ии агенты для продаж",
    "автоматизация отдела продаж",
    "аутрич и персонализация",
    "контент-маркетинг с ии",
    "agentos"
  ]
});

export default function Home() {
  return (
    <main>
      <JsonLd
        id="ld-home"
        data={[buildOrganizationSchema(), buildWebApplicationSchema(), buildProductSchema("/pricing")]}
      />
      <Header />
      <Hero
        title="AgentOS — готовый отдел продаж и контента из ИИ-агентов"
        subtitle="20 агентов, которые выполняют работу: лиды, персонализация, аутрич, контент и упаковка. Это не чат-бот — это рабочая система, которую вы запускаете по кнопке."
        trustBadges={trustBadges}
      />

      {departments.map((department) => (
        <DepartmentSection key={department.id} department={department} />
      ))}

      <SeoContentSection />
      <WorkBlock />
      <GettingStarted />
      <Comparison />
      <Testimonials />
      <PricingSection />
      <LegalSection />
      <Footer />
      <ScrollCta />
    </main>
  );
}
