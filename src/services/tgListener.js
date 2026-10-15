import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import input from "input";

// Список надежных каналов (убрали невалидный finder_vc, добавили проверенные)
const CHANNELS_TO_WATCH = [
  "freelancetaverna",
  "normrabota",
  "distantsiya",
];

const KEYWORDS = [
  "верстк",
  "вёрстк",
  "html",
  "css",
  "лендинг",
  "landing",
  "frontend",
  "фронтенд",
  "javascript",
  "сайт под ключ",
  "поправить сайт",
  "figma",
  "тильда",
];

const STOP_WORDS = [
  "звонки",
  "холодн",
  "продаж",
  "менеджер",
  "копирайт",
  "дизайн интерьер",
  "1с",
  "битрикс",
];

export async function startTgListener(onNewOrderCallback) {
  const apiId = Number(process.env.TG_API_ID);
  const apiHash = process.env.TG_API_HASH;
  const sessionString = process.env.TG_SESSION?.trim();

  if (!apiId || !apiHash) {
    console.warn("[TG Listener] TG_API_ID или TG_API_HASH не заданы. Пропуск запуска клиента.");
    return;
  }

  const stringSession = new StringSession(sessionString || undefined);
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text("Введи номер телефона: "),
    password: async () => await input.text("Введи 2FA пароль (если включен): "),
    phoneCode: async () => await input.text("Введи код подтверждения: "),
    onError: (err) => console.error("[TG Listener] Ошибка авторизации:", err),
  });

  console.log("[TG Listener] Клиент успешно авторизован!");

  if (!sessionString) {
    console.log("\n⚠️ СКОПИРУЙ ЭТУ СТРОКУ В .env КАК TG_SESSION:\n");
    console.log(`TG_SESSION="${client.session.save()}"\n`);
  }

  // Сохраняем строковые ID подключенных каналов в Set для мгновенной проверки
  const allowedChatIds = new Set();
  const channelMap = new Map(); // id -> username

  for (const username of CHANNELS_TO_WATCH) {
    try {
      const entity = await client.getEntity(username);
      const strId = entity.id.toString();
      allowedChatIds.add(strId);
      channelMap.set(strId, username);
      console.log(`[TG Listener] Подключен канал: @${username} (ID: ${strId})`);
    } catch (err) {
      console.warn(`[TG Listener] Пропускаем @${username}: ${err.message}`);
    }
  }

  if (allowedChatIds.size === 0) {
    console.warn("[TG Listener] Ни один канал не был подключен.");
    return;
  }

  // Слушаем события и фильтруем по ID чата вручную — это исключает любые сбои библиотеки
  client.addEventHandler(async (event) => {
    try {
      const message = event.message;
      if (!message || !message.text) return;

      const chatId = message.chatId?.toString();
      if (!chatId || !allowedChatIds.has(chatId)) {
        return; // Сообщение не из наших целевых каналов
      }

      const text = message.text;
      const lowerText = text.toLowerCase();

      // 1. Стоп-слова
      if (STOP_WORDS.some((w) => lowerText.includes(w))) return;

      // 2. Ключевые слова
      const isMatched = KEYWORDS.some((k) => lowerText.includes(k));
      if (!isMatched) return;

      const username = channelMap.get(chatId) || "канал";
      const messageLink = `https://t.me/${username}/${message.id}`;

      const order = {
        id: `tg_${message.id}_${Date.now()}`.slice(-15),
        title: `Заказ из Telegram (@${username})`,
        description: text,
        link: messageLink,
        source: "telegram",
      };

      console.log(`[TG Listener] 🎯 Найден заказ в @${username}! Передаю в бота...`);
      onNewOrderCallback(order);
    } catch (handlerErr) {
      console.error("[TG Listener] Ошибка обработки сообщения:", handlerErr.message);
    }
  }, new NewMessage({}));

  console.log(`[TG Listener] Активен мониторинг (${allowedChatIds.size} каналов). Ожидание новых постов...`);
}