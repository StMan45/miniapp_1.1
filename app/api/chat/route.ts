import { appendChatMessage, listChatMessages } from "@/lib/chat-storage";

type IncomingMessage = {
  role: "assistant" | "user";
  text: string;
};

type CommandKey = "preset" | "fonts" | "reels" | "idea";

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

const COMMAND_PROMPTS: Record<CommandKey, string> = {
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

function getMaxHistory() {
  const envValue = Number(process.env.MAX_HISTORY_MESSAGES);
  if (!Number.isFinite(envValue) || envValue <= 0) {
    return 12;
  }
  return Math.min(envValue, 30);
}

function getAssistantContent(message: { content?: unknown; reasoning?: unknown } | undefined) {
  const content = message?.content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const textParts = content
      .filter((part) => part && typeof part === "object" && "type" in part && "text" in part)
      .map((part) => {
        const candidate = part as { type?: string; text?: unknown };
        return candidate.type === "text" && typeof candidate.text === "string" ? candidate.text : "";
      })
      .filter(Boolean);

    const joined = textParts.join("\n").trim();
    if (joined) {
      return joined;
    }
  }

  // Some reasoning models can return content=null and place output in reasoning.
  const reasoning = message?.reasoning;
  if (typeof reasoning === "string" && reasoning.trim()) {
    return reasoning.trim();
  }

  return "";
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      message?: string;
      history?: IncomingMessage[];
      commandKey?: CommandKey | null;
      chatId?: string;
    };

    const message = body.message?.trim();
    if (!message) {
      return Response.json({ error: "Пустой запрос" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "OPENROUTER_API_KEY не задан" }, { status: 500 });
    }

    const model = process.env.AI_MODEL || "openai/gpt-4o-mini";
    const baseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
    const appName = process.env.APP_NAME || "SMM Assistant Telegram Bot";
    const maxHistory = getMaxHistory();
    const chatId = body.chatId?.trim();
    const commandPrompt =
      body.commandKey && Object.hasOwn(COMMAND_PROMPTS, body.commandKey)
        ? COMMAND_PROMPTS[body.commandKey]
        : null;

    const dbHistory = chatId ? await listChatMessages(chatId, maxHistory) : [];
    const fallbackHistory = Array.isArray(body.history) ? body.history.slice(-maxHistory) : [];
    const historySource = dbHistory.length
      ? dbHistory.map((item) => ({ role: item.role, text: item.text }))
      : fallbackHistory;

    const payloadMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(commandPrompt ? [{ role: "system", content: commandPrompt }] : []),
      ...historySource
        .filter((item) => item && (item.role === "assistant" || item.role === "user") && typeof item.text === "string")
        .map((item) => ({
          role: item.role,
          content: item.text,
        })),
      { role: "user", content: message },
    ];

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.TELEGRAM_MINI_APP_URL || "https://miniapp-1-1.vercel.app/",
        "X-Title": appName,
      },
      body: JSON.stringify({
        model,
        messages: payloadMessages,
        temperature: 0.7,
      }),
    });

    const raw = (await response.json()) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: unknown } }>;
    };

    if (!response.ok) {
      const reason = raw?.error?.message || "Ошибка OpenRouter";
      return Response.json({ error: reason }, { status: response.status });
    }

    const firstMessage = raw.choices?.[0]?.message as
      | { content?: unknown; reasoning?: unknown }
      | undefined;
    const reply = getAssistantContent(firstMessage);
    if (!reply) {
      return Response.json({ error: "Модель вернула пустой ответ" }, { status: 502 });
    }

    if (chatId) {
      await appendChatMessage(chatId, "user", message);
      await appendChatMessage(chatId, "assistant", reply);
    }

    return Response.json({ reply });
  } catch {
    return Response.json({ error: "Внутренняя ошибка API /api/chat" }, { status: 500 });
  }
}
