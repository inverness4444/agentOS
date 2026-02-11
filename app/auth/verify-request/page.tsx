import type { Metadata } from "next";
import Section from "@/components/Section";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Проверка email",
  description: "Промежуточная страница подтверждения входа AgentOS.",
  path: "/auth/verify-request",
  noIndex: true
});

export default function VerifyRequestPage() {
  return (
    <Section className="pt-24">
      <div className="mx-auto w-full max-w-xl rounded-3xl border border-slate-200/70 bg-white px-6 py-8 text-center shadow-soft sm:px-10">
        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
          Ссылка отправлена
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-[#1F2238]">
          Проверьте почту
        </h1>
        <p className="mt-3 text-sm text-[#5A6072] sm:text-base">
          Мы отправили magic link для входа. Откройте письмо и перейдите по
          ссылке, чтобы продолжить.
        </p>
      </div>
    </Section>
  );
}
