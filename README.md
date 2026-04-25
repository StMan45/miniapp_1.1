# Telegram Mini App в Next.js

В проект добавлена базовая интеграция Telegram Mini App:
- загрузка Telegram WebApp SDK на клиенте;
- получение `initData` из Telegram;
- проверка подписи `initData` на сервере;
- возврат данных пользователя в UI.

## Быстрый старт

- Установите зависимости:

```bash
npm install
```

- Создайте `.env.local` по примеру `.env.example`:

```bash
TELEGRAM_BOT_TOKEN=123456:your_real_bot_token
```

- Запустите проект:

```bash
npm run dev
```

- Откройте `http://localhost:3000`.

## Что уже реализовано

- Клиентская страница: `app/page.tsx`
- API для валидации `initData`: `app/api/telegram/auth/route.ts`

## Настройка Telegram BotFather

- Откройте `@BotFather`
- Создайте/выберите бота
- В `Bot Settings -> Menu Button` укажите URL вашего приложения (`https://...`)

Важно: для открытия в Telegram нужен публичный `https` URL.

## Деплой

- Frontend/API route можно развернуть на Vercel.
- После деплоя пропишите `TELEGRAM_BOT_TOKEN` в переменных окружения платформы.
