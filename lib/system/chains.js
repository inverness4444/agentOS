const SYSTEM_CHAINS = [
  {
    chain_id: "b2b_email_ready",
    name: "B2B Email Ready",
    purpose: "Собрать B2B-лиды и подготовить email-рассылку в очередь отправки.",
    notes: "Цепочка для b2b outbound через email.",
    steps: [
      {
        agent_id: "fedor-b2b-leads-ru",
        role: "Сбор и нормализация B2B-лидов",
        input_handoff_type: "content_pack",
        output_handoff_type: "leads_table"
      },
      {
        agent_id: "anatoly-account-research-ru",
        role: "Разбор компании и гипотезы персонализации",
        input_handoff_type: "leads_table",
        output_handoff_type: "account_card"
      },
      {
        agent_id: "emelyan-cold-email-ru",
        role: "Генерация email-пакета",
        input_handoff_type: "account_card",
        output_handoff_type: "messages_pack"
      },
      {
        agent_id: "boris-bdr-operator-ru",
        role: "Склейка в финальную BDR-очередь и CSV",
        input_handoff_type: "messages_pack",
        output_handoff_type: "bdr_queue"
      }
    ]
  },
  {
    chain_id: "local_dm_ready",
    name: "Local DM Ready",
    purpose: "Собрать локальные лиды и подготовить DM-пакет к отправке.",
    notes: "Цепочка для локального outbound через мессенджеры.",
    steps: [
      {
        agent_id: "maxim-local-leads-ru",
        role: "Сбор локальных лидов",
        input_handoff_type: "content_pack",
        output_handoff_type: "leads_table"
      },
      {
        agent_id: "anatoly-account-research-ru",
        role: "Разбор компании и персонализация",
        input_handoff_type: "leads_table",
        output_handoff_type: "account_card"
      },
      {
        agent_id: "leonid-outreach-dm-ru",
        role: "Генерация DM-сообщений",
        input_handoff_type: "account_card",
        output_handoff_type: "messages_pack"
      },
      {
        agent_id: "boris-bdr-operator-ru",
        role: "Склейка в BDR-очередь",
        input_handoff_type: "messages_pack",
        output_handoff_type: "bdr_queue"
      }
    ]
  },
  {
    chain_id: "hot_dm_ready",
    name: "Hot DM Ready",
    purpose: "От горячего сигнала до готовой DM-очереди.",
    notes: "Цепочка для обработки горячих сигналов и быстрых касаний.",
    steps: [
      {
        agent_id: "artem-hot-leads-ru",
        role: "Поиск горячих сигналов",
        input_handoff_type: "content_pack",
        output_handoff_type: "hot_leads"
      },
      {
        agent_id: "anatoly-account-research-ru",
        role: "Разбор контекста компании",
        input_handoff_type: "hot_leads",
        output_handoff_type: "account_card"
      },
      {
        agent_id: "leonid-outreach-dm-ru",
        role: "Подготовка DM-ответа",
        input_handoff_type: "account_card",
        output_handoff_type: "messages_pack"
      },
      {
        agent_id: "boris-bdr-operator-ru",
        role: "Склейка и постановка следующего шага",
        input_handoff_type: "messages_pack",
        output_handoff_type: "bdr_queue"
      }
    ]
  },
  {
    chain_id: "competitor_positioning",
    name: "Competitor Positioning",
    purpose: "Сравнить рынок и подготовить позиционирование/контентные углы.",
    notes: "Основной шаг — Тимофей, затем опциональный контентный пакет.",
    steps: [
      {
        agent_id: "timofey-competitor-analysis-ru",
        role: "Анализ конкурентов и win-angles",
        input_handoff_type: "content_pack",
        output_handoff_type: "content_pack"
      },
      {
        agent_id: "hariton-viral-hooks-ru",
        role: "Упаковка win-angles в тексты/хуки",
        input_handoff_type: "content_pack",
        output_handoff_type: "content_pack",
        optional: true
      },
      {
        agent_id: "irina-content-ideation-ru",
        role: "Контент-рубрики на основе позиционирования",
        input_handoff_type: "content_pack",
        output_handoff_type: "content_pack",
        optional: true
      }
    ]
  },
  {
    chain_id: "content_pack",
    name: "Content Pack",
    purpose: "Собрать контентный пакет 1→N для публикаций и аутрича.",
    notes: "Базовая контентная цепочка от идеи до переупаковки.",
    steps: [
      {
        agent_id: "irina-content-ideation-ru",
        role: "Темы и рубрикатор",
        input_handoff_type: "content_pack",
        output_handoff_type: "content_pack"
      },
      {
        agent_id: "hariton-viral-hooks-ru",
        role: "Хуки и тексты",
        input_handoff_type: "content_pack",
        output_handoff_type: "content_pack"
      },
      {
        agent_id: "kostya-image-generation-ru",
        role: "Промпты и визуальные указания",
        input_handoff_type: "content_pack",
        output_handoff_type: "content_pack"
      },
      {
        agent_id: "seva-content-repurposing-ru",
        role: "Переупаковка в мультиплатформенный пакет",
        input_handoff_type: "content_pack",
        output_handoff_type: "content_pack"
      },
      {
        agent_id: "mitya-workflow-diagram-ru",
        role: "Схемы/лендинговая упаковка процесса",
        input_handoff_type: "content_pack",
        output_handoff_type: "content_pack",
        optional: true
      }
    ]
  },
  {
    chain_id: "board_review",
    name: "Board Review",
    purpose: "Спор 3 ролей и итоговое решение chairman.",
    notes: "Совет директоров: CEO/CTO/CFO -> Chairman.",
    steps: [
      {
        agent_id: "board-ceo-ru",
        role: "CEO позиция роста",
        input_handoff_type: "board_review",
        output_handoff_type: "board_review"
      },
      {
        agent_id: "board-cto-ru",
        role: "CTO оценка реализации",
        input_handoff_type: "board_review",
        output_handoff_type: "board_review"
      },
      {
        agent_id: "board-cfo-ru",
        role: "CFO оценка рисков и экономики",
        input_handoff_type: "board_review",
        output_handoff_type: "board_review"
      },
      {
        agent_id: "board-chair-ru",
        role: "Chairman финальное решение",
        input_handoff_type: "board_review",
        output_handoff_type: "board_review"
      }
    ]
  }
];

module.exports = { SYSTEM_CHAINS };
