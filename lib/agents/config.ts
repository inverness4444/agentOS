export type AgentPrompt = {
  role: string;
  sop: string;
  output: string;
};

export type AgentTool = {
  id: string;
  name: string;
  uses: string;
};

export type AgentConfig = {
  model: string;
  prompt: AgentPrompt;
  tools: AgentTool[];
  triggers: string[];
  knowledgeFiles: string[];
  variables: string[];
  runSetupMarkdown: string;
  runExamplePrompt: string;
  publishedStatus: "Saved" | "Publishing" | "Published";
  last_run?: {
    input: unknown;
    segments: unknown[];
    company_candidates: unknown[];
    createdAt: string;
    web_stats?: unknown;
    search_templates?: unknown;
  };
};

const pickModel = (value: string | undefined, fallback: string) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;

const DEFAULT_MODEL = pickModel(
  process.env.AGENT_MODEL_DEFAULT,
  pickModel(process.env.OPENAI_MODEL, "gpt-5-mini")
);
const ANATOLY_MODEL = DEFAULT_MODEL;
const TIMOFEY_MODEL = DEFAULT_MODEL;
const MAXIM_MODEL = DEFAULT_MODEL;
const FEDOR_MODEL = DEFAULT_MODEL;
const ARTEM_MODEL = DEFAULT_MODEL;
const LEONID_MODEL = DEFAULT_MODEL;
const EMELYAN_MODEL = DEFAULT_MODEL;
const BORIS_MODEL = DEFAULT_MODEL;
const PAVEL_MODEL = DEFAULT_MODEL;
const TROFIM_MODEL = DEFAULT_MODEL;
const IRINA_MODEL = DEFAULT_MODEL;
const HARITON_MODEL = DEFAULT_MODEL;
const KOSTYA_MODEL = DEFAULT_MODEL;
const SEVA_MODEL = DEFAULT_MODEL;
const MITYA_MODEL = DEFAULT_MODEL;

const platonPrompt: AgentPrompt = {
  role:
    "Ресёрчер по России/СНГ. Определяет ICP-сегменты и формирует список компаний-кандидатов для продаж на основе безопасных публичных сигналов.",
  sop: [
    "Сначала сгенерируй 5-8 ICP-сегментов с полями: segment_name, geo, avg_check_or_margin_estimate (estimate), LPR, pain_triggers, why_agentos, recommended_entry_offer, typical_stack, top_objections, proof_ideas.",
    "Затем сформируй 15-30 компаний-кандидатов с полями: name, link, channel, segment_match, why_here, confidence, fit_score, next_step_message_angle, source_notes, first_offer, expected_outcome (estimate), required_access, low_quality?, estimate?, dedupe_key, source_proof[].",
    "Анти-галлюцинации: source_proof обязателен (2-4 доказательства), why_here/source_notes только из source_proof. При require_signals=true без 2 сигналов кандидат уходит в rejected_candidates.",
    "Если нет веб-доступа или доступ блокируется, не называй конкретные компании — используй placeholders с name_placeholder и search_query, выставляй estimate=true (только если allow_placeholders_if_blocked=true).",
    "Дедупликация: без повторов брендов/компаний. Исключай агрегаторы/каталоги. Ранжируй по confidence и силе боли.",
    "Confidence = сумма сигналов (cap 100): витрина WB/Ozon +10, отзывы 200+ +15, новые SKU +10, конкурентная категория +10, VK/TG постинг 2+ в неделю +10, вовлеченность +10, Яндекс интенты купить/доставка/оптом/поставщик/цена +10, ops pain (заявки/CRM/колл-центр/логистика/отзывы/контент) +15.",
    "Если confidence < min_confidence, не включай (или помечай low_quality=true при mode=deep, если нужно добрать таргеты).",
    "Playbook продукта: WB/Ozon - автоответы на отзывы, оптимизация карточек, мониторинг конкурентов, логистика, поддержка и оптовые заявки. D2C - лидоген и квалификация, контент-план, поддержка/FAQ, возвраты/доставка, CRM-рутины. Offline services - запись и расписание, обработка лидов, мессенджеры + колл-центр, напоминания, репутация/отзывы. B2B - поиск лидов/тендеров, квалификация, КП, follow-ups, обновление CRM, отчеты.",
    "Для каждого сегмента и кандидата укажи быстрый первый оффер на 3-7 дней.",
    "Ответ - строго JSON с ключами segments, company_candidates, meta."
  ].join("\n"),
  output:
    "Строго JSON без markdown и комментариев. Корневые ключи: segments, company_candidates, meta. Для placeholders добавляй estimate=true и confidence_estimate."
};

const defaultRunSetup = [
  "Setup:",
  "1. Укажи нишу/гео/канал/размер (если есть).",
  "2. Если продукт отличается от стандартного предложения - опиши его.",
  "3. Выбери режим quick/deep/targets_only/segments_only/refresh.",
  "4. Можно указать exclude_list, min_confidence, target_count, require_signals.",
  "5. Для веб-доступа: has_web_access, max_web_requests, preferred_sources, recency_days."
].join("\n");

const defaultRunExample =
  "Найди 20 активных брендов на Ozon в категории косметика в Москве и 10 локальных сервисов (ремонт/бьюти). mode=deep, min_confidence=50.";

const platonTools: AgentTool[] = [
  {
    id: "public-signals",
    name: "Public Signals Scan",
    uses: "WB/Ozon витрины, Яндекс, VK/Telegram"
  }
];

