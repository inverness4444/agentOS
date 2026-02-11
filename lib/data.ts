export type Agent = {
  id: string;
  name: string;
  role: string;
  description: string;
  delivers: string;
  photo?: string | null;
};

export type Department = {
  id: string;
  navLabel: string;
  title: string;
  subtitle: string;
  featured: Agent[];
  included: Agent[];
};

export const pricing = {
  monthlyPrice: 5000,
  currency: "₽",
  badge: "Подписка",
  planName: "МЕСЯЧНАЯ ПОДПИСКА"
};

export const trustBadges = [
  "Для СНГ",
  "Без кода",
  "Запуск за 10 минут",
  "Все агенты в одном доступе"
];

const malePhotos = [
  "/photo/FEXefhevbn8VTt1m6vGAUuiI1g.avif",
  "/photo/NC03XXJdzM8luHntK5f60kwuxz0.avif",
  "/photo/SpqcJxDNpGHlGdB3cyfYCDSmxw.avif",
  "/photo/VDJOY92ZK81zHlHBSuLAW3yeoE.avif",
  "/photo/cM18yG1D65ltLrpj8rQOdLVzg.avif",
  "/photo/jXydvuTthAcDkmDxdHNzRy2PTd0-alt.avif",
  "/photo/nWzS724xfxhIchSiFMRAFJTh3mg.avif",
  "/photo/nft.avif",
  "/photo/povJ8PPvZkuiUnG2Pvao3gDNMvA.avif",
  "/photo/s6uP2WHc98waFPPSqhGqPvxQLhE.avif",
  "/photo/spyFMGSBExjfd4fOzn0ckfPti5Q.avif",
  "/photo/zttGyIFzZ4b7fZQxzaWCIZYtnlg.avif",
  "/photo/qb3Ndj.jpeg"
];

const femalePhotos = [
  "/photo/9HrA6QdFXgeVEavxDU8Cvtjrxo.avif",
  "/photo/bFwWQNeCZmZTsKGv1cwj6bs6as.avif",
  "/photo/I01B0OXSOrfy3k0CvTkOp8fCl0.avif",
  "/photo/jXydvuTthAcDkmDxdHNzRy2PTd0.avif"
];

const femaleAgentIds = new Set(["irina"]);

const assignPhotosToAgents = (departments: Department[]): Department[] => {
  const maleQueue = [...malePhotos];
  const femaleQueue = [...femalePhotos];

  const assign = (agent: Agent): Agent => {
    if (typeof agent.photo === "string" && agent.photo.length > 0) {
      return agent;
    }
    const queue = femaleAgentIds.has(agent.id) ? femaleQueue : maleQueue;
    const photo = queue.shift() ?? null;
    return { ...agent, photo };
  };

  return departments.map((department) => ({
    ...department,
    featured: department.featured.map(assign),
    included: department.included.map(assign)
  }));
};

