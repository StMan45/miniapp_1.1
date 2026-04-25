import fs from "node:fs";
import path from "node:path";
import process from "node:process";

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

async function callTelegram(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const raw = await response.json();
  if (!response.ok || !raw.ok) {
    throw new Error(raw.description || `Telegram API ${method} failed`);
  }
  return raw.result;
}

async function main() {
  loadEnvFile();

  const baseUrl = process.env.TELEGRAM_MINI_APP_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  if (!baseUrl || !/^https:\/\//i.test(baseUrl)) {
    throw new Error("TELEGRAM_MINI_APP_URL must be a valid https URL");
  }

  const webhookUrl = `${baseUrl.replace(/\/+$/, "")}/api/telegram/webhook`;
  const payload = {
    url: webhookUrl,
    allowed_updates: ["message"],
    ...(secret ? { secret_token: secret } : {}),
  };

  await callTelegram("setWebhook", payload);
  const info = await callTelegram("getWebhookInfo", {});

  console.log("Webhook installed.");
  console.log(`URL: ${webhookUrl}`);
  console.log(`Pending updates: ${info.pending_update_count}`);
  if (info.last_error_message) {
    console.log(`Last error: ${info.last_error_message}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
