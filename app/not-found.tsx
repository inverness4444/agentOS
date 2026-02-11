import Link from "next/link";
import Container from "@/components/Container";

export default function NotFound() {
  return (
    <main className="min-h-screen py-24">
      <Container>
        <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200/70 bg-white px-8 py-10 shadow-soft">
          <p className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
            404
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-[#1F2238]">
            Страница не найдена
          </h1>
          <p className="mt-3 text-sm text-[#5A6072]">
            Проверьте адрес или вернитесь на главную страницу AgentOS.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex items-center rounded-full bg-[#5C5BD6] px-5 py-2.5 text-sm font-semibold text-white"
            >
              На главную
            </Link>
            <Link
              href="/faq"
              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-[#1F2238]"
            >
              FAQ
            </Link>
          </div>
        </div>
      </Container>
    </main>
  );
}
