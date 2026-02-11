import { AGENT_CATALOG } from "./catalog";

const hasAny = (text: string, keywords: string[]) => {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
};

export const selectAgentsAuto = (inputText: string) => {
  const lower = (inputText || "").toLowerCase();
  const picks: string[] = [];

  const pushUnique = (id: string) => {
    if (!picks.includes(id)) picks.push(id);
  };

  if (hasAny(lower, ["лиды", "компани", "контакт", "карты", "категори", "город", "osm", "стоматолог"])) {
    pushUnique("platon");
  }

  if (hasAny(lower, ["карты", "osm", "места", "стоматолог", "салон", "кафе", "рест" ])) {
    pushUnique("maxim");
  }

  if (hasAny(lower, ["сообщ", "dm", "аутрич", "мессендж", "telegram", "vk"])) {
    pushUnique("leonid-outreach-dm-ru");
  }

  if (hasAny(lower, ["email", "почта", "письм", "рассылк"])) {
    pushUnique("emelyan-cold-email-ru");
  }

  if (hasAny(lower, ["конкурент", "позиционир", "рынок"])) {
    pushUnique("timofey-competitor-analysis-ru");
  }

  if (hasAny(lower, ["горяч", "тендер", "сигнал", "срочно"])) {
    pushUnique("artem-hot-leads-ru");
  }

  if (hasAny(lower, ["контент", "хуки", "пост", "скрипт", "reels", "shorts", "видео"])) {
    pushUnique("hariton-viral-hooks-ru");
  }

  if (hasAny(lower, ["репак", "перепаковк", "1→10", "1-10", "кейсы"])) {
    pushUnique("seva-content-repurposing-ru");
  }

  if (hasAny(lower, ["рубрикатор", "темы", "идеи"])) {
    pushUnique("irina-content-ideation-ru");
  }

  if (hasAny(lower, ["аналог", "формат", "tiktok", "shorts", "rutube"])) {
    pushUnique("trofim-shorts-analogs-ru");
  }

  if (hasAny(lower, ["диаграм", "схем", "воронк", "процесс", "архитектур", "путь клиента"])) {
    pushUnique("mitya-workflow-diagram-ru");
  }

  if (hasAny(lower, ["визуал", "картинк", "дизайн", "промпт"])) {
    pushUnique("kostya-image-generation-ru");
  }

  if (picks.length === 0) {
    if (hasAny(lower, ["схем", "процесс", "воронк"])) {
      pushUnique("mitya-workflow-diagram-ru");
    } else {
      pushUnique("platon");
    }
  }

  return picks.slice(0, 3);
};

export const listAgentsForSelect = () => AGENT_CATALOG;