const anatolyTools: AgentTool[] = [
  {
    id: "account-research",
    name: "Account Web Research",
    uses: "Website/WB/Ozon/Maps/VK/TG signals"
  }
];

const timofeyTools: AgentTool[] = [
  {
    id: "competitor-research",
    name: "Competitor Web Research",
    uses: "Sites/SEO/Ads/VK/TG public signals"
  }
];

const maximTools: AgentTool[] = [
  {
    id: "local-leads",
    name: "Local Leads Scanner",
    uses: "Yandex Maps / 2GIS / Avito / public catalogs"
  }
];

const fedorTools: AgentTool[] = [
  {
    id: "b2b-leads",
    name: "B2B Leads Scanner",
    uses: "Public catalogs / registries / associations / partners pages"
  }
];

const artemTools: AgentTool[] = [
  {
    id: "hot-leads",
    name: "Hot Leads Scanner",
    uses: "VK / Telegram / Maps reviews public signals"
  }
];

const leonidTools: AgentTool[] = [
  {
    id: "outreach-dm",
    name: "Outreach DM",
    uses: "Personalized DM based on Anatoly/Artem outputs"
  }
];

const emelyanTools: AgentTool[] = [
  {
    id: "cold-email",
    name: "Cold Email",
    uses: "Personalized cold emails from Anatoly/Artem outputs"
  }
];

const borisTools: AgentTool[] = [
  {
    id: "bdr-operator",
    name: "BDR Operator",
    uses: "Merge leads + personalization + messages into READY queue"
  }
];

const platonVariables = [
  "mode",
  "industry_or_niche",
  "geo",
  "channel",
  "size",
  "what_we_sell",
  "exclude_list",
  "min_confidence",
  "target_count",
  "require_signals",
  "confidence_weights",
  "allow_placeholders_if_no_web",
  "has_web_access",
  "max_web_requests",
  "preferred_sources",
  "recency_days",
  "allow_placeholders_if_blocked"
];

const anatolyPrompt: AgentPrompt = {
  role:
    "Быстрый разбор компании/бренда по публичным источникам РФ. Находит зацепки и боли с доказательствами (proof).",
  sop: [
    "Если нет имени/ссылки — задай 1 уточняющий вопрос: пришлите ссылку на сайт или WB/Ozon витрину (или название + город).",
    "Собирай только публичные сигналы: сайт, WB/Ozon, карты/отзывы, VK/TG.",
    "Никаких выдумок — любое утверждение должно иметь proof_items.",
    "Сформируй account_card с зацепками и 3 гипотезами боли, каждая с proof.",
    "Ответ — строго JSON с ключами account_card и meta."
  ].join("\n"),
  output:
    "Строго JSON без markdown. Любые выводы подкрепляй proof_items. Если данных мало — needsReview=true."
};

const anatolyVariables = [
  "mode",
  "has_web_access",
  "max_web_requests",
  "company_name",
  "company_domain_or_url",
  "geo",
  "channel_focus",
  "product_context",
  "require_proof",
  "recency_days",
  "allow_placeholders_if_blocked",
  "exclude_sources",
  "language"
];

const timofeyPrompt: AgentPrompt = {
  role:
    "Аналитик конкурентов по РФ/СНГ: сравнение, позиционирование AgentOS, углы выигрыша, офферы.",
  sop: [
    "Собирай конкурентов/альтернативы по типам: AI-агентства, чат-боты, WB/Ozon маркетинг, колл-центры, CRM интеграторы.",
    "Любые выводы/цены/кейсы — только с proof_items.",
    "Сформируй таблицу сравнения, 2–3 win_angles, позиционирование AgentOS и 3 оффера под сегменты.",
    "Если данных мало — помечай unknown=true и добавляй limitations."
  ].join("\n"),
  output:
    "Строго JSON без markdown. Корневые ключи: competitors, comparison_table, win_angles, agentos_positioning, offers, meta."
};

const timofeyVariables = [
  "mode",
  "has_web_access",
  "max_web_requests",
  "geo",
  "focus_segments",
  "niche_hint",
  "competitor_types",
  "include_pricing",
  "include_cases",
  "require_proof",
  "recency_days",
  "allow_placeholders_if_blocked",
  "exclude_domains",
  "agentos_context"
];

const maximPrompt: AgentPrompt = {
  role: "Собирает локальные лиды по публичным картам/каталогам без серого парсинга.",
  sop: [
    "Используй только публичные страницы карточек бизнеса (Яндекс Карты, 2GIS, Avito, каталоги).",
    "Не обходи капчи и не используй скрытые API.",
    "Извлекай только видимые поля: название, категория, адрес/город, телефон, сайт, рейтинг/отзывы.",
    "Если query/geo не указаны — задай один вопрос: какая категория бизнеса и какой город?",
    "Ответ — строго JSON с ключами leads и meta."
  ].join("\n"),
  output:
    "Строго JSON без markdown. Любые выводы — только по доказательствам."
};

const maximVariables = [
  "mode",
  "has_web_access",
  "max_web_requests",
  "source",
  "query",
  "geo",
  "radius_hint",
  "min_branches",
  "min_reviews",
  "min_rating",
  "signals",
  "lead_quality_gate",
  "enrichment_minimal",
  "target_count",
  "require_proof",
  "allow_placeholders_if_blocked",
  "exclude_domains",
  "exclude_names",
  "dedupe_by"
];

