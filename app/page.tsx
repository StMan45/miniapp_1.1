"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const SYSTEM_PROMPT = `
Ты — AI-помощник для начинающего SMM-специалиста.

Твоя специализация:
- Instagram Stories: структура серий, hooks, CTA, сценарии, визуальная логика.
- Reels и короткий монтаж: pacing, transitions, color grading, B-roll, captions.
- Визуальные preset ideas: настроение, цвета, композиция, референсы по стилю.
- Подбор шрифтов: font pairs, роли шрифтов, где использовать headline/body/accent.
- Идеи контента для личного бренда, экспертов, beauty, fashion, lifestyle, education и small business.

Стиль ответа:
- Отвечай на русском языке.
- Профессиональные термины оставляй на английском, если так понятнее: hook, CTA, preset, transition, font pair, moodboard, color grading, caption, layout.
- Давай готовые варианты, а не общие советы.
- Если пользователь просит подбор, дай 3-5 вариантов на выбор.
- Для шрифтов указывай, где их лучше искать: Google Fonts, Canva, CapCut или системные аналоги.
- Если данных недостаточно, сначала задай 1-3 уточняющих вопроса.
- Не утверждай, что можешь отправить платные файлы, пресеты или шрифты. Вместо этого предложи доступные названия, сочетания и инструкцию, где найти.

Форматируй ответы компактно:
- короткое вступление;
- варианты списком;
- практические шаги;
- финальная рекомендация.
`.trim();

const COMMAND_PROMPTS = {
  preset: `
Составь визуальный preset для Instagram Stories или короткого видео.
Если пользователь не указал нишу, уточни нишу, цель и настроение.
В ответе дай:
1. Название style direction.
2. Цветовую палитру.
3. Свет/контраст/зерно/температуру.
4. Композицию и layout.
5. Эффекты и transitions.
6. Где это собрать: Instagram, Canva, CapCut или VN.
`.trim(),
  fonts: `
Подбери font pairs для Instagram Stories/Reels.
Если пользователь не указал стиль или нишу, уточни их.
В ответе дай 5 вариантов:
- headline font;
- body font;
- accent font при необходимости;
- где найти шрифты;
- для какого визуального настроения подходит пара.
Используй реальные популярные шрифты из Google Fonts, Canva или CapCut.
`.trim(),
  reels: `
Помоги собрать идею и монтажный план для Reels.
В ответе дай:
1. Hook на первые 1-2 секунды.
2. Сценарий по кадрам.
3. Монтажный pacing.
4. Transitions и captions.
5. CTA.
6. Идеи B-roll.
`.trim(),
  idea: `
Сгенерируй идеи контента для SMM.
Если пользователь не указал нишу, уточни ее.
Дай 10 идей, раздели их на:
- awareness;
- trust;
- selling;
- engagement.
Для каждой идеи добавь короткий формат: Stories, Reels, post или carousel.
`.trim(),
};

const HELP_TEXT = `
Я SMM-помощник для Instagram Stories, Reels, монтажа, пресетов и шрифтов.

Если доступна кнопка Open Mini App, открой её для работы через удобный интерфейс:
Profile, Ideas, Story/Reel Builder и Links.

Команды:
/preset — 🎨 подобрать визуальный preset или стиль для Stories/видео
/fonts — 🔤 подобрать font pairs под нишу и настроение
/reels — 🎬 собрать идею, hook и монтажный план для Reels
/idea — 💡 придумать идеи контента
/save — 🔖 сохранить полезную ссылку: /save https://site.com описание
/links — 📚 показать сохраненные ссылки
/linkdelete — 🗑️ удалить ссылку по ID
/help — 🧭 показать подсказку

Можно писать обычным сообщением, например:
"Подбери шрифты для beauty-эксперта в стиле luxury"
"Сделай preset для сторис кофейни в теплых тонах"
"Дай сценарий Reels для начинающего SMM"
"Сохрани ссылку: /save https://example.com полезный сервис для SMM"
`.trim();

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

const STORAGE_KEY = "smm-miniapp-links-v1";

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

function askForPresetContext() {
  return `Чтобы сделать preset точнее, уточни 3 пункта:
- Ниша (beauty/fashion/lifestyle/education/small business)
- Цель (продажи, прогрев, личный бренд, охваты)
- Настроение (clean/luxury/cozy/edgy/minimal)`;
}

function askForFontsContext() {
  return `Чтобы подобрать font pairs точнее, напиши:
- Нишу
- Визуальный стиль (например, luxury/minimal/editorial/playful)
- Где монтируешь чаще (Canva/CapCut/Instagram)`;
}

function buildPresetReply(topic: string) {
  if (!topic) {
    return askForPresetContext();
  }

  return `Собрал 3 preset-направления для: ${topic}

