import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LINKS_FILE = path.resolve(process.cwd(), "data", "telegram-links.json");

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

Пиши обычным сообщением, команды не обязательны.

Команды:
/preset — усилить запрос контекстом для visual preset
/fonts — усилить запрос контекстом для font pairs
/reels — усилить запрос контекстом для Reels-плана
/idea — усилить запрос контекстом для контент-идей
/save — сохранить ссылку: /save https://site.com описание
/links — показать сохраненные ссылки
/linkdelete — удалить ссылку по ID
/help — показать подсказку
`.trim();

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function createId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function splitCommand(input) {
  const trimmed = input.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) {
    return { command: trimmed.toLowerCase(), args: "" };
  }
  return {
    command: trimmed.slice(0, spaceIndex).toLowerCase(),
    args: trimmed.slice(spaceIndex + 1).trim(),
  };
}

function ensureParentDirectory(filePath) {
  const parent = path.dirname(filePath);
  if (!fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }
}

function loadLinksStore() {
  try {
    if (!fs.existsSync(LINKS_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(LINKS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveLinksStore(store) {
  ensureParentDirectory(LINKS_FILE);
  fs.writeFileSync(LINKS_FILE, JSON.stringify(store, null, 2), "utf8");
}

function getMaxHistory() {
  const value = Number(process.env.MAX_HISTORY_MESSAGES);
  if (!Number.isFinite(value) || value <= 0) return 12;
  return Math.min(value, 30);
}

function getAssistantContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((part) => part && typeof part === "object" && part.type === "text")
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
}

class TelegramBotRunner {
  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN;
    this.baseUrl = `https://api.telegram.org/bot${this.token}`;
    this.openRouterApiKey = process.env.OPENROUTER_API_KEY;
    this.openRouterBaseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
    this.model = process.env.AI_MODEL || "openai/gpt-4o-mini";
    this.appName = process.env.APP_NAME || "SMM Assistant Telegram Bot";
    this.maxHistory = getMaxHistory();
    this.offset = 0;
    this.histories = new Map();
    this.linksStore = loadLinksStore();
    this.botUsername = "";
  }

  validateConfig() {
    if (!this.token) {
      throw new Error("TELEGRAM_BOT_TOKEN is missing.");
    }
    if (!this.openRouterApiKey) {
      throw new Error("OPENROUTER_API_KEY is missing.");
    }
  }

  async callTelegram(method, payload) {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok || !body.ok) {
      throw new Error(`Telegram API ${method} failed: ${JSON.stringify(body)}`);
    }
    return body.result;
  }

  async sendMessage(chatId, text, replyToMessageId) {
    return this.callTelegram("sendMessage", {
      chat_id: chatId,
      text,
      reply_to_message_id: replyToMessageId,
    });
  }

  async sendTyping(chatId) {
    try {
      await this.callTelegram("sendChatAction", {
        chat_id: chatId,
        action: "typing",
      });
    } catch {
      // Ignore typing action failures.
    }
  }

  getChatLinks(chatId) {
    const key = String(chatId);
    if (!Array.isArray(this.linksStore[key])) {
      this.linksStore[key] = [];
    }
    return this.linksStore[key];
  }

  saveChatLinks(chatId, links) {
    this.linksStore[String(chatId)] = links;
    saveLinksStore(this.linksStore);
  }

  appendHistory(chatId, role, text) {
    const key = String(chatId);
    const history = this.histories.get(key) || [];
    history.push({ role, text });
    this.histories.set(key, history.slice(-this.maxHistory));
  }

  getHistory(chatId) {
    return this.histories.get(String(chatId)) || [];
  }

  async askModel(userMessage, chatId, commandKey) {
    const history = this.getHistory(chatId);
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(commandKey ? [{ role: "system", content: COMMAND_PROMPTS[commandKey] }] : []),
      ...history.map((item) => ({ role: item.role, content: item.text })),
      { role: "user", content: userMessage },
    ];

    const response = await fetch(`${this.openRouterBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.openRouterApiKey}`,
        "Content-Type": "application/json",
        "X-Title": this.appName,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.7,
      }),
    });

    const raw = await response.json();
    if (!response.ok) {
      const reason = raw?.error?.message || "OpenRouter request failed";
      throw new Error(reason);
    }

    const content = raw?.choices?.[0]?.message?.content;
    const reply = getAssistantContent(content);
    if (!reply) {
      throw new Error("Model returned empty response");
    }
    return reply;
  }

  async handleUpdate(update) {
    if (typeof update.update_id === "number") {
      this.offset = update.update_id + 1;
    }

    const message = update.message;
    if (!message || typeof message.text !== "string") return;
    if (message.chat?.type !== "private") return;

    const chatId = message.chat.id;
    const text = message.text.trim();
    if (!text) return;

    const { command, args } = splitCommand(text);
    const replyToMessageId = message.message_id;
    const commandMap = {
      "/preset": "preset",
      "/fonts": "fonts",
      "/reels": "reels",
      "/idea": "idea",
    };

    if (command === "/start") {
      await this.sendMessage(chatId, `Привет! Я онлайн.\n\n${HELP_TEXT}`, replyToMessageId);
      return;
    }

    if (command === "/help") {
      await this.sendMessage(chatId, HELP_TEXT, replyToMessageId);
      return;
    }

    if (command === "/save") {
      const parts = args.split(" ").filter(Boolean);
      const url = parts[0];
      const description = parts.slice(1).join(" ").trim();
      if (!url) {
        await this.sendMessage(chatId, "Используй формат: /save https://site.com описание", replyToMessageId);
        return;
      }
      if (!/^https?:\/\/\S+/i.test(url)) {
        await this.sendMessage(chatId, "Ссылка должна начинаться с http:// или https://", replyToMessageId);
        return;
      }

      const links = this.getChatLinks(chatId);
      const entry = {
        id: createId().slice(0, 8),
        url,
        description,
        createdAt: new Date().toLocaleString("ru-RU"),
      };
      links.unshift(entry);
      this.saveChatLinks(chatId, links);
      await this.sendMessage(
        chatId,
        `Ссылка сохранена.\nID: ${entry.id}\nURL: ${entry.url}\nОписание: ${entry.description || "—"}`,
        replyToMessageId
      );
      return;
    }

    if (command === "/links") {
      const links = this.getChatLinks(chatId);
      if (!links.length) {
        await this.sendMessage(chatId, "Список ссылок пуст.", replyToMessageId);
        return;
      }
      const output = links
        .map((item) => `ID: ${item.id}\nURL: ${item.url}\nОписание: ${item.description || "—"}`)
        .join("\n\n");
      await this.sendMessage(chatId, `Сохраненные ссылки:\n\n${output}`, replyToMessageId);
      return;
    }

    if (command === "/linkdelete") {
      const id = args.trim();
      if (!id) {
        await this.sendMessage(chatId, "Укажи ID: /linkdelete <id>", replyToMessageId);
        return;
      }
      const links = this.getChatLinks(chatId);
      const exists = links.some((item) => item.id === id);
      if (!exists) {
        await this.sendMessage(chatId, `Ссылка с ID ${id} не найдена.`, replyToMessageId);
        return;
      }
      const next = links.filter((item) => item.id !== id);
      this.saveChatLinks(chatId, next);
      await this.sendMessage(chatId, `Ссылка с ID ${id} удалена.`, replyToMessageId);
      return;
    }

    if (command.startsWith("/") && !(command in commandMap)) {
      await this.sendMessage(
        chatId,
        "Неизвестная команда. Используй /help или пиши запрос обычным сообщением.",
        replyToMessageId
      );
      return;
    }

    const commandKey = commandMap[command] || null;
    const userPrompt = commandKey
      ? args || "Пользователь не добавил детали, задай 1-3 уточняющих вопроса."
      : text;

    this.appendHistory(chatId, "user", userPrompt);
    await this.sendTyping(chatId);

    try {
      const reply = await this.askModel(userPrompt, chatId, commandKey);
      this.appendHistory(chatId, "assistant", reply);
      await this.sendMessage(chatId, reply, replyToMessageId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      await this.sendMessage(
        chatId,
        `Не удалось получить ответ от AI.\nПричина: ${reason}`,
        replyToMessageId
      );
    }
  }

  async run() {
    this.validateConfig();
    const me = await this.callTelegram("getMe", {});
    this.botUsername = me?.username ? `@${me.username}` : "";
    console.log(`Bot started in polling mode ${this.botUsername}`.trim());
    console.log("Press Ctrl+C to stop.");

    while (true) {
      try {
        const updates = await this.callTelegram("getUpdates", {
          timeout: 30,
          offset: this.offset,
          allowed_updates: ["message"],
        });

        for (const update of updates) {
          await this.handleUpdate(update);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown error";
        console.error(`Polling error: ${reason}`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }
}

loadEnvFile();

const runner = new TelegramBotRunner();
runner.run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
