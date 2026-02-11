import { type ReactElement } from "react";
import type { JsonLdNode } from "@/lib/seo/schema";

type JsonLdProps = {
  id: string;
  data: JsonLdNode | JsonLdNode[];
};

const toSafeJson = (value: JsonLdNode | JsonLdNode[]) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

export default function JsonLd({ id, data }: JsonLdProps): ReactElement {
  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: toSafeJson(data) }}
    />
  );
}
