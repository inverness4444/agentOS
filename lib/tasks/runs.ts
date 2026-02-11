type JsonObject = Record<string, unknown>;

type MetaCarrier = {
  meta?: string | null;
};

export type RunStatus = "queued" | "running" | "success" | "error";

export type StepRunLike = MetaCarrier & {
  status: string;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  durationMs?: number | null;
  errorText?: string | null;
  order?: number;
  attempt?: number | null;
  outputJson?: string | null;
  agentId?: string | null;
};

export type MessageRunLike = MetaCarrier & {
  role: string;
  content: string;
  createdAt: Date;
};

export type TaskRunSummary = {
  runIndex: number;
  status: RunStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
  stepsCount: number;
  errorsCount: number;
};

const parseJsonObject = (value?: string | null): JsonObject => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as JsonObject;
  } catch {
    return {};
  }
};

const isRunIndex = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const summarizeOutput = (output: unknown) => {
  if (!output) return "";
  const payload =
    output && typeof output === "object" && !Array.isArray(output) && "data" in output
      ? (output as Record<string, unknown>).data
      : output;
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return text.length > 600 ? `${text.slice(0, 600)}...` : text;
};

const parseOutputJson = (value?: string | null): unknown => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const parseTags = (value?: string | null) => parseJsonObject(value);

export const getRunIndexFromMeta = (meta?: string | null): number => {
  const parsed = parseJsonObject(meta);
  return isRunIndex(parsed.runIndex) ? parsed.runIndex : 0;
};

export const resolveLatestRunIndex = (
  tagsValue?: string | null,
  steps: MetaCarrier[] = [],
  messages: MetaCarrier[] = []
) => {
  const tags = parseTags(tagsValue);
  let latest = isRunIndex(tags.runIndex) ? tags.runIndex : 0;

  steps.forEach((step) => {
    latest = Math.max(latest, getRunIndexFromMeta(step.meta));
  });
  messages.forEach((message) => {
    latest = Math.max(latest, getRunIndexFromMeta(message.meta));
  });

  return latest;
};

export const filterByRunIndex = <T extends MetaCarrier>(items: T[], runIndex: number) =>
  items.filter((item) => getRunIndexFromMeta(item.meta) === runIndex);

export const computeRunStatus = (steps: StepRunLike[]): RunStatus => {
  if (steps.some((step) => step.status === "error")) return "error";
  if (steps.length > 0 && steps.every((step) => step.status === "success")) return "success";
  if (steps.some((step) => step.status === "running")) return "running";
  if (steps.some((step) => step.status === "success")) return "running";
  return "queued";
};

export const summarizeRun = (
  runIndex: number,
  steps: StepRunLike[],
  messages: MessageRunLike[] = []
): TaskRunSummary => {
  const status = computeRunStatus(steps);
  const errorsCount = steps.filter((step) => step.status === "error").length;

  const stepStartedTimes = steps
    .map((step) => step.startedAt?.getTime() ?? null)
    .filter((time): time is number => typeof time === "number");
  const messageTimes = messages
    .map((message) => message.createdAt?.getTime() ?? null)
    .filter((time): time is number => typeof time === "number");
  const startedAtMs = stepStartedTimes.length
    ? Math.min(...stepStartedTimes)
    : messageTimes.length
      ? Math.min(...messageTimes)
      : null;

  const finishedTimes = steps
    .map((step) => step.finishedAt?.getTime() ?? null)
    .filter((time): time is number => typeof time === "number");
  const finishedAtMs =
    status === "success" || status === "error"
      ? finishedTimes.length
        ? Math.max(...finishedTimes)
        : null
      : null;

  let durationMs: number | null = null;
  if (startedAtMs !== null && finishedAtMs !== null) {
    durationMs = Math.max(0, finishedAtMs - startedAtMs);
  } else if (status === "running" && startedAtMs !== null) {
    durationMs = Math.max(0, Date.now() - startedAtMs);
  } else {
    const collected = steps.reduce((sum, step) => {
      const duration = step.durationMs ?? 0;
      return duration > 0 ? sum + duration : sum;
    }, 0);
    durationMs = collected > 0 ? collected : null;
  }

  if (status === "queued") {
    durationMs = null;
  }

  return {
    runIndex,
    status,
    startedAt: startedAtMs !== null ? new Date(startedAtMs) : null,
    finishedAt: finishedAtMs !== null ? new Date(finishedAtMs) : null,
    durationMs,
    stepsCount: steps.length,
    errorsCount
  };
};

export const buildRunOutputSummary = (
  steps: StepRunLike[],
  messages: MessageRunLike[] = []
) => {
  const fromMessages = messages
    .filter((message) => message.role === "agent")
    .map((message) => message.content.trim())
    .filter(Boolean);
  if (fromMessages.length > 0) {
    return fromMessages.join("\n\n");
  }

  const latestByOrder = new Map<number, StepRunLike>();
  steps
    .filter((step) => step.status === "success")
    .forEach((step) => {
      const order = typeof step.order === "number" ? step.order : 0;
      const attempt = step.attempt ?? 1;
      const existing = latestByOrder.get(order);
      const existingAttempt = existing?.attempt ?? 1;
      if (!existing || existingAttempt <= attempt) {
        latestByOrder.set(order, step);
      }
    });

  const lines = Array.from(latestByOrder.values())
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((step) => {
      const output = parseOutputJson(step.outputJson);
      const text = summarizeOutput(output);
      if (!text) return null;
      const prefix = step.agentId ? `${step.agentId}: ` : "";
      return `${prefix}${text}`;
    })
    .filter((line): line is string => Boolean(line));

  return lines.join("\n\n");
};