1) Style direction: Soft Editorial Glow
- Палитра: #F6E9E2, #D5B8A7, #9A7B6F, #2F2623
- Свет/контраст/зерно/температура: Exposure +0.3, Contrast -10, Warmth +8, Grain 8
- Композиция и layout: много воздуха, крупные планы, текст в верхней трети
- Эффекты и transitions: cross dissolve 0.2s, light leak, мягкий zoom-in
- Где собрать: CapCut (Color + Grain), Canva (layout), Instagram (финальный текст)

2) Style direction: Clean Product Focus
- Палитра: #F7F7F7, #E2E8F0, #64748B, #111827
- Свет/контраст/зерно/температура: Exposure +0.1, Contrast +6, Saturation -5, Grain 0
- Композиция и layout: 1 ключевой объект в центре, карточки с короткими буллетами
- Эффекты и transitions: hard cut в бит, whip pan между сценами
- Где собрать: VN или CapCut (быстрый монтаж), Canva (текстовые карточки)

3) Style direction: Warm Storytelling
- Палитра: #FFF3E0, #E8C9A1, #B7794D, #4A3428
- Свет/контраст/зерно/температура: Exposure -0.1, Contrast +12, Warmth +12, Grain 12
- Композиция и layout: чередование detail/B-roll/говорящая голова, подписи по нижней сетке
- Эффекты и transitions: match cut по движению, speed ramp 0.8x→1.2x
- Где собрать: CapCut (speed ramp + transitions), Instagram Stories (наклейки/опросы)

Практические шаги:
- Выбери 1 направление и сделай 5-7 кадров в одном свете.
- Прогони единый color grading для всех фрагментов.
- Добавь один CTA-слайд в конце (написать в Direct/перейти по ссылке).

Рекомендация: для быстрого старта возьми Soft Editorial Glow — он универсален для личного бренда и beauty.`;
}

function buildFontsReply(topic: string) {
  if (!topic) {
    return askForFontsContext();
  }

  return `Подобрал 5 font pairs для: ${topic}

1) Elegant Expert
- Headline: Playfair Display
- Body: Inter
- Accent: Great Vibes
- Где найти: Google Fonts, Canva
- Настроение: luxury, editorial, premium

2) Clean Business
- Headline: Manrope
- Body: DM Sans
- Accent: Bebas Neue
- Где найти: Google Fonts, Canva, CapCut
- Настроение: modern, structured, confident

3) Soft Lifestyle
- Headline: Cormorant Garamond
- Body: Nunito Sans
- Accent: Allura
- Где найти: Google Fonts, Canva
- Настроение: cozy, personal, aesthetic

4) Bold Creator
- Headline: Montserrat ExtraBold
- Body: Work Sans
- Accent: League Spartan
- Где найти: Google Fonts, Canva, системные аналоги в CapCut
- Настроение: energetic, dynamic, social-first

5) Minimal Education
- Headline: Space Grotesk
- Body: Source Sans 3
- Accent: IBM Plex Mono
- Где найти: Google Fonts, Canva
- Настроение: smart, tech, clear

Практические шаги:
- Используй 1 пару на серию сторис, не смешивай больше 2-3 гарнитур.
- Headline делай 110-140% от базового размера body.
- Accent применяй только в CTA или цифрах.

Рекомендация: если нужен универсальный вариант под большинство ниш, начни с пары Manrope + DM Sans.`;
}

function buildReelsReply(topic: string) {
  const base = topic || "начинающего SMM-специалиста";
  return `Идея Reels для: ${base}

1. Hook (1-2 сек):
- "3 ошибки, из-за которых Stories не продают — и как исправить за 1 день"

2. Сценарий по кадрам:
- Кадр 1: крупный план + текст hook на экране
- Кадр 2: ошибка #1 (перегруженный экран без CTA)
- Кадр 3: исправление #1 (1 мысль = 1 слайд)
- Кадр 4: ошибка #2 (нет структуры прогрева)
- Кадр 5: исправление #2 (hook → ценность → CTA)
- Кадр 6: ошибка #3 (разный стиль в каждом ролике)
- Кадр 7: исправление #3 (единый preset + font pair)
- Кадр 8: финальный CTA

3. Монтажный pacing:
- 0:00-0:02: быстрый старт
- 0:02-0:12: блок "ошибки"
- 0:12-0:22: блок "исправления"
- 0:22-0:27: итог + CTA

4. Transitions и captions:
- Transitions: cut on beat, whip pan, 1 match cut
- Captions: короткие, до 6-8 слов в строке, ключевые слова выделяй CAPS

5. CTA:
- "Хочешь шаблон сторис-цепочки? Напиши в Direct слово: PLAN"

6. B-roll:
- набор сторис в телефоне
- процесс монтажа в CapCut
- заметки с контент-планом
- рабочий стол/ноутбук/кофе для lifestyle-переходов`;
}

function buildIdeasReply(topic: string) {
  if (!topic) {
    return "Для точных идей уточни нишу и ЦА. Например: 'beauty-мастер, девушки 20-35, Москва'.";
  }

  return `10 идей контента для ниши: ${topic}