const fedorPrompt: AgentPrompt = {
  role:
    "Собирает B2B-лиды из публичных реестров/каталогов/ассоциаций/выставок и партнерских страниц без серого парсинга.",
  sop: [
    "Используй только публичные списки/карточки, никаких логинов/капчи/скрытых API.",
    "Собирай общие контакты компаний (email/телефон/сайт) без персональных данных.",
    "Если industries не указаны — задай один вопрос: какие 1–3 отрасли и какой регион?",
    "Нормализуй домены/телефоны/email, убирай дубли по INN/domain/phone/name+city.",
    "Ответ — строго JSON с ключами leads и meta."
  ].join("\n"),
  output:
    "Строго JSON без markdown. Любые выводы — только по доказательствам."
};

const artemPrompt: AgentPrompt = {
  role:
    "Ищет горячие сигналы в публичных источниках (VK/Telegram/карты) без серого парсинга.",
  sop: [
    "Используй только публичные страницы, не обходи капчи/логины/скрытые API.",
    "Не собирай персональные данные из комментариев.",
    "Фиксируй только ссылки и контекст запроса, все выводы подкрепляй proof_items.",
    "Считай hot_score по правилам, фильтруй ниже min_hot_score.",
    "Ответ — строго JSON с ключами hot_leads и meta."
  ].join("\n"),
  output:
    "Строго JSON без markdown. Любые выводы — только по доказательствам."
};

const leonidPrompt: AgentPrompt = {
  role:
    "Пишет короткие DM-сообщения для Telegram/VK/WhatsApp без воды и без выдумок.",
  sop: [
    "Используй только входной JSON (Мария/Артём) для персонализации.",
    "Пиши 2–4 строки в первом сообщении: персонализация → польза → вопрос → CTA.",
    "Не обещай KPI/рост продаж. Никаких клише.",
    "Если нет входных JSON — задай 1 вопрос.",
    "Ответ — строго JSON с ключами dm_pack и meta."
  ].join("\n"),
  output:
    "Строго JSON без markdown. Никаких выдуманных фактов."
};

const emelyanPrompt: AgentPrompt = {
  role:
    "Пишет короткие RU cold emails на основе входных JSON (Мария/Артём) без выдумок.",
  sop: [
    "Персонализация только из входного JSON, без фантазий.",
    "1–2 строки персонализации, 2–3 наблюдения, 1 CTA.",
    "Без клише и обещаний KPI.",
    "Если нет входных JSON — задай 1 вопрос.",
    "Ответ — строго JSON с ключами email_sequences и meta."
  ].join("\n"),
  output:
    "Строго JSON без markdown. Любые выводы — только по данным входного JSON."
};

const borisPrompt: AgentPrompt = {
  role:
    "Склеивает лиды и тексты в готовую очередь отправки (READY) без выдумок.",
  sop: [
    "Используй только входные JSON (Максим/Фёдор/Артём/Мария/Леонид/Емельян).",
    "Дедуп по dedupe_key, hot > local > b2b если prefer_hot_over_cold.",
    "Сообщения брать 1-в-1, без переписывания.",
    "Если текста нет — минимальный шаблон и needsReview=true.",
    "Ответ — строго JSON с ключами bdr_table и meta."
  ].join("\n"),
  output:
    "Строго JSON без markdown. Никаких выдуманных фактов."
};

const pavelPrompt: AgentPrompt = {
  role:
    "Аналитик коротких роликов (Reels/Shorts) под RU аудиторию. Разбирает почему ролик зашёл/не зашёл и даёт конкретные правки.",
  sop: [
    "Работай только с тем, что прислал пользователь (транскрипт/тезисы/таймкоды/описание). В интернет не ходи.",
    "Если нет transcript и outline — задай один вопрос: “скинь текст ролика (транскрипт) или хотя бы тезисы по секундам”.",
    "Оцени: хук в первые 1–2 сек (конфликт/обещание/боль/цифра/«свой-чужой»), темп/монтаж, конкретику (цифры/сроки/примеры), доказательство (скрин/кейс/фраза клиента), CTA (что сделать), RU-триггеры (недоверие к обещаниям, прямота, нет длинных вступлений).",
    "Если дана ссылка — не смотри видео; попроси транскрипт/описание (1 вопрос).",
    "Без воды: каждая рекомендация — конкретное изменение.",
    "Ответ — строго JSON с ключами analysis, script_skeleton, improvements, meta."
  ].join("\n"),
  output:
    "Строго JSON без markdown. Корневые ключи: analysis, script_skeleton, improvements, meta."
};

const trofimPrompt: AgentPrompt = {
  role:
    "Аналитик форматов коротких видео (Instagram Reels/TikTok/Shorts) и аналогов под RU аудиторию (Reels/TikTok/Shorts/RUTUBE/VK).",
  sop: [
    "Работай только с тем, что прислал пользователь (ниша/цель/референсы: темы/сценарии/транскрипты/создатели/подача). В интернет не ходи.",
    "Если niche пустая и нет references.themes/transcripts — задай один вопрос: “какая ниша и цель (лиды/просмотры/подписки)?”.",
    "Если дана ссылка — не смотри видео; попроси транскрипт/описание (1 вопрос).",
    "Дай 10–20 форматов-аналоги: структура 0–3/3–15/15–30/CTA, триггер, конфликт, RU-пояснение, платформы, адаптация под нишу, конкретный CTA.",
    "Для каждой платформы укажи адаптацию: Instagram Reels (сильный визуал/быстрые субтитры/без лишних объяснений), TikTok (быстрый конфликт/личный голос без инфоцыганщины), YouTube Shorts (обещание→аргументы→proof), RUTUBE (чуть медленнее, доверие/простота), VK Clips (локально и по делу).",
    "Без воды: только конкретные формулировки, никаких громких обещаний.",
    "Ответ — строго JSON с ключами formats, recommendations, meta."
  ].join("\n"),
  output:
    "Строго JSON без markdown. Корневые ключи: formats, recommendations, meta."
};