const departmentsBase: Department[] = [
  {
    id: "sales",
    navLabel: "SALES",
    title: "Отдел продаж",
    subtitle:
      "Исследуйте клиентов, находите лидов, пишите письма и DMs — без найма SDR.",
    featured: [
      {
        id: "platon",
        name: "Платон — находит подходящие компании для продаж.",
        role: "Ресёрчер по РФ/СНГ: ICP и сегменты",
        description:
          "Определяет ICP-сегменты и формирует список компаний-кандидатов для продаж на основе безопасных публичных сигналов.",
        delivers: "Сегменты + компании-кандидаты (JSON, без PII)"
      },
      {
        id: "maxim",
        name: "Максим",
        role: "Локальные лиды",
        description:
          "Собирает локальные лиды через Яндекс/2ГИС и безопасный импорт списков. Выдаёт таблицу компаний (сайт/телефон/город/категория/ссылка/заметки).",
        delivers: "Таблица компаний с сайт/телефон/город/категория/ссылка/заметки"
      },
      {
        id: "leonid",
        name: "Леонид",
        role: "Аутрич в мессенджерах",
        description:
          "Пишет короткие цепочки DM для Telegram/VK/WhatsApp: конкретная персонализация, один понятный CTA, 2–3 follow-up без «ИИ-ваты».",
        delivers: "DM-цепочки + 2–3 follow-up"
      },
      {
        id: "emelyan",
        name: "Емельян",
        role: "Холодные письма",
        description:
          "Делает короткие email-цепочки под РФ: темы, структура, CTA, 2–3 follow-up в разных стилях (короткая/средняя/жёстко-деловая).",
        delivers: "Email-цепочки: темы + 2–3 follow-up"
      }
    ],
    included: [
      {
        id: "anatoly",
        name: "Мария",
        role: "Разбор компании",
        description:
          "Разбирает компанию перед контактом: маркетплейсы (WB/Ozon), сайт, отзывы (Яндекс/2ГИС), соцсети (VK/Telegram). Находит боли и 3–5 зацепок для персонализации.",
        delivers: "Боли + 3–5 зацепок для персонализации"
      },
      {
        id: "timofey",
        name: "Тимофей",
        role: "Анализ конкурентов",
        description:
          "Сравнивает конкурентов, их офферы/кейсы/цены и предлагает выигрышные углы подачи под рынок РФ.",
        delivers: "Сравнение конкурентов + выигрышные углы",
        photo: "/photo/a69026b1-ba38-436a-8f7e-c5fa7588e0db.png"
      },
      {
        id: "fedor",
        name: "Фёдор",
        role: "B2B-лиды",
        description:
          "Собирает B2B-лиды из открытых каталогов/реестров/сайтов, чистит и нормализует данные, убирает дубли.",
        delivers: "Нормализованный список B2B-лидов"
      },
      {
        id: "artem",
        name: "Артём",
        role: "Горячие лиды",
        description:
          "Ищет горячие сигналы в комментариях/чатах (Telegram/VK), входящих заявках и публичных обсуждениях. Даёт hot-лиды, причины и рекомендованное первое сообщение.",
        delivers: "Hot-лиды + причины + 1-е сообщение"
      },
      {
        id: "boris",
        name: "Борис",
        role: "Склейка лидов",
        description:
          "Склеивает лиды → персонализацию → готовые сообщения/письма в финальную таблицу «READY TO SEND» со статусами и следующим шагом.",
        delivers: "READY TO SEND таблица + статусы"
      }
    ]
  },
  {
    id: "content",
    navLabel: "CONTENT",
    title: "Отдел контента",
    subtitle:
      "Идеи, хуки, сценарии, упаковка и репакинг — контент, который можно выпускать каждый день.",
    featured: [
      {
        id: "irina",
        name: "Ирина",
        role: "Генерация идей и рубрик",
        description:
          "Формирует рубрики и темы под продукт, аудиторию и формат контента.",
        delivers: "Контент-план на 2 недели",
        photo: "/photo/qb3Ndj.jpeg"
      },
      {
        id: "khariton",
        name: "Харитон",
        role: "Хуки + тексты (посты/скрипты)",
        description:
          "Пишет посты и сценарии, усиливает хуки и структуру под охваты.",
        delivers: "Посты и сценарии"
      },
      {
        id: "seva",
        name: "Сева",
        role: "Репакинг 1→10 форматов",
        description:
          "Разбивает один материал на серию форматов для разных каналов.",
        delivers: "Пакет форматов из одного материала",
        photo: "/photo/65d8d8cb-e88b-457f-b1eb-d14d13e2888c.png"
      },
      {
        id: "kostya",
        name: "Костя",
        role: "Визуалы: промпты и ТЗ",
        description:
          "Создаёт промпты и брифы для визуалов, чтобы контент выглядел единообразно.",
        delivers: "Промпты/брифы на визуалы"
      }
    ],
    included: [
      {
        id: "pavel",
        name: "Павел",
        role: "Разбор Reels/Shorts",
        description:
          "Анализирует структуру, динамику и лучшие хуки роликов.",
        delivers: "Шаблоны роликов + хуки",
        photo: "/photo/9HrA6QdFXgeVEavxDU8Cvtjrxo.avif"
      },
      {
        id: "trofim",
        name: "Трофим",
        role: "Анализ трендов",
        description:
          "Отбирает тренды и форматы под нишу и аудиторию.",
        delivers: "Список трендов и форматов",
        photo: "/photo/bFwWQNeCZmZTsKGv1cwj6bs6as%20(1).avif"
      },
      {
        id: "mitya",
        name: "Анастасия",
        role: "Схемы и воркфлоу",
        description:
          "Строит схемы процессов и воронок для системного контента.",
        delivers: "Диаграммы процессов/воронок",
        photo: "/photo/I01B0OXSOrfy3k0CvTkOp8fCl0.avif"
      }
    ]
  },
  {
    id: "board",
    navLabel: "BOARD",
    title: "Совет директоров",
    subtitle:
      "3 позиции + итоговое решение. Жёстко и по делу: разбирают идею, спорят по рискам и дают план действий.",
    featured: [
      {
        id: "board-anton",
        name: "Антон",
        role: "CEO",
        description:
          "Смотрит на рынок, оффер и GTM. Ищет слабые места в позиционировании и точки роста.",
        delivers: "Позиция по росту + приоритеты запуска",
        photo: "/photo/8a186648-572d-4d2a-965a-e10ae360280c.png"
      },
      {
        id: "board-yury",
        name: "Юрий",
        role: "CTO",
        description:
          "Оценивает реализацию, техриски и ограничения команды. Выдаёт реалистичный план внедрения.",
        delivers: "Техриски + план реализации",
        photo: "/photo/spyFMGSBExjfd4fOzn0ckfPti5Q.avif"
      },
      {
        id: "board-sofia",
        name: "София",
        role: "CFO",
        description:
          "Проверяет юнит-экономику, бюджет и финансовые риски. Отсекает решения с плохим риск/профит.",
        delivers: "Финансовая оценка + стоп-факторы",
        photo: "/photo/jXydvuTthAcDkmDxdHNzRy2PTd0-alt.avif"
      },
      {
        id: "board-ilya",
        name: "Илья",
        role: "Chairman",
        description:
          "Сводит спор CEO/CTO/CFO в единое решение и фиксирует чёткий план следующей недели.",
        delivers: "Итоговое решение + план на 7 дней",
        photo: "/photo/bbe52a9c-94b7-4ca6-88c7-d8d2ac7e92d5.png"
      }
    ],
    included: []
  }
];

