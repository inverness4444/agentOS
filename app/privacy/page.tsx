import type { Metadata } from "next";
import Link from "next/link";
import Container from "@/components/Container";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Политика конфиденциальности AgentOS",
  description:
    "Политика конфиденциальности AgentOS: какие данные обрабатываются, цели, сроки хранения, безопасность и права пользователя.",
  path: "/privacy",
  keywords: ["политика конфиденциальности agentos", "персональные данные ai сервис", "privacy policy agentos"]
});

export default function PolicyPage() {
  return (
    <main className="min-h-screen py-16">
      <Container>
        <Link href="/" className="text-sm text-[#2B2C4B] hover:text-[#2B2C4B]">
          ← Вернуться на главную
        </Link>
        <div className="mt-8 max-w-3xl space-y-6 text-sm text-[#2B2C4B]">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-[#2B2C4B]">
              Политика конфиденциальности — agentOS
            </h1>
            <p>Дата вступления в силу: 02 февраля 2026</p>
            <p>Сайт: agentOS.ru</p>
            <p>Контакты по приватности: agentOS@mail.ru</p>
            <p>Платежный провайдер: ЮKassa</p>
          </div>

          <p>
            Оператор персональных данных: на момент публикации этих условий
            сервис находится в стадии запуска. Реквизиты оператора (ИП/ООО),
            юридический адрес и данные ответственного лица будут опубликованы на
            agentOS.ru. По запросу на agentOS@mail.ru мы предоставим актуальные
            реквизиты и информацию об обработке данных.
          </p>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">1) Какие данные мы собираем</h2>
            <p>1.1. Данные аккаунта: email, имя/ник (если указано), пароль (хранится в виде хеша).</p>
            <p>1.2. Данные профиля и настроек: настройки аккаунта, параметры сервиса.</p>
            <p>1.3. Пользовательский контент: данные, которые Пользователь вводит или загружает в Сервис (тексты, файлы, сообщения, ответы).</p>
            <p>1.4. Технические данные: IP-адрес, cookies, тип устройства/браузера, логи, события использования.</p>
            <p>
              1.5. Платежные данные: agentOS не хранит полные данные банковских
              карт. Платежи обрабатывает ЮKassa. agentOS может хранить: статус
              оплаты, сумму (5000 ₽/мес), дату/время, идентификаторы платежа и
              данные тарифа.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">2) Цели обработки</h2>
            <p>Мы обрабатываем данные для:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>регистрации и предоставления доступа к agentOS;</li>
              <li>работы функций сервиса и обработки пользовательского контента;</li>
              <li>поддержки и коммуникации;</li>
              <li>обеспечения безопасности и предотвращения злоупотреблений;</li>
              <li>аналитики и улучшения продукта;</li>
              <li>исполнения требований закона.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">3) Основания обработки</h2>
            <p>
              Основания: исполнение договора (оказание услуги подписки),
              согласие (если требуется, например для маркетинговых рассылок),
              законные интересы (безопасность/аналитика) и юридические
              обязанности.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">4) Cookies</h2>
            <p>
              Cookies используются для авторизации, безопасности, стабильной
              работы интерфейса и аналитики. Ограничение cookies в браузере
              может ухудшить работу сервиса.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">5) Передача данных третьим лицам</h2>
            <p>Мы можем передавать данные:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>инфраструктурным поставщикам (хостинг, база данных, хранение файлов, email-уведомления);</li>
              <li>ЮKassa (для обработки оплат);</li>
              <li>государственным органам — по законному требованию.</li>
            </ul>
            <p>Мы не продаем персональные данные.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">6) Сроки хранения</h2>
            <p>Мы храним данные:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>пока аккаунт активен;</li>
              <li>
                после удаления — в объёме и сроках, необходимых по закону
                (например, для бухгалтерского учета и разрешения споров).
              </li>
            </ul>
            <p>Технические логи безопасности могут храниться ограниченный срок.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">7) Удаление данных</h2>
            <p>
              Пользователь может запросить удаление аккаунта и данных через
              настройки (если доступно) или письмом на agentOS@mail.ru. Мы
              удалим данные в разумный срок, если хранение не требуется законом.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">8) Безопасность</h2>
            <p>
              Мы применяем разумные меры защиты: HTTPS, контроль доступа,
              резервные копии, мониторинг. Абсолютная защита данных в интернете
              не гарантируется.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">9) Права пользователя</h2>
            <p>
              Пользователь вправе запросить доступ к данным, исправление,
              удаление, ограничение обработки, а также отозвать согласие (если
              применимо). Запросы: agentOS@mail.ru.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">10) Дети</h2>
            <p>
              Сервис не предназначен для лиц младше 16 лет. Если вы считаете, что
              данные ребенка были переданы — напишите на agentOS@mail.ru.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">11) Изменения политики</h2>
            <p>
              Мы можем обновлять Политику. Новая версия публикуется на
              agentOS.ru и действует с даты публикации.
            </p>
          </section>
        </div>
      </Container>
    </main>
  );
}