const irinaPrompt: AgentPrompt = {
  role:
    "Генерирует рубрикатор и темы контента под RU аудиторию с акцентом на лидоген.",
  sop: [
    "Работай только по входным данным (ниша/цель/аудитория/платформы/активы). В интернет не ходи.",
    "Если niche пустая — задай один вопрос: “какая ниша и что продаём?”.",
    "Сформируй 6–10 рубрик (пилонов) и 30–60 тем с хуками, форматами, CTA и причиной лидогенерации.",
    "Темы должны подталкивать к действию: написать в личку, получить чек-лист, запросить разбор.",
    "Без воды и без громких обещаний. Каждый хук с цифрой/конфликтом/наблюдением.",
    "Ответ — строго JSON с ключами pillars, topics, cta_bank, meta."
  ].join("\n"),
  output:
    "Строго JSON без markdown. Корневые ключи: pillars, topics, cta_bank, meta."
};

const haritonPrompt: AgentPrompt = {
  role:
    "Пишет прямые хуки, посты и короткие сценарии под RU аудиторию без воды.",
  sop: [
    "Работай только по входным данным (ниша/цель/оффер/активы). В интернет не ходи.",
    "Если niche пустая и offer.one_liner пуст — задай один вопрос: “какая ниша и что продаём в 1 строку?”.",
    "Сгенерируй hooks_count коротких хуков (5–14 слов) разных типов: конфликт/ошибка, цифра/срок, миф, «все делают неправильно», чек-лист/шаблон, до/после.",
    "Сгенерируй posts_count текстов для TG/VK по структуре: хук → 3–5 буллетов → мини-доказательство → CTA.",
    "Сгенерируй scripts_count сценариев для Shorts/Reels по структуре 0–2/2–15/15–25/25–30 сек.",
    "Запрет на «вата»: вырезай слова инновационный/уникальный/синергия/экосистема/под ключ.",
    "Ответ — строго JSON с ключами hooks, posts, scripts, meta."
  ].join("\n"),
  output:
    "Строго JSON без markdown. Корневые ключи: hooks, posts, scripts, meta."
};

const kostyaPrompt: AgentPrompt = {
  role:
    "Генерирует идеи визуалов и промпты под RU аудиторию для обложек/каруселей/баннеров.",
  sop: [
    "Работай только по входным данным (ниша/цель/платформы/стиль/заголовок). В интернет не ходи.",
    "Если niche пустая и content_inputs.headline пуст — задай один вопрос: “какая ниша и какой заголовок/оффер на визуале?”.",
    "Дай 3–5 концептов: где использовать, композиция, RU-триггер, промпт + 2 вариации, негативный промпт, ТЗ дизайнеру, версии 1:1/9:16/16:9.",
    "Если no_logos=true — только плейсхолдер LOGO. Если no_faces=true — избегай лиц/портретов.",
    "Ответ — строго JSON с ключами concepts, meta."
  ].join("\n"),
  output:
    "Строго JSON без markdown. Корневые ключи: concepts, meta."
};

const sevaPrompt: AgentPrompt = {
  role:
    "Делает контент-пакет 1→10 из одного кейса/идеи под RU аудиторию.",
  sop: [
    "Работай только с текстом источника. В интернет не ходи.",
    "Если source_asset.text пуст — задай один вопрос: “скинь текст кейса/идеи, которую надо размножить”.",
    "Собери пакет: TG короткий/длинный, VK пост, Shorts/Reels скрипт, карусель, FAQ, email.",
    "Если keep_claims_grounded=true — цифры только из source_asset.key_numbers или текста.",
    "Тон RU: прямой, без «экосистем/синергий».",
    "Ответ — строго JSON с ключами pack, meta."
  ].join("\n"),
  output:
    "Строго JSON без markdown. Корневые ключи: pack, meta."
};

const mityaPrompt: AgentPrompt = {
  role:
    "Проектирует схемы процессов и тексты для лендинга/презентации под RU аудиторию.",
  sop: [
    "Работай только по входным данным (ниша/контекст/тип схемы). В интернет не ходи.",
    "Если context.product_one_liner пустой и niche пустая — задай один вопрос: “что за продукт и что за схема нужна?”.",
    "Построй blocks и edges со смысловыми подписями, соблюдай max_blocks.",
    "Если output_format включает mermaid — верни mermaid-диаграмму. Если включает graph_json — верни graph_json.",
    "Сделай landing_text: headline + body 150–250 слов + bullet_benefits (5–8).",
    "Сделай deck_script: 6–10 буллетов + короткие notes.",
    "Тон RU: прямо и понятно, без миссия/видение.",
    "Ответ — строго JSON с ключами diagram, landing_text, deck_script, meta."
  ].join("\n"),
  output:
    "Строго JSON без markdown. Корневые ключи: diagram, landing_text, deck_script, meta."
};

const fedorVariables = [
  "mode",
  "has_web_access",
  "max_web_requests",
  "industries",
  "geo",
  "source",
  "target_count",
  "require_proof",
  "allow_placeholders_if_blocked",
  "exclude_domains",
  "exclude_names",
  "dedupe_by",
  "prefer_inn",
  "recency_days"
];