Awareness
- "3 мифа ниши, в которые верят новички" — Reels
- "Закулисье: как выглядит мой рабочий день" — Stories
- "Тренды месяца: что реально работает" — carousel

Trust
- "Кейс: было/стало за 30 дней" — post
- "Разбор частой ошибки клиента" — Reels
- "FAQ: 5 частых вопросов и честные ответы" — Stories

Selling
- "Мини-офер недели + дедлайн" — Stories
- "Что входит в услугу и кому подходит" — carousel

Engagement
- "Выбери вариант A/B (опрос)" — Stories
- "Разбор подписчика: пришли запрос в комментарии" — Reels

Практические шаги:
- Сохрани 4 идеи (по 1 из каждого блока) в контент-план на ближайшую неделю.
- Для каждой идеи подготовь 1 hook и 1 CTA заранее.

Рекомендация: публикуй в пропорции 40% trust, 30% awareness, 20% engagement, 10% selling.`;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [links, setLinks] = useState<LinkItem[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as LinkItem[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
  });
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createId(),
      role: "assistant",
      text: `${HELP_TEXT}\n\nЕсли что-то не понятно, задай уточняющие вопросы.`,
    },
  ]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  }, [links]);

  const commandList = useMemo(
    () => ["/preset", "/fonts", "/reels", "/idea", "/save", "/links", "/linkdelete", "/help"],
    []
  );

  function addMessage(role: ChatMessage["role"], text: string) {
    setMessages((prev) => [...prev, { id: createId(), role, text }]);
  }

  function buildLinksList() {
    if (!links.length) {
      return "Список ссылок пуст. Добавь первую через /save https://site.com описание";
    }

    const content = links
      .map(
        (item) =>
          `ID: ${item.id}\nURL: ${item.url}\nОписание: ${item.description || "—"}\nСоздано: ${item.createdAt}`
      )
      .join("\n\n");

    return `Сохраненные ссылки:\n\n${content}`;
  }

  function handleCommand(userText: string) {
    const trimmed = userText.trim();
    if (!trimmed) {
      return;
    }

    addMessage("user", trimmed);
    const { command, args } = splitCommand(trimmed);

    if (command === "/help") {
      addMessage("assistant", HELP_TEXT);
      return;
    }

    if (command === "/preset") {
      addMessage("assistant", buildPresetReply(args));
      return;
    }

    if (command === "/fonts") {
      addMessage("assistant", buildFontsReply(args));
      return;
    }

    if (command === "/reels") {
      addMessage("assistant", buildReelsReply(args));
      return;
    }

    if (command === "/idea") {
      addMessage("assistant", buildIdeasReply(args));
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
        id: createId().slice(0, 8),
        url,
        description,
        createdAt: new Date().toLocaleString("ru-RU"),
      };

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

      setLinks((prev) => prev.filter((link) => link.id !== id));
      addMessage("assistant", `Ссылка с ID ${id} удалена.`);
      return;
    }

    if (command.startsWith("/")) {
      addMessage("assistant", `Неизвестная команда: ${command}\n\nДоступные: ${commandList.join(", ")}`);
      return;
    }

    const lowered = trimmed.toLowerCase();
    if (lowered.includes("шрифт") || lowered.includes("font")) {
      addMessage("assistant", buildFontsReply(trimmed));
      return;
    }
    if (lowered.includes("preset") || lowered.includes("цвет") || lowered.includes("сторис")) {
      addMessage("assistant", buildPresetReply(trimmed));
      return;
    }
    if (lowered.includes("reels") || lowered.includes("рилс") || lowered.includes("монтаж")) {
      addMessage("assistant", buildReelsReply(trimmed));
      return;
    }
    if (lowered.includes("иде") || lowered.includes("контент")) {
      addMessage("assistant", buildIdeasReply(trimmed));
      return;
    }

    addMessage(
      "assistant",
      "Уточни задачу в свободной форме или используй команду: /preset, /fonts, /reels, /idea, /save, /links, /linkdelete, /help"
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text) {
      return;
    }
    setInput("");
    handleCommand(text);
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <main className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-semibold">SMM Mini Assistant</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Рабочая версия команд для Stories, Reels, presets, font pairs и ссылок.
          </p>

          <div className="mt-4">
            <p className="mb-2 text-sm font-medium">Быстрые команды</p>
            <div className="flex flex-wrap gap-2">
              {commandList.map((cmd) => (
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

          <details className="mt-4 rounded-xl bg-zinc-100 p-3 text-xs leading-5 dark:bg-zinc-800">
            <summary className="cursor-pointer font-semibold">Техническая подсказка</summary>
            <p className="mt-2 whitespace-pre-wrap">{SYSTEM_PROMPT}</p>
            <p className="mt-3 whitespace-pre-wrap">{JSON.stringify(COMMAND_PROMPTS, null, 2)}</p>
          </details>
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
          </div>

          <form onSubmit={onSubmit} className="border-t border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Введите команду или запрос..."
                className="h-11 flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                type="submit"
                className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500"
              >
                Отправить
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