const departmentsWithPhotos = assignPhotosToAgents(departmentsBase);
const departmentPriority: Record<string, number> = {
  board: 0,
  sales: 1,
  content: 2
};

export const departments = [...departmentsWithPhotos].sort(
  (a, b) => (departmentPriority[a.id] ?? 99) - (departmentPriority[b.id] ?? 99)
);

const normalizeAgentName = (name: string) => {
  const base = name.split("—")[0]?.split("-")[0] ?? name;
  return base.trim().toLowerCase();
};

export const getAgentPhotoByName = (name: string) => {
  if (!name) return null;
  const exactMatch = departments
    .flatMap((department) => [...department.featured, ...department.included])
    .find((agent) => agent.name === name);
  if (exactMatch?.photo) return exactMatch.photo;

  const normalized = normalizeAgentName(name);
  const normalizedMatch = departments
    .flatMap((department) => [...department.featured, ...department.included])
    .find((agent) => normalizeAgentName(agent.name) === normalized);
  if (normalizedMatch?.photo) return normalizedMatch.photo;

  const fallbackPool = [...malePhotos, ...femalePhotos];
  if (fallbackPool.length === 0) return null;
  const hash = normalized
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return fallbackPool[hash % fallbackPool.length];
};

export const comparison = {
  hard: [
    "Разрозненные инструменты и чаты",
    "Ручная сборка цепочек и сценариев",
    "Сложно удерживать качество",
    "Постоянные правки и хаос",
    "Много времени на операционку"
  ],
  easy: [
    "Один запуск вместо десятка инструментов",
    "Готовые outputs сразу в работу",
    "Контроль качества на уровне агента",
    "Прозрачные результаты и метки",
    "Время команды уходит на продажи"
  ]
};

export const steps = [
  {
    title: "Заполняете Company Intake",
    description:
      "Вносите контекст о нише, продукте, рынке и критериях лидов."
  },
  {
    title: "Запускаете департамент",
    description:
      "Выбираете Sales или Content и включаете нужных агентов."
  },
  {
    title: "Получаете результаты",
    description:
      "Готовые лиды, сообщения и контент-планы приходят структурированно."
  }
];