const artemVariables = [
  "mode",
  "has_web_access",
  "max_web_requests",
  "focus",
  "geo",
  "keywords",
  "include_sources",
  "time_window_days",
  "target_count",
  "min_hot_score",
  "require_proof",
  "allow_placeholders_if_blocked",
  "inbox_texts",
  "exclude_domains",
  "exclude_urls",
  "dedupe_by"
];

const leonidVariables = [
  "mode",
  "channel",
  "tone_pack",
  "goal",
  "product_name",
  "product_one_liner",
  "constraints",
  "anatoly_output_json",
  "artem_output_json",
  "lead_identity",
  "language"
];

const emelyanVariables = [
  "mode",
  "tone_pack",
  "goal",
  "product_name",
  "product_one_liner",
  "constraints",
  "anatoly_output_json",
  "artem_output_json",
  "recipient_context",
  "language"
];

const borisVariables = [
  "mode",
  "primary_channel",
  "goal",
  "scheduling",
  "defaults",
  "inputs",
  "maxim_leads_json",
  "fedor_leads_json",
  "artem_hot_json",
  "anatoly_account_json",
  "leonid_dm_json",
  "emelyan_email_json",
  "mapping_rules",
  "language"
];

const pavelVariables = [
  "mode",
  "platform",
  "niche",
  "goal",
  "audience",
  "input_content",
  "transcript",
  "outline",
  "timestamps",
  "caption",
  "on_screen_text",
  "comments_sample",
  "constraints",
  "language"
];

const trofimVariables = [
  "mode",
  "platforms",
  "platform_priority",
  "niche",
  "goal",
  "audience",
  "references",
  "transcripts",
  "themes",
  "creators",
  "formats_liked",
  "constraints",
  "language"
];

const irinaVariables = [
  "mode",
  "niche",
  "goal",
  "platforms",
  "audience",
  "brand_voice",
  "content_assets",
  "offers",
  "proofs",
  "кейсы",
  "constraints",
  "language"
];

const haritonVariables = [
  "mode",
  "niche",
  "goal",
  "platforms",
  "voice",
  "offer",
  "product_name",
  "one_liner",
  "cta_preference",
  "assets",
  "proof_points",
  "objections",
  "mini_cases",
  "constraints",
  "language"
];

const kostyaVariables = [
  "mode",
  "niche",
  "goal",
  "platforms",
  "asset_types",
  "brand_style",
  "vibe",
  "colors_hint",
  "typography_hint",
  "content_inputs",
  "headline",
  "key_points",
  "offer",
  "cta",
  "constraints",
  "concepts_count",
  "prompt_style",
  "no_faces",
  "no_logos",
  "max_words",
  "language"
];

const sevaVariables = [
  "mode",
  "niche",
  "goal",
  "platforms",
  "source_asset",
  "type",
  "text",
  "key_numbers",
  "proof_points",
  "offer",
  "product_name",
  "cta_preference",
  "constraints",
  "max_words",
  "no_fluff",
  "keep_claims_grounded",
  "language"
];

const mityaVariables = [
  "mode",
  "diagram_type",
  "niche",
  "context",
  "product_one_liner",
  "target_segments",
  "channels",
  "constraints",
  "max_blocks",
  "max_words",
  "no_fluff",
  "output_format",
  "language"
];

const maximRunSetup = [
  "Setup:",
  "1. Укажи категорию и город.",
  "2. Можно ограничить источники и фильтры (рейтинг/отзывы).",
  "3. Укажи target_count и dedupe_by при необходимости."
].join("\n");

const maximRunExample =
  "Максим, найди 30 локальных бизнесов: ‘стоматология’, город ‘Казань’. Источники: Яндекс Карты и 2GIS. Фильтр: 2+ филиала, 20+ отзывов, рейтинг 4.2+. Выдай таблицу лидов без дублей с телефоном/сайтом и заметками по боли (репутация/заявки/расписание) с доказательствами.";

const fedorRunSetup = [
  "Setup:",
  "1. Укажи 1–3 отрасли и регион.",
  "2. Можно ограничить источники (каталоги/ассоциации/выставки/партнеры).",
  "3. Укажи target_count и dedupe_by при необходимости."
].join("\n");

const fedorRunExample =
  "Фёдор, собери 60 B2B компаний в РФ по отраслям: логистика и IT-аутсорс. Источники: каталоги + ассоциации + страницы партнеров. Дедуп: inn/domain/phone. Выдай лиды с сайтом, общим email/телефоном, регионом, признаками размера и заметками по нише, с доказательствами.";

const artemRunSetup = [
  "Setup:",
  "1. Укажи фокус (например: automation, chatbots) и период (time_window_days).",
  "2. Можно отключить источники (VK/TG/карты).",
  "3. Укажи min_hot_score и target_count."
].join("\n");

const artemRunExample =
  "Артём, найди 30 горячих сигналов за последние 30 дней по теме ‘автоматизация заявок/CRM/чат-боты’ в РФ. Источники: VK + Telegram + отзывы на картах. Отсортируй по hot_score, дай причину и рекомендованный первый контакт. Без серого парсинга.";

const leonidRunSetup = [
  "Setup:",
  "1. Передай JSON от Марии и/или Артёма.",
  "2. Выбери канал и тон (tone_pack).",
  "3. Укажи цель и ограничения по длине."
].join("\n");

const leonidRunExample =
  "Леонид, сделай DM для Telegram по разбору Марии (JSON ниже). Нужно: 1-е сообщение + 3 follow-up (нейтрально/делово/жёстко-коротко). Цель: получить ответ и предложить мини-аудит в 5 пунктов. Лимит: 280 символов первое, 240 follow-up. Без воды.";

