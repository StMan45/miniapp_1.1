type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number; type?: string };
  };
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

const HELP_TEXT = `
Я SMM-помощник для Instagram Stories, Reels, монтажа, пресетов и шрифтов.

Пиши обычным сообщением, команды не обязательны.

Команды:
/preset — усилить запрос контекстом для visual preset
/fonts — усилить запрос контекстом для font pairs
/reels — усилить запрос контекстом для Reels-плана
/idea — усилить запрос контекстом для контент-идей
/help — показать подсказку
`.trim();

const commandMap: Record<string, CommandKey> = {
  "/preset": "preset",
  "/fonts": "fonts",
  "/reels": "reels",
  "/idea": "idea",
};

function splitCommand(text: string) {
  const trimmed = text.trim();
  const index = trimmed.indexOf(" ");
  if (index === -1) {
    return { command: trimmed.toLowerCase(), args: "" };
  }
  return {
    command: trimmed.slice(0, index).toLowerCase(),
    args: trimmed.slice(index + 1).trim(),
  };
}

function getAssistantContent(content: unknown) {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .filter((item) => item && typeof item === "object" && "type" in item && "text" in item)
      .map((item) => {
        const part = item as { type?: string; text?: unknown };
        return part.type === "text" && typeof part.text === "string" ? part.text : "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
}

async function callTelegram(method: string, payload: unknown) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const raw = (await response.json()) as { ok?: boolean; description?: string };
  if (!response.ok || !raw.ok) {
    throw new Error(raw.description || `Telegram API ${method} failed`);
  }
}

async function sendMessage(chatId: number, text: string, replyToMessageId?: number) {
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
  });
}

async function askOpenRouter(message: string, commandKey: CommandKey | null) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing");
  }

  const model = process.env.AI_MODEL || "openai/gpt-4o-mini";
  const baseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  const appName = process.env.APP_NAME || "SMM Assistant Telegram Bot";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": appName,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...(commandKey ? [{ role: "system", content: COMMAND_PROMPTS[commandKey] }] : []),
        { role: "user", content: message },
      ],
    }),
  });

  const raw = (await response.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  if (!response.ok) {
    throw new Error(raw?.error?.message || "OpenRouter error");
  }

  const content = raw.choices?.[0]?.message?.content;
  const reply = getAssistantContent(content);
  if (!reply) {
    throw new Error("Model returned empty response");
  }

  return reply;
}

async function handleMessage(message: NonNullable<TelegramUpdate["message"]>) {
  const text = message.text?.trim();
  const chatId = message.chat?.id;
  const chatType = message.chat?.type;
  const replyToMessageId = message.message_id;
  if (!text || !chatId || chatType !== "private") return;

  const { command, args } = splitCommand(text);

  if (command === "/start") {
    await sendMessage(chatId, `Привет! Я онлайн.\n\n${HELP_TEXT}`, replyToMessageId);
    return;
  }

  if (command === "/help") {
    await sendMessage(chatId, HELP_TEXT, replyToMessageId);
    return;
  }

  if (command === "/save" || command === "/links" || command === "/linkdelete") {
    await sendMessage(
      chatId,
      "Команды для сохранения ссылок доступны в Mini App. В чате бота работают AI-ответы и контент-команды.",
      replyToMessageId
    );
    return;
  }

  if (command.startsWith("/") && !(command in commandMap)) {
    await sendMessage(chatId, "Неизвестная команда. Используй /help или пиши обычным сообщением.", replyToMessageId);
    return;
  }

  const commandKey = commandMap[command] || null;
  const userMessage =
    commandKey && !args ? "Пользователь не добавил детали, задай 1-3 уточняющих вопроса." : commandKey ? args : text;

  try {
    const reply = await askOpenRouter(userMessage, commandKey);
    await sendMessage(chatId, reply, replyToMessageId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    await sendMessage(chatId, `Ошибка AI: ${reason}`, replyToMessageId);
  }
}

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ ok: true, status: "telegram webhook is live" });
}

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const header = request.headers.get("x-telegram-bot-api-secret-token");
    if (header !== secret) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const update = (await request.json()) as TelegramUpdate;
    if (update.message) {
      await handleMessage(update.message);
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: true });
  }
}
