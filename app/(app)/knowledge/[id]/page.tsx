"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHero from "@/components/app/PageHero";
import { ErrorState } from "@/components/app/StateBlocks";

type KnowledgeItem = {
  id: string;
  title: string;
  type: string;
  content: string;
  updatedAt: string;
};

export default function KnowledgeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [item, setItem] = useState<KnowledgeItem | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`/api/knowledge/${id}`);
        if (!response.ok) {
          throw new Error("Не удалось загрузить документ.");
        }
        const data = await response.json();
        setItem(data.item);
        setTitle(data.item.title ?? "");
        setContent(data.item.content ?? "");
      } catch (err) {
        setError("Не удалось загрузить документ.");
      }
    };
    if (id) {
      load();
    }
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/knowledge/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content })
      });
      if (!response.ok) {
        throw new Error("Не удалось сохранить.");
      }
      const data = await response.json();
      setItem(data.item);
    } catch (err) {
      setError("Не удалось сохранить документ.");
    } finally {
      setSaving(false);
    }
  };

  if (!item && error) {
    return <ErrorState message={error} />;
  }

  return (
    <div className="space-y-6">
      <PageHero
        title={item?.title ?? "Документ"}
        subtitle="Просмотрите и отредактируйте содержимое базы знаний."
        tabs={["По умолчанию", "Контент", "Метаданные"]}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/knowledge")}
              className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C]"
            >
              Назад
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-full bg-[#5C5BD6] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(92,91,214,0.35)]"
              disabled={saving}
            >
              Сохранить
            </button>
          </div>
        }
      />

      {error && <ErrorState message={error} />}

      <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-soft">
        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
          Заголовок
        </div>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="mt-3 w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm text-[#1F2238]"
        />
        <div className="mt-6 text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
          Содержание
        </div>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={10}
          className="mt-3 w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-[#1F2238]"
        />
      </div>
    </div>
  );
}