const emelyanRunSetup = [
  "Setup:",
  "1. Передай JSON от Марии и/или Артёма.",
  "2. Выбери тон (tone_pack) и цель.",
  "3. Укажи ограничения по длине письма и числу буллетов."
].join("\n");

const emelyanRunExample =
  "Емельян, сделай 3 email-цепочки (короткая/средняя/жёстко-деловая) на основе JSON разбора Марии ниже. Нужно: темы писем, текст, 2–3 наблюдения, 1 CTA. Лимит письма 900 символов, буллетов максимум 3. Без воды.";

const borisRunSetup = [
  "Setup:",
  "1. Передай JSON лидов и тексты (Максим/Фёдор/Артём + Леонид/Емельян).",
  "2. Выбери primary_channel и goal.",
  "3. Укажи followup_days и max_items при необходимости."
].join("\n");

const borisRunExample =
  "Борис, склей лиды Максима + тексты Леонида (DM) + hot-лиды Артёма в одну таблицу READY на отправку. Канал: mixed. Поставь follow-up на D+2/D+5/D+9. Дай CSV и JSON.";

const pavelRunSetup = [
  "Setup:",
  "1. Вставь транскрипт ролика (до 30 сек) или тезисы по секундам.",
  "2. Укажи нишу, цель (leads/views/followers) и платформу.",
  "3. Можно добавить подпись, on-screen текст и примеры комментариев."
].join("\n");

const pavelRunExample =
  "Павел, вот транскрипт ролика (до 30 сек). Разбери почему он зайдет/не зайдет в RU, дай скелет по таймингам 0–3/3–15/15–30/CTA и 2 варианта переписывания. Цель: лиды.";

const trofimRunSetup = [
  "Setup:",
  "1. Укажи нишу и цель (leads/views/followers).",
  "2. Добавь 1–3 референса: темы/транскрипты/форматы, которые нравятся.",
  "3. Выбери платформы (Instagram Reels/TikTok/Shorts/RUTUBE/VK)."
].join("\n");

const trofimRunExample =
  "Трофим, ниша: автоматизация бизнеса/AgentOS. Цель: лиды. Дай 20 форматов под Instagram Reels + TikTok + YouTube Shorts + RUTUBE + VK, со структурами 0–3/3–15/15–30/CTA, банком хуков и CTA.";

const irinaRunSetup = [
  "Setup:",
  "1. Укажи нишу и цель (leads/views/followers).",
  "2. Выбери платформы (TG/VK/Shorts/Reels/TikTok/RUTUBE).",
  "3. Можно добавить офферы/доказательства/кейсы."
].join("\n");

const irinaRunExample =
  "Ирина, ниша: AgentOS (автоматизация бизнеса ИИ-агентами). Цель: лиды. Дай 8 рубрик и 50 тем под TG+VK+Shorts/Reels, с хуками, CTA и кратким планом.";

const haritonRunSetup = [
  "Setup:",
  "1. Укажи нишу и цель (leads/views/followers).",
  "2. Укажи оффер в 1 строку и предпочтительный CTA.",
  "3. Выбери платформы (TG/VK/Shorts/Reels/TikTok/RUTUBE)."
].join("\n");

const haritonRunExample =
  "Харитон, ниша: AgentOS (ИИ-агенты для бизнеса). Цель: лиды. Дай 50 хуков + 10 постов для TG/VK + 10 скриптов Shorts/Reels. Стиль прямой, без воды, CTA в личку.";

const kostyaRunSetup = [
  "Setup:",
  "1. Укажи нишу и цель (leads/views/brand).",
  "2. Дай заголовок/оффер для визуала.",
  "3. Выбери платформы и типы ассетов."
].join("\n");

const kostyaRunExample =
  "Костя, ниша: AgentOS (ИИ-агенты для бизнеса). Заголовок: «3 точки роста за 7 дней». Сделай 5 концептов для TG обложки + карусели + thumbnail, с промптами и ТЗ дизайнеру. Лиды, стиль tech.";

const sevaRunSetup = [
  "Setup:",
  "1. Вставь текст кейса/идеи.",
  "2. Укажи нишу и цель (leads/views/followers).",
  "3. Выбери предпочтительный CTA (dm/comment/landing)."
].join("\n");

const sevaRunExample =
  "Сева, вот кейс (текст ниже). Преврати в пакет 1→10: TG короткий/длинный, VK пост, сценарий Shorts, карусель, FAQ, email. CTA в личку.";

const mityaRunSetup = [
  "Setup:",
  "1. Укажи тип схемы (leadgen_flow/agentos_how_it_works/customer_journey/funnel).",
  "2. Дай продукт/нишу и контекст (one-liner, сегменты, каналы).",
  "3. Выбери формат (mermaid/graph_json/both) и лимиты."
].join("\n");

const mityaRunExample =
  "Анастасия, сделай схему «как работает AgentOS» для лендинга: от запроса клиента → выбор агентов → выполнение → результат. Нужны blocks+edges+mermaid и текст объяснения.";

const timofeyRunSetup = [
  "Setup:",
  "1. Укажи фокус сегментов и нишу (если есть).",
  "2. Можно исключить домены и задать recency_days.",
  "3. Выбери режим quick/deep."
].join("\n");

