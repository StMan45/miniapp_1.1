"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type CommandKey = "preset" | "fonts" | "reels" | "idea";

type LinkItem = {
  id: string;
  url: string;
  description: string;
  createdAt: string;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type TelegramWebAppData = {
  Telegram?: {
    WebApp?: {
      initDataUnsafe?: {
        user?: {
          id?: number | string;
        };
      };
    };
  };
};

const HELP_TEXT = `
Я SMM-помощник для Instagram Stories, Reels, монтажа, пресетов и шрифтов.

Обычные сообщения работают без команд: просто напиши задачу, и я отвечу через подключенную AI-модель.

Команды (опционально):
/preset — усилить запрос контекстом для visual preset
/fonts — усилить запрос контекстом для font pairs
/reels — усилить запрос контекстом для Reels-плана
/idea — усилить запрос контекстом для контент-идей
/save — сохранить ссылку: /save https://site.com описание
/links — показать сохраненные ссылки
/linkdelete — удалить ссылку по ID
/historyclear — очистить сохраненную переписку
/help — показать эту подсказку
`.trim();

const CLIENT_ID_STORAGE_KEY = "smm-miniapp-client-id-v1";
const MAX_API_HISTORY = 200;

const INITIAL_ASSISTANT_MESSAGE = `${HELP_TEXT}\n\nНапиши запрос, например: "Сделай Reels-план для beauty мастера в стиле luxury".`;

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function splitCommand(input: string) {
  const trimmed = input.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) {
    return { command: trimmed, args: "" };
  }
  return {
    command: trimmed.slice(0, spaceIndex),
    args: trimmed.slice(spaceIndex + 1).trim(),
  };
}

function commandToKey(command: string): CommandKey | null {
  if (command === "/preset") return "preset";
  if (command === "/fonts") return "fonts";
  if (command === "/reels") return "reels";
  if (command === "/idea") return "idea";
  return null;
}

function getTelegramChatId() {
  if (typeof window === "undefined") return null;
  const maybeTelegram = (window as Window & TelegramWebAppData).Telegram;
  const rawUserId = maybeTelegram?.WebApp?.initDataUnsafe?.user?.id;
  if (typeof rawUserId === "number" || typeof rawUserId === "string") {
    return `tg:${rawUserId}`;
  }
  return null;
}

