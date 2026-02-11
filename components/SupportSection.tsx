import Section from "./Section";

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

const ContactItem = ({
  href,
  label,
  value,
  icon,
}: {
  href: string;
  label: string;
  value: string;
  icon: React.ReactNode;
}) => (
  <a
    href={href}
    className="group flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white px-5 py-4 text-[#1F2238] shadow-sm transition hover:-translate-y-0.5"
  >
    <span className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200/70 bg-white text-[#4E4FE0]">
      {icon}
    </span>
    <span className="flex flex-col">
      <span className="text-[11px] uppercase tracking-[0.2em] text-[#7C7CF6]">
        {label}
      </span>
      <span className="text-sm font-semibold sm:text-base">{value}</span>
    </span>
  </a>
);

export default function SupportSection() {
  return (
    <Section>
      <div className="rounded-3xl border border-slate-200/70 bg-white p-8 shadow-sm md:p-10 text-[#1F2238]">
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
            Поддержка и контакты
          </div>
          <p className="mt-4 text-lg font-medium text-[#1F2238]">
            Если что-то не работает или есть вопросы по agentOS — напишите нам, мы
            поможем.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <ContactItem
            href="mailto:agentos@mail.ru"
            label="Почта"
            value="agentos@mail.ru"
            icon={<MailIcon />}
          />
          <ContactItem
            href="https://t.me/QuadrantManager"
            label="Telegram"
            value="@QuadrantManager"
            icon={<TelegramIcon />}
          />
          <ContactItem
            href="https://t.me/QuadrantAgentOS"
            label="Telegram-канал"
            value="t.me/QuadrantAgentOS"
            icon={<ChannelIcon />}
          />
        </div>
      </div>
    </Section>
  );
}