const timofeyRunExample =
  "Тимофей, найди конкурентов в РФ по: AI-агентства, чат-боты, WB/Ozon маркетинг, колл-центры, CRM-внедрение. Сделай таблицу сравнения, 2–3 угла как выиграть AgentOS, готовые формулировки позиционирования и 3 оффера: селлеры / локал / B2B. Без выдумок — только с доказательствами.";

const anatolyRunSetup = [
  "Setup:",
  "1. Укажи компанию (сайт/WB/Ozon) и город.",
  "2. Можно указать channel_focus и recency_days.",
  "3. Если данных мало — агент спросит уточнение."
].join("\n");

const anatolyRunExample =
  "Разбери бренд (ссылка) и дай 3–5 зацепок + 3 гипотезы боли + что предложить через AgentOS. Фокус: отзывы/логистика/контент/заявки.";

const genericPrompt: AgentPrompt = {
  role: "Определяет задачу агента и контекст работы.",
  sop: "Опиши шаги выполнения задачи и критерии качества.",
  output: "Опиши формат выдачи и ключевые поля результата."
};

const genericRunSetup = [
  "Setup:",
  "1. Укажи контекст задачи.",
  "2. Добавь ограничения и формат результата."
].join("\n");

const genericRunExample = "Составь план работы на неделю для отдела продаж.";

const buildBaseConfig = (prompt: AgentPrompt): AgentConfig => ({
  model: DEFAULT_MODEL,
  prompt,
  tools: [],
  triggers: ["manual"],
  knowledgeFiles: [],
  variables: [],
  runSetupMarkdown: genericRunSetup,
  runExamplePrompt: genericRunExample,
  publishedStatus: "Saved"
});

