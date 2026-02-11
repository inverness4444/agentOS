import Link from "next/link";
import Section from "./Section";

const Arrow = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12h14" />
    <path d="m13 5 6 7-6 7" />
  </svg>
);

export default function LegalSection() {
  return (
    <Section>
      <div className="rounded-3xl border border-slate-200/70 bg-white p-8 shadow-sm md:p-10 text-[#1F2238]">
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-[0.2em] text-[#4E4FE0]">
            Условия
          </div>
          <h2
            className="mt-3 text-3xl font-semibold text-[#1F2238]"
            style={{ color: "#1F2238" }}
          >
            Условия
          </h2>
          <p
            className="mt-3 text-sm text-[#5A6072] sm:text-base"
            style={{ color: "#5A6072" }}
          >
            Короткий доступ к основным юридическим документам agentOS.
          </p>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <Link
            href="/privacy"
            className="group flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white px-6 py-5 text-[#1F2238] shadow-sm transition hover:-translate-y-0.5"
          >
            <span
              className="text-sm font-semibold sm:text-base"
              style={{ color: "#1F2238" }}
            >
              Политика конфиденциальности
            </span>
            <span className="text-[#4E4FE0] transition group-hover:translate-x-0.5">
              <Arrow />
            </span>
          </Link>

          <Link
            href="/terms"
            className="group flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white px-6 py-5 text-[#1F2238] shadow-sm transition hover:-translate-y-0.5"
          >
            <span
              className="text-sm font-semibold sm:text-base"
              style={{ color: "#1F2238" }}
            >
              Условия использования
            </span>
            <span className="text-[#4E4FE0] transition group-hover:translate-x-0.5">
              <Arrow />
            </span>
          </Link>
        </div>

        <Link
          href="/faq"
          className="group mt-4 flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white px-6 py-5 text-[#1F2238] shadow-sm transition hover:-translate-y-0.5 lg:mx-auto lg:max-w-[680px]"
        >
          <span
            className="text-sm font-semibold sm:text-base"
            style={{ color: "#1F2238" }}
          >
            FAQ — популярные вопросы и ответы
          </span>
          <span className="text-[#4E4FE0] transition group-hover:translate-x-0.5">
            <Arrow />
          </span>
        </Link>
      </div>
    </Section>
  );
}
