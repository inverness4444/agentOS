import * as extractorsModule from "./index.js";

const runtime = extractorsModule as Record<string, any>;

export const extractFromHtml = runtime.extractFromHtml as (
  html?: string,
  url?: string
) => {
  fields: Record<string, unknown>;
  proof_items: unknown[];
  warnings: string[];
};
export const genericExtract = runtime.genericExtract as typeof extractFromHtml;
export const domainExtractors = runtime.domainExtractors as Record<string, typeof extractFromHtml>;
