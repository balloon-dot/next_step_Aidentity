# Полный исходный код сайта «Профи»

Архив содержит клиентскую часть, сервер, регистрацию и вход, хранение профилей и оценок, схему и миграции базы данных, тесты, конфигурацию сборки и историю разработки. Включено последнее исправление «Хвоста»: строки не перемещаются под курсором при повторных нажатиях +/−.

## Основные файлы

- `public/app.js` — интерфейс, анкета, диаграмма Вороного, хвост, оценки, приглашения и переключение видов.
- `public/style.css` — оформление и мобильная версия.
- `ui/index.html` — HTML-оболочка приложения.
- `lib/reviews.mjs` — серверное сохранение приглашений и ответов, расчет средних, порог двух участников.
- `lib/auth.mjs` — регистрация, вход, хеширование паролей и сессии.
- `app/` — HTTP-маршруты сайта и API.
- `db/schema.ts`, `drizzle/` — схема и последовательные миграции D1/SQLite.
- `tests/`, `scripts/` — проверки, локальные вспомогательные сценарии.
- `package.json`, `package-lock.json`, `vite.config.ts`, `build/` — зависимости и сборка.
- `.openai/hosting.json` — конфигурация существующего сайта Sites. При создании отдельного нового сайта нужно зарегистрировать новый проект; не публикуйте копию в исходный проект случайно.
- `SOURCE_HISTORY.bundle` — резервная копия всей Git-истории. При необходимости: `git clone SOURCE_HISTORY.bundle profi-with-history`. Браузерный регрессионный сценарий `scripts/tail-browser-check.cjs` использует старый коммит для воспроизведения ошибки, поэтому для него нужна копия с Git-историей и установленный Playwright/Chromium.

## Запуск разработчиком

Нужен Node.js 22.13 или новее.

1. Распаковать архив и открыть папку `profi-source` в терминале.
2. Выполнить `npm ci`.
3. Выполнить `npm run build` — появится конфигурация локального Worker.
4. На новой локальной базе применить миграции по порядку (каждую один раз):

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_illegal_loners.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_illegal_scarecrow.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_overrated_red_shift.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_blushing_thor.sql
```

Миграция `0003` добавляет роль аккаунта и таблицу импортированных профилей для кабинета `/admin`. На рабочей базе ее нужно применить один раз перед публикацией новой версии.

### Администратор кабинета профилей

Новые аккаунты получают роль `user`. Чтобы открыть аккаунту кабинет `/admin`, зарегистрируйтесь на сайте и назначьте роль командой (для рабочей базы — без `--local` и `--persist-to`):

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --command "UPDATE profi_accounts SET role = 'admin' WHERE login = 'ваш-логин'"
```

После повторного входа в меню появится ссылка «Кабинет профилей».

5. Выполнить `npm run dev` и открыть адрес, который появится в терминале.
6. Создать аккаунт через форму регистрации сайта.

`npm test` запускает автоматические проверки. `npm run build` собирает приложение для публикации. Полный HTTP-сценарий локального Worker: `node scripts/http-smoke.mjs` (после сборки и миграций).

## Что сохраняется отдельно

Это архив кода. Рабочая база с аккаунтами, хешами паролей и ответами пользователей в него не включена. Личные анкеты и PDF из браузеров, временные ключи доступа, зависимости `node_modules`, кеши и служебная среда тоже не включены. Схема базы и все миграции находятся в архиве, поэтому разработчик может поднять новую чистую базу.

Основная инструкция и описание поведения — в `README.md`.