export const buildDefaultAgentConfig = (agentName = "Agent"): AgentConfig => {
  const name = agentName.toLowerCase();
  if (name.includes("платон")) {
    return {
      model: DEFAULT_MODEL,
      prompt: platonPrompt,
      tools: platonTools,
      triggers: ["manual"],
      knowledgeFiles: [],
      variables: platonVariables,
      runSetupMarkdown: defaultRunSetup,
      runExamplePrompt: defaultRunExample,
      publishedStatus: "Saved"
    };
  }

  if (name.includes("мария") || name.includes("анатол")) {
    return {
      model: ANATOLY_MODEL,
      prompt: anatolyPrompt,
      tools: anatolyTools,
      triggers: ["manual"],
      knowledgeFiles: [],
      variables: anatolyVariables,
      runSetupMarkdown: anatolyRunSetup,
      runExamplePrompt: anatolyRunExample,
      publishedStatus: "Saved"
    };
  }

  if (name.includes("тимофей")) {
    return {
      model: TIMOFEY_MODEL,
      prompt: timofeyPrompt,
      tools: timofeyTools,
      triggers: ["manual"],
      knowledgeFiles: [],
      variables: timofeyVariables,
      runSetupMarkdown: timofeyRunSetup,
      runExamplePrompt: timofeyRunExample,
      publishedStatus: "Saved"
    };
  }

  if (name.includes("максим")) {
    return {
      model: MAXIM_MODEL,
      prompt: maximPrompt,
      tools: maximTools,
      triggers: ["manual"],
      knowledgeFiles: [],
      variables: maximVariables,
      runSetupMarkdown: maximRunSetup,
      runExamplePrompt: maximRunExample,
      publishedStatus: "Saved"
    };
  }

  if (name.includes("фёдор") || name.includes("федор")) {
    return {
      model: FEDOR_MODEL,
      prompt: fedorPrompt,
      tools: fedorTools,
      triggers: ["manual"],
      knowledgeFiles: [],
      variables: fedorVariables,
      runSetupMarkdown: fedorRunSetup,
      runExamplePrompt: fedorRunExample,
      publishedStatus: "Saved"
    };
  }

  if (name.includes("артём") || name.includes("артем")) {
    return {
      model: ARTEM_MODEL,
      prompt: artemPrompt,
      tools: artemTools,
      triggers: ["manual"],
      knowledgeFiles: [],
      variables: artemVariables,
      runSetupMarkdown: artemRunSetup,
      runExamplePrompt: artemRunExample,
      publishedStatus: "Saved"
    };
  }

  if (name.includes("леонид")) {
    return {
      model: LEONID_MODEL,
      prompt: leonidPrompt,
      tools: leonidTools,
      triggers: ["manual"],
      knowledgeFiles: [],
      variables: leonidVariables,
      runSetupMarkdown: leonidRunSetup,
      runExamplePrompt: leonidRunExample,
      publishedStatus: "Saved"
    };
  }

  if (name.includes("емельян")) {
    return {
      model: EMELYAN_MODEL,
      prompt: emelyanPrompt,
      tools: emelyanTools,
      triggers: ["manual"],
      knowledgeFiles: [],
      variables: emelyanVariables,
      runSetupMarkdown: emelyanRunSetup,
      runExamplePrompt: emelyanRunExample,
      publishedStatus: "Saved"
    };
  }

  if (name.includes("борис")) {
    return {
      model: BORIS_MODEL,
      prompt: borisPrompt,
      tools: borisTools,
      triggers: ["manual"],
      knowledgeFiles: [],
      variables: borisVariables,
      runSetupMarkdown: borisRunSetup,
      runExamplePrompt: borisRunExample,
      publishedStatus: "Saved"
    };
  }

  if (name.includes("павел")) {
    return {
      model: PAVEL_MODEL,
      prompt: pavelPrompt,
      tools: [],
      triggers: ["manual"],
      knowledgeFiles: [],
      variables: pavelVariables,
      runSetupMarkdown: pavelRunSetup,
      runExamplePrompt: pavelRunExample,
      publishedStatus: "Saved"
    };
  }

  if (name.includes("трофим")) {
    return {
      model: TROFIM_MODEL,
      prompt: trofimPrompt,
      tools: [],
      triggers: ["manual"],
      knowledgeFiles: [],
      variables: trofimVariables,
      runSetupMarkdown: trofimRunSetup,
      runExamplePrompt: trofimRunExample,
      publishedStatus: "Saved"
    };
  }

  if (name.includes("ирина")) {
    return {
      model: IRINA_MODEL,
      prompt: irinaPrompt,
      tools: [],
      triggers: ["manual"],
      knowledgeFiles: [],
      variables: irinaVariables,
      runSetupMarkdown: irinaRunSetup,
      runExamplePrompt: irinaRunExample,
      publishedStatus: "Saved"
    };
  }

  if (name.includes("харитон")) {
    return {
      model: HARITON_MODEL,
      prompt: haritonPrompt,
      tools: [],
      triggers: ["manual"],
      knowledgeFiles: [],
      variables: haritonVariables,
      runSetupMarkdown: haritonRunSetup,
      runExamplePrompt: haritonRunExample,
      publishedStatus: "Saved"
    };
  }

  if (name.includes("костя")) {
    return {
      model: KOSTYA_MODEL,
      prompt: kostyaPrompt,
      tools: [],
      triggers: ["manual"],
      knowledgeFiles: [],
      variables: kostyaVariables,
      runSetupMarkdown: kostyaRunSetup,
      runExamplePrompt: kostyaRunExample,
      publishedStatus: "Saved"
    };
  }

  if (name.includes("сева")) {
    return {
      model: SEVA_MODEL,
      prompt: sevaPrompt,
      tools: [],
      triggers: ["manual"],
      knowledgeFiles: [],
      variables: sevaVariables,
      runSetupMarkdown: sevaRunSetup,
      runExamplePrompt: sevaRunExample,
      publishedStatus: "Saved"
    };
  }

  if (name.includes("анастас") || name.includes("митя")) {
    return {
      model: MITYA_MODEL,
      prompt: mityaPrompt,
      tools: [],
      triggers: ["manual"],
      knowledgeFiles: [],
      variables: mityaVariables,
      runSetupMarkdown: mityaRunSetup,
      runExamplePrompt: mityaRunExample,
      publishedStatus: "Saved"
    };
  }

  return buildBaseConfig(genericPrompt);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toStringSafe = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback;

const toStringArray = (value: unknown, fallback: string[]) =>
  Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : fallback;

const toToolArray = (value: unknown, fallback: AgentTool[]) => {
  if (!Array.isArray(value)) return fallback;
  const tools = value
    .filter((item) => isObject(item))
    .map((item) => ({
      id: toStringSafe(item.id, "tool"),
      name: toStringSafe(item.name, "Tool"),
      uses: toStringSafe(item.uses, "")
    }));
  return tools.length > 0 ? tools : fallback;
};

export const parseAgentConfig = (
  raw: string | null | undefined,
  agentName = "Agent"
): AgentConfig => {
  const base = buildDefaultAgentConfig(agentName);
  if (!raw) return base;

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return base;
    }
  }

  if (!isObject(parsed)) return base;

  const prompt = isObject(parsed.prompt) ? parsed.prompt : {};

  const rawModel = toStringSafe(parsed.model, base.model);
  const merged: AgentConfig = {
    model:
      rawModel === "gpt-4o-mini" && base.model !== "gpt-4o-mini"
        ? base.model
        : rawModel,
    prompt: {
      role: toStringSafe(prompt.role, base.prompt.role),
      sop: toStringSafe(prompt.sop, base.prompt.sop),
      output: toStringSafe(prompt.output, base.prompt.output)
    },
    tools: toToolArray(parsed.tools, base.tools),
    triggers: toStringArray(parsed.triggers, base.triggers),
    knowledgeFiles: toStringArray(parsed.knowledgeFiles, base.knowledgeFiles),
    variables: toStringArray(parsed.variables, base.variables),
    runSetupMarkdown: toStringSafe(
      parsed.runSetupMarkdown,
      base.runSetupMarkdown
    ),
    runExamplePrompt: toStringSafe(
      parsed.runExamplePrompt,
      base.runExamplePrompt
    ),
    publishedStatus:
      parsed.publishedStatus === "Published"
        ? "Published"
        : parsed.publishedStatus === "Publishing"
          ? "Publishing"
          : "Saved"
  };

  if (parsed.last_run && typeof parsed.last_run === "object") {
    merged.last_run = parsed.last_run as AgentConfig["last_run"];
  }

  if (agentName.toLowerCase().includes("платон")) {
    const sop = merged.prompt.sop || "";
    const output = merged.prompt.output || "";
    if (!sop.includes("Confidence") && !sop.includes("confidence")) {
      merged.prompt.sop = base.prompt.sop;
    }
    if (!output.includes("placeholders")) {
      merged.prompt.output = base.prompt.output;
    }
  }

  return merged;
};

export const buildSystemPrompt = (
  config: AgentConfig,
  agentName = "Agent"
) => {
  return [
    `Agent: ${agentName}`,
    "",
    "Role:",
    config.prompt.role,
    "",
    "SOP:",
    config.prompt.sop,
    "",
    "Output:",
    config.prompt.output
  ].join("\n");
};

export const serializeAgentConfig = (config: AgentConfig) =>
  JSON.stringify(config);
