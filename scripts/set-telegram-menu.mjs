import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!key) {
      continue;
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function callTelegram(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const base = `https://api.telegram.org/bot${token}/${method}`;

  const response = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(`Telegram API error in ${method}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  loadEnvFile();

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.TELEGRAM_MINI_APP_URL || "https://miniapp-1-1.vercel.app/";
  const menuText = process.env.TELEGRAM_MENU_TEXT || "Open Mini App";

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing in .env");
  }

  if (!/^https:\/\//i.test(appUrl)) {
    throw new Error("TELEGRAM_MINI_APP_URL must start with https://");
  }

  const me = await callTelegram("getMe", {});
  const username = me?.result?.username ? `@${me.result.username}` : "(unknown)";
  console.log(`Bot detected: ${username}`);

  await callTelegram("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: menuText,
      web_app: { url: appUrl },
    },
  });

  console.log("Menu button configured successfully.");
  console.log(`Text: ${menuText}`);
  console.log(`URL: ${appUrl}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
