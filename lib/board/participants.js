const ROLE_ORDER = [
  {
    role: "ceo",
    title: "Антон — CEO (Growth)",
    description: "рынок, оффер, рост, GTM",
    initial: "А"
  },
  {
    role: "cto",
    title: "Юрий — CTO (Tech)",
    description: "реализация, архитектура, риски",
    initial: "Ю"
  },
  {
    role: "cfo",
    title: "София — CFO (Risk)",
    description: "юнит-экономика, деньги, ограничения",
    initial: "С"
  },
  {
    role: "chair",
    title: "Илья — Chairman (Итог)",
    description: "итог, решение, план на 7 дней",
    initial: "И"
  }
];

const toText = (value) => (typeof value === "string" ? value.trim() : "");

const isRoleErrorMessage = (value) => /^ошибка[:\s-]/i.test(toText(value));

const shortError = (value) => {
  const line = toText(value).split("\n").map((item) => item.trim()).find(Boolean) || "";
  return line.slice(0, 140);
};

const pickLastByRole = (messages, role) => {
  if (!Array.isArray(messages)) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === role) return message;
  }
  return null;
};

const buildParticipantCards = (messages, options = {}) => {
  const sending = Boolean(options.sending);
  const runError = toText(options.runError);

  return ROLE_ORDER.map((meta) => {
    const lastMessage = pickLastByRole(messages, meta.role);
    const hasMessage = Boolean(lastMessage);
    const messageError = hasMessage && isRoleErrorMessage(lastMessage?.content);

    let status = "Нет данных";
    let error = "";

    if (sending) {
      status = "В процессе";
    } else if (messageError) {
      status = "Ошибка";
      error = shortError(lastMessage?.content);
    } else if (hasMessage) {
      status = "Готово";
    } else if (runError) {
      status = "Ошибка";
      error = shortError(runError);
    }

    return {
      ...meta,
      status,
      error,
      updated_at: hasMessage ? toText(lastMessage?.created_at) : "",
      last_message_id: hasMessage ? toText(lastMessage?.id) : ""
    };
  });
};

module.exports = {
  ROLE_ORDER,
  buildParticipantCards
};
