export type ExtractResult = {
  fields: Record<string, unknown>;
  proof_items: Array<Record<string, unknown>>;
  warnings: string[];
};
