import Link from "next/link";
import Container from "./Container";

const MailIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
    <path d="m22 8-10 6L2 8" />
  </svg>
);

const TelegramIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </svg>
);

const ChannelIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 20c2-4 6-6 8-6s6 2 8 6" />
    <circle cx="12" cy="8" r="3" />
  </svg>
);

export default function Footer() {
  return (
    <footer className="border-t border-slate-200/70 bg-white pt-12 pb-16 md:pb-20">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.9fr_1.3fr]">
          <div>
            <div className="text-lg font-semibold text-[#1F2238]">AgentOS</div>
            <p className="mt-3 text-sm text-[#5A6072]">
              Платформа ИИ-агентов для продаж, аналитики, поддержки и контента.
            </p>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#7C7CF6]">
              Документы
            </div>
            <div className="mt-3 space-y-2 text-sm text-[#2B2C4B]">
              <Link href="/privacy" className="block transition hover:text-[#1F2238]">
                Политика конфиденциальности
              </Link>
              <Link href="/terms" className="block transition hover:text-[#1F2238]">
                Условия использования
              </Link>
              <Link href="/pricing" className="block transition hover:text-[#1F2238]">
                Тарифы
              </Link>
              <Link href="/faq" className="block transition hover:text-[#1F2238]">
                FAQ — вопросы и ответы
              </Link>
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#7C7CF6]">
              Поддержка и контакты
            </div>
            <p className="mt-3 text-sm text-[#5A6072]">
              Если что-то не работает или есть вопросы по agentOS — напишите нам,
              мы поможем.
            </p>
            <div className="mt-4 flex gap-3">
              <a
                href="mailto:agentos@mail.ru"
                aria-label="Почта agentos@mail.ru"
                title="agentos@mail.ru"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200/70 text-[#2B2C4B] transition hover:-translate-y-0.5 hover:border-slate-300"
              >
                <MailIcon />
              </a>
              <a
                href="https://t.me/QuadrantManager"
                aria-label="Telegram поддержка @QuadrantManager"
                title="@QuadrantManager"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200/70 text-[#2B2C4B] transition hover:-translate-y-0.5 hover:border-slate-300"
              >
                <TelegramIcon />
              </a>
              <a
                href="https://t.me/QuadrantAgentOS"
                aria-label="Telegram-канал QuadrantAgentOS"
                title="t.me/QuadrantAgentOS"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200/70 text-[#2B2C4B] transition hover:-translate-y-0.5 hover:border-slate-300"
              >
                <ChannelIcon />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-xs text-[#7A7F91]">
          <div>© {new Date().getFullYear()} AgentOS by Quadrant</div>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/privacy" className="transition hover:text-[#1F2238]">
              Политика конфиденциальности
            </Link>
            <Link href="/terms" className="transition hover:text-[#1F2238]">
              Условия использования
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}