function getGuestChatId() {
  if (typeof window === "undefined") {
    return "guest-server";
  }

  const stored = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (stored && stored.trim()) {
    return stored;
  }

  const created = `guest:${createId()}`;
  localStorage.setItem(CLIENT_ID_STORAGE_KEY, created);
  return created;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [chatId] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return getTelegramChatId() || getGuestChatId();
  });
  const [isHydrating, setIsHydrating] = useState(true);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createId(),
      role: "assistant",
      text: INITIAL_ASSISTANT_MESSAGE,
    },
  ]);

  const quickButtons = useMemo(() => ["/preset", "/fonts", "/reels", "/idea", "/links", "/help", "/historyclear"], []);

  useEffect(() => {
    void (async () => {
      try {
        if (!chatId) {
          return;
        }

        const [historyResponse, linksResponse] = await Promise.all([
          fetch(`/api/chat/history?chatId=${encodeURIComponent(chatId)}&limit=${MAX_API_HISTORY}`),
          fetch(`/api/links?chatId=${encodeURIComponent(chatId)}`),
        ]);

        if (historyResponse.ok) {
          const historyData = (await historyResponse.json()) as { messages?: ChatMessage[] };
          const nextMessages = Array.isArray(historyData.messages) ? historyData.messages : [];
          if (nextMessages.length > 0) {
            setMessages(nextMessages);
          }
        }

        if (linksResponse.ok) {
          const linksData = (await linksResponse.json()) as { links?: LinkItem[] };
          setLinks(Array.isArray(linksData.links) ? linksData.links : []);
        }
      } finally {
        setIsHydrating(false);
      }
    })();
  }, [chatId]);

  function addMessage(role: ChatMessage["role"], text: string) {
    const item: ChatMessage = { id: createId(), role, text };
    setMessages((prev) => [...prev, item]);
    return item;
  }

  function buildLinksList() {
    if (!links.length) {
      return "Список ссылок пуст. Добавь первую через /save https://site.com описание";
    }

    const content = links
      .map(
        (item) =>
          `ID: ${item.id}\nURL: ${item.url}\nОписание: ${item.description || "—"}\nСоздано: ${new Date(item.createdAt).toLocaleString("ru-RU")}`
      )
      .join("\n\n");

    return `Сохраненные ссылки:\n\n${content}`;
  }

  async function requestAssistantReply(userInput: string, commandKey: CommandKey | null) {
    const history = messages
      .filter((m) => m.role === "assistant" || m.role === "user")
      .map((m) => ({ role: m.role, text: m.text }))
      .slice(-12);

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userInput,
        commandKey,
        chatId,
        history,
      }),
    });

    const data = (await response.json()) as { reply?: string; error?: string };
    if (!response.ok || !data.reply) {
      throw new Error(data.error || "AI ответ не получен");
    }

    addMessage("assistant", data.reply);
  }

  async function handleInput(userText: string) {
    const trimmed = userText.trim();
    if (!trimmed) return;
    if (!chatId) {
      addMessage("assistant", "Не удалось определить chatId. Перезагрузи страницу.");
      return;
    }

    addMessage("user", trimmed);
    const { command, args } = splitCommand(trimmed);

    if (command === "/help") {
      addMessage("assistant", HELP_TEXT);
      return;
    }

    if (command === "/historyclear") {
      const response = await fetch("/api/chat/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId }),
      });

      if (!response.ok) {
        addMessage("assistant", "Не удалось очистить историю на сервере.");
        return;
      }

      setMessages([
        { id: createId(), role: "assistant", text: INITIAL_ASSISTANT_MESSAGE },
        { id: createId(), role: "assistant", text: "История переписки очищена." },
      ]);
      return;
    }

    if (command === "/save") {
      const parts = args.split(" ").filter(Boolean);
      const url = parts[0];
      const description = parts.slice(1).join(" ").trim();

      if (!url) {
        addMessage("assistant", "Используй формат: /save https://site.com короткое описание");
        return;
      }

      const isValid = /^https?:\/\/\S+/i.test(url);
      if (!isValid) {
        addMessage("assistant", "Ссылка должна начинаться с http:// или https://");
        return;
      }

      const newItem: LinkItem = {
        id: "",
        url: "",
        description: "",
        createdAt: "",
      };
      const response = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, url, description }),
      });
      const data = (await response.json()) as { link?: LinkItem; error?: string };
      if (!response.ok || !data.link) {
        addMessage("assistant", data.error || "Не удалось сохранить ссылку.");
        return;
      }

      newItem.id = data.link.id;
      newItem.url = data.link.url;
      newItem.description = data.link.description;
      newItem.createdAt = data.link.createdAt;
      setLinks((prev) => [newItem, ...prev]);
      addMessage(
        "assistant",
        `Ссылка сохранена.\nID: ${newItem.id}\nURL: ${newItem.url}\nОписание: ${newItem.description || "—"}`
      );
      return;
    }

    if (command === "/links") {
      addMessage("assistant", buildLinksList());
      return;
    }

    if (command === "/linkdelete") {
      const id = args.trim();
      if (!id) {
        addMessage("assistant", "Укажи ID: /linkdelete <id>");
        return;
      }

      const exists = links.some((link) => link.id === id);
      if (!exists) {
        addMessage("assistant", `Ссылка с ID ${id} не найдена.`);
        return;
      }

      const response = await fetch("/api/links", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, id }),
      });
      if (!response.ok) {
        addMessage("assistant", "Не удалось удалить ссылку на сервере.");
        return;
      }

      setLinks((prev) => prev.filter((link) => link.id !== id));
      addMessage("assistant", `Ссылка с ID ${id} удалена.`);
      return;
    }

    const commandKey = commandToKey(command);
    const aiInput = commandKey ? args || "Пользователь не добавил детали, задай 1-3 уточняющих вопроса." : trimmed;

    try {
      setIsLoading(true);
      await requestAssistantReply(aiInput, commandKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка соединения с AI";
      addMessage(
        "assistant",
        `Не удалось получить ответ от AI: ${message}\n\nПроверь OPENROUTER_API_KEY и доступность /api/chat.`
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isLoading || isHydrating) return;
    setInput("");
    await handleInput(text);
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <main className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-semibold">SMM Mini Assistant</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Ответы теперь приходят от подключенной AI-модели. Команды можно не использовать.
          </p>

          <div className="mt-4">
            <p className="mb-2 text-sm font-medium">Быстрые действия</p>
            <div className="flex flex-wrap gap-2">
              {quickButtons.map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => setInput(cmd)}
                  className="rounded-full border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-h-[70vh] flex-col rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`max-w-[92%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${
                  message.role === "assistant"
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    : "ml-auto bg-blue-600 text-white"
                }`}
              >
                {message.text}
              </article>
            ))}
            {isLoading ? (
              <article className="max-w-[92%] rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                AI печатает...
              </article>
            ) : null}
          </div>

          <form onSubmit={onSubmit} className="border-t border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={isHydrating ? "Загружаем историю из базы..." : "Введите запрос в свободной форме..."}
                className="h-11 flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
                disabled={isHydrating}
              />
              <button
                type="submit"
                disabled={isLoading || isHydrating}
                className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-400"
              >
                {isLoading ? "..." : "Отправить"}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
