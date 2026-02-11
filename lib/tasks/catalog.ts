export type TaskAgentCatalogItem = {
  id: string;
  name: string;
  description: string;
  tags: string[];
};

export const AGENT_CATALOG: TaskAgentCatalogItem[] = [
  {
    id: "platon",
    name: "Платон — находит подходящие компании для продаж.",
    description: "ICP-сегменты и список компаний-кандидатов по РФ/СНГ.",
    tags: ["лиды", "компании", "контакты", "сегменты", "icp", "b2b", "research", "карты", "категория", "город"]
  },
  {
    id: "maxim",
    name: "Максим — Local Leads (RU карты/каталоги)",
    description: "Локальные лиды по картам/каталогам.",
    tags: ["локальные", "карты", "категория", "город", "места", "osm", "стоматология", "офлайн"]
  },
  {
    id: "leonid-outreach-dm-ru",
    name: "Леонид — Outreach DM (RU мессенджеры/соцсети)",
    description: "DM-сообщения для Telegram/VK/WhatsApp без воды.",
    tags: ["сообщения", "dm", "аутрич", "мессенджеры", "telegram", "vk"]
  },
  {
    id: "emelyan-cold-email-ru",
    name: "Емельян — Cold Email (RU email-аутрич)",
    description: "RU cold email-цепочки без воды.",
    tags: ["email", "почта", "рассылка", "аутрич", "письма"]
  },
  {
    id: "anatoly",
    name: "Мария — Разбор компании",
    description: "Разбор компании и зацепки для персонализации.",
    tags: ["разбор", "компания", "анализ", "профиль", "исследование"]
  },
  {
    id: "timofey-competitor-analysis-ru",
    name: "Тимофей — Competitor Analysis (RU конкуренты/позиционирование)",
    description: "Сравнение конкурентов и углы позиционирования.",
    tags: ["конкуренты", "позиционирование", "рынок", "анализ"]
  },
  {
    id: "fedor-b2b-leads-ru",
    name: "Фёдор — B2B Leads (RU реестры/каталоги/сайты)",
    description: "B2B-лиды из реестров/каталогов/ассоциаций.",
    tags: ["b2b", "реестры", "каталоги", "лиды", "компании"]
  },
  {
    id: "artem-hot-leads-ru",
    name: "Артём — Hot Leads (RU ‘горячие’ сигналы)",
    description: "Горячие публичные сигналы о поиске подрядчиков.",
    tags: ["горячие", "сигналы", "тендер", "заявки", "публичные"]
  },
  {
    id: "boris-bdr-operator-ru",
    name: "Борис — BDR Operator (RU склейка лидов)",
    description: "Склейка лидов + текстов в READY очередь.",
    tags: ["склейка", "bdr", "ready", "лиды", "очередь"]
  },
  {
    id: "pavel-reels-analysis-ru",
    name: "Павел — Reels Analysis (RU Reels/короткие)",
    description: "Разбор коротких роликов под RU аудиторию.",
    tags: ["reels", "shorts", "анализ", "ролики", "видео"]
  },
  {
    id: "trofim-shorts-analogs-ru",
    name: "Трофим — TikTok/Shorts Analysis (RU аналоги)",
    description: "Форматы коротких видео и аналоги под РФ.",
    tags: ["shorts", "tiktok", "форматы", "аналог", "видео"]
  },
  {
    id: "irina-content-ideation-ru",
    name: "Ирина — Content Ideation (RU рубрикатор)",
    description: "Рубрикатор и темы для лидогенерации.",
    tags: ["рубрикатор", "темы", "идеи", "контент"]
  },
  {
    id: "hariton-viral-hooks-ru",
    name: "Харитон — Viral Hooks & Writing (RU тексты)",
    description: "Хуки, посты и короткие скрипты.",
    tags: ["хуки", "тексты", "посты", "скрипты", "контент"]
  },
  {
    id: "kostya-image-generation-ru",
    name: "Костя — Image Generation (RU визуалы)",
    description: "Идеи визуалов, промпты и ТЗ.",
    tags: ["визуал", "картинки", "промпты", "дизайн"]
  },
  {
    id: "seva-content-repurposing-ru",
    name: "Сева — Content Repurposing (RU 1→10)",
    description: "Пакет контента 1→10 из одного кейса.",
    tags: ["репак", "перепаковка", "контент", "1→10", "кейсы"]
  },
  {
    id: "mitya-workflow-diagram-ru",
    name: "Анастасия — Workflow & Diagram Architect (RU схемы)",
    description: "Схемы процессов и тексты для лендинга.",
    tags: ["схема", "диаграмма", "процесс", "воронка", "архитектура"]
  }
];

export const getAgentById = (id: string) => AGENT_CATALOG.find((agent) => agent.id === id);
