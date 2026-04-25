"use client";

import { useEffect, useMemo, useState } from "react";

type AuthResponse = {
  ok: boolean;
  error?: string;
  user?: Record<string, unknown> | null;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          user?: Record<string, unknown>;
        };
        ready: () => void;
        expand: () => void;
      };
    };
  }
}

export default function Home() {
  const [status, setStatus] = useState("Инициализация Telegram Mini App...");
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [rawInitData, setRawInitData] = useState("");

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    document.head.appendChild(script);

    script.onload = async () => {
      const tg = window.Telegram?.WebApp;
      if (!tg) {
        setStatus("Откройте страницу внутри Telegram.");
        return;
      }

      tg.ready();
      tg.expand();

      const initData = tg.initData ?? "";
      setRawInitData(initData);

      if (!initData) {
        setStatus("Telegram initData не получен.");
        setUser(tg.initDataUnsafe?.user ?? null);
        return;
      }

      try {
        const response = await fetch("/api/telegram/auth", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ initData }),
        });
        const payload: AuthResponse = await response.json();

        if (!response.ok || !payload.ok) {
          setStatus(`Ошибка авторизации: ${payload.error ?? "unknown error"}`);
          return;
        }

        setStatus("Авторизация успешна.");
        setUser(payload.user ?? tg.initDataUnsafe?.user ?? null);
      } catch {
        setStatus("Сетевая ошибка при проверке initData.");
      }
    };

    script.onerror = () => {
      setStatus("Не удалось загрузить Telegram WebApp SDK.");
    };

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  const shortInitData = useMemo(() => {
    if (!rawInitData) return "empty";
    return rawInitData.length > 120
      ? `${rawInitData.slice(0, 120)}...`
      : rawInitData;
  }, [rawInitData]);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <section className="mx-auto w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Telegram Mini App</h1>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            Next.js
          </span>
        </div>

        <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p>
            <strong>Статус:</strong> {status}
          </p>
          <p className="break-all text-sm text-zinc-600 dark:text-zinc-400">
            <strong>initData:</strong> {shortInitData}
          </p>
        </div>

        <div className="mt-6">
          <h2 className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-300">
            Пользователь из Telegram
          </h2>
          <pre className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
            {JSON.stringify(user ?? { info: "Нет данных" }, null, 2)}
          </pre>
        </div>
      </section>
    </main>
  );
}
