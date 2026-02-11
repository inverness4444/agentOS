import type { Metadata } from "next";
import Link from "next/link";
import Container from "@/components/Container";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Демо AgentOS — запрос презентации",
  description:
    "Запросите демо AgentOS: покажем сценарии внедрения AI-агентов для продаж, маркетинга и управленческих задач.",
  path: "/demo",
  keywords: ["демо agentos", "внедрение ии агентов", "презентация agentos"]
});

export default function DemoPage() {
  return (
    <main className="min-h-screen py-16">
      <Container>
        <Link href="/" className="text-sm text-[#2B2C4B] hover:text-[#2B2C4B]">
          ← Вернуться на главную
        </Link>
        <div className="mt-8 max-w-xl">
          <h1 className="text-3xl font-semibold">Запросить демо AgentOS</h1>
          <p className="mt-3 text-sm text-[#2B2C4B]">
            Оставьте контакты — покажем департаменты и подберём запуск под ваш рынок.
          </p>
          <Card className="mt-8 rounded-2xl">
            <CardContent className="p-6">
              <form className="space-y-4">
                <div>
                  <label className="text-sm text-[#2B2C4B]">Имя</label>
                  <input
                    type="text"
                    placeholder="Ваше имя"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#2B2C4B] placeholder:text-[#2B2C4B]"
                  />
                </div>
                <div>
                  <label className="text-sm text-[#2B2C4B]">Компания</label>
                  <input
                    type="text"
                    placeholder="Название компании"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#2B2C4B] placeholder:text-[#2B2C4B]"
                  />
                </div>
                <div>
                  <label className="text-sm text-[#2B2C4B]">Email</label>
                  <input
                    type="email"
                    placeholder="name@company.ru"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#2B2C4B] placeholder:text-[#2B2C4B]"
                  />
                </div>
                <div>
                  <label className="text-sm text-[#2B2C4B]">Комментарий</label>
                  <textarea
                    placeholder="Какая задача стоит перед вами?"
                    rows={4}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#2B2C4B] placeholder:text-[#2B2C4B]"
                  />
                </div>
                <Button type="submit" className="w-full" size="lg">
                  Отправить заявку
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </Container>
    </main>
  );
}