export const outputs = {
  leads: [
    { company: "RetailLab", fit: "Высокий", note: "Есть отдел продаж" },
    { company: "EduPulse", fit: "Средний", note: "Запуск курса весной" },
    { company: "LogiCore", fit: "Высокий", note: "Экспансия в СНГ" },
    { company: "FinDesk", fit: "Средний", note: "Открыты к автоматизации" },
    { company: "ClinicPro", fit: "Высокий", note: "Нужен поток заявок" },
    { company: "StudioLine", fit: "Средний", note: "Запуск нового оффера" },
    { company: "AgroSense", fit: "Высокий", note: "B2B продажи" },
    { company: "HRBridge", fit: "Средний", note: "Сегмент SMB" },
    { company: "Eventory", fit: "Высокий", note: "Рост входящих" },
    { company: "CloudRoute", fit: "Высокий", note: "Нужны партнёры" }
  ],
  email:
    "Привет! Вижу, вы активно растёте в СНГ. Мы помогаем быстро собирать лидов и готовим персональные сообщения. Могу показать короткий пример на ваших данных?",
  content: [
    "Неделя 1: 3 ролика с кейсами + 2 поста с инсайтами",
    "Неделя 2: 2 разбора оффера + 3 коротких скрипта",
    "Неделя 3: 4 ответа на возражения + 1 длинный гайд"
  ]
};

export const testimonials = [
  {
    name: "Илья Назаров",
    role: "Основатель агентства",
    quote:
      "За две недели получили +28% ответов на холодный аутрич, а команда стала тратить на подготовку писем в 3 раза меньше времени."
  },
  {
    name: "Ольга Мельник",
    role: "Владелец SaaS-сервиса",
    quote:
      "Вместо хаоса в таблицах получили чёткий список лидов и 12 новых встреч за месяц. Дальше масштабируем отдел продаж."
  },
  {
    name: "Сергей Петров",
    role: "Маркетолог продукта",
    quote:
      "Контент-план на 2 недели и готовые хуки принесли +35% сохранений и заметно ускорили производство роликов."
  }
];

export const faqs = [
  {
    question: "Что такое agentOS?",
    answer:
      "agentOS — это сервис, который помогает компаниям и предпринимателям внедрять и использовать ИИ-агентов для задач продаж, аналитики, поддержки и операционных процессов."
  },
  {
    question: "Кому подходит сервис?",
    answer:
      "• малому и среднему бизнесу\n• отделам продаж и маркетинга\n• HR / операционным командам\n• фаундерам и руководителям"
  },
  {
    question: "Как начать пользоваться?",
    answer:
      "Зайдите на agentOS.ru и зарегистрируйтесь. Аккаунт создаётся бесплатно, а платные функции доступны после оплаты подписки."
  },
  {
    question: "Есть ли бесплатный период?",
    answer:
      "Бесплатного пробного периода для платных функций нет. Аккаунт можно создать бесплатно."
  },
  {
    question: "Сколько стоит подписка?",
    answer:
      "Тариф один: 5000 ₽ в месяц."
  },
  {
    question: "Это автопродление?",
    answer:
      "Если при оплате включено автопродление — списание происходит автоматически каждый месяц до отмены. Если автопродления нет — доступ нужно продлевать вручную."
  },
  {
    question: "Как отменить подписку?",
    answer:
      "Вы можете отменить продление в настройках аккаунта (если доступно) или написав в поддержку: agentOS@mail.ru. Доступ сохранится до конца оплаченного периода."
  },
  {
    question: "Делаете ли вы возвраты?",
    answer:
      "Возвраты возможны, если доступ не был предоставлен по вине agentOS, а также в случаях, предусмотренных законом. Для запроса напишите на agentOS@mail.ru."
  },
  {
    question: "Какие данные вы собираете?",
    answer:
      "Мы собираем данные аккаунта (например, email), технические данные (cookies/логи) и данные, которые вы сами вводите в сервис (например, настройки/контент)."
  },
  {
    question: "Передаёте ли вы данные третьим лицам?",
    answer:
      "Только инфраструктурным провайдерам и ЮKassa — в объёме, нужном для работы сервиса. Мы не продаём персональные данные."
  },
  {
    question: "ИИ может ошибаться?",
    answer:
      "Да. Ответы и рекомендации ИИ могут быть неточными — проверяйте критичные решения."
  },
  {
    question: "Как удалить аккаунт и данные?",
    answer:
      "Через настройки аккаунта (если доступно) или запросом в поддержку: agentOS@mail.ru."
  }
];
