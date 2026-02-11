# agentOS

## Auth setup

### Environment variables

Скопируйте `.env.example` в `.env` и заполните:

```
DATABASE_URL="postgresql://user:password@host:5432/agentos?sslmode=require"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret"
SUPER_ADMIN_EMAILS="admin@example.com"
ADMIN_2FA_ENCRYPTION_KEY="replace-with-32-byte-secret"
ADMIN_2FA_COOKIE_SECRET="replace-with-cookie-secret"
```

Аккаунты создаются с email и паролем, SMTP не нужен.

### SUPER_ADMIN (allowlist)

- Доступ к `/admin` и `/api/admin/*` только для пользователей с ролью `SUPER_ADMIN`.
- Роль назначается автоматически при логине/регистрации, если email есть в `SUPER_ADMIN_EMAILS`.
- Никаких хардкод-паролей или логинов в коде не используется.

Пример:

```
SUPER_ADMIN_EMAILS="vadim.efimov4@mail.ru,second-admin@example.com"
```

### 2FA для SUPER_ADMIN

- Для всех мутаций в `/api/admin/*` включена защита 2FA (TOTP).
- Вкладка `Безопасность` в `/admin`:
1. Нажать `Сгенерировать QR`.
2. Отсканировать код в Authenticator.
3. Ввести 6-значный код и нажать `Включить 2FA`.
4. Для текущей сессии нажать `Подтвердить сессию`.

### Prisma

```
npx prisma generate
npx prisma db push
```

Если нужно перенести аккаунты из локального `dev.db` (SQLite) в текущую БД:

```
npm run db:import-users
```

Опционально можно указать другой путь:

```
LEGACY_SQLITE_PATH=./backup/dev.db npm run db:import-users
```

### Запуск

```
npm run dev
```

## SEO setup

### ENV для SEO/аналитики

```
NEXT_PUBLIC_SITE_URL="https://agentos.ru"
NEXT_PUBLIC_SEO_PRICE_RUB="5000"
NEXT_PUBLIC_GA_ID=""
NEXT_PUBLIC_YANDEX_METRICA_ID=""
NEXT_PUBLIC_REQUIRE_COOKIE_CONSENT="0"
```

### Что уже настроено

- `app/layout.tsx` содержит базовые metadata, OG/Twitter, canonical, favicon/manifest.
- `app/robots.ts` и `app/sitemap.ts` генерируют robots и sitemap для публичных страниц.
- Страницы приватной зоны помечены `noindex`.
- JSON-LD подключён на лендинге, pricing и FAQ.

### Быстрая проверка SEO

```
npm run seo:check
```

Скрипт проверяет:
- наличие `robots`, `sitemap`, `manifest`, OG-ассетов;
- metadata/canonical для публичных страниц;
- `noindex` на приватных страницах;
- наличие schema.org на ключевых страницах.

### Как добавить новую публичную страницу правильно

1. В странице используйте `buildPageMetadata({ title, description, path })`.
2. Добавьте маршрут в `app/sitemap.ts`.
3. Если страница публичная и важная для выдачи — добавьте внутреннюю ссылку (например из `/` или `/faq`).
4. При необходимости добавьте JSON-LD через `components/seo/JsonLd.tsx`.

## Security checklist (кратко)

- Секреты не коммитим, используем `.env`/переменные окружения.
- Роли и доступ к `/admin` — только через `SUPER_ADMIN` allowlist.
- Критичные действия админа логируются в audit.
- Включены базовые security headers и rate limiting в `middleware.ts`.
