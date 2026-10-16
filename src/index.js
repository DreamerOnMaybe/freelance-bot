import "dotenv/config";
import { Bot, InlineKeyboard } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import cron from "node-cron";
import { fetchOrders, filterOrders } from "./services/rss.js";
import { isSeen, markSeen, saveOrder, getOrder } from "./services/storage.js";
import { generateProposal } from "./services/ai.js";
import { startTgListener } from "./services/tgListener.js";

if (!process.env.BOT_TOKEN) {
  throw new Error("Критическая ошибка: BOT_TOKEN не задан в .env файле!");
}

const bot = new Bot(process.env.BOT_TOKEN);
bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 30 }));

const CHAT_ID = process.env.CHAT_ID ? Number(process.env.CHAT_ID) : null;

function escapeHtml(text = "") {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(text = "", max = 300) {
  const chars = [...String(text ?? "")]; 
  return chars.length > max ? chars.slice(0, max).join("").trimEnd() + "…" : chars.join("");
}

const isAllowedChat = (ctx) => CHAT_ID !== null && ctx.chat?.id === CHAT_ID;

async function sendOrderToChat(order) {
  await saveOrder(order);

  const safeTitle = escapeHtml(order.title);
  const safeDescription = escapeHtml(truncate(order.description, 300));
  const linkText = /^https?:\/\//.test(order.link || "")
    ? `\n\n🔗 <a href="${escapeHtml(order.link)}">Открыть источник</a>`
    : "";

  const message = `🔥 <b>${safeTitle}</b>\n\n${safeDescription}${linkText}`;
  const keyboard = new InlineKeyboard().text("✍️ Сгенерировать отклик", `gen_${order.id}`);

  await bot.api.sendMessage(CHAT_ID, message, {
    parse_mode: "HTML",
    reply_markup: keyboard,
    link_preview_options: { is_disabled: true },
  });
}

const inFlight = new Set();

async function processOrder(order) {
  if (!CHAT_ID) return false;
  if (inFlight.has(order.id)) return false;
  inFlight.add(order.id);

  try {
    if (await isSeen(order.id)) return false;
    await sendOrderToChat(order);
    await markSeen(order.id);
    return true;
  } catch (error) {
    console.error(`Не удалось отправить заказ ${order.id}:`, error.message);
    return false;
  } finally {
    inFlight.delete(order.id);
  }
}

let isChecking = false;

async function checkFreelance() {
  if (!CHAT_ID) {
    console.log("CHAT_ID пока не указан в .env — отправь боту /start, чтобы узнать его.");
    return;
  }
  if (isChecking) return;
  isChecking = true;

  try {
    const matched = filterOrders(await fetchOrders());

    let sent = 0;
    for (const order of matched) {
      if (await processOrder(order)) sent++;
    }

    if (sent === 0) {
      console.log(`[${new Date().toLocaleTimeString()}] Проверка завершена: новых заказов нет.`);
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] Отправлено новых заказов: ${sent}.`);
    }
  } catch (error) {
    console.error("Ошибка при проверке заказов:", error);
  } finally {
    isChecking = false;
  }
}

const cronTask = cron.schedule("*/2 * * * *", () => {
  console.log("Запуск периодической проверки биржи...");
  checkFreelance();
});

bot.command("start", async (ctx) => {
  console.log("Твой CHAT_ID:", ctx.chat.id);
  await ctx.reply(
    `Привет! ID этого чата: <code>${ctx.chat.id}</code>\n` +
      `Впиши его в .env как CHAT_ID и перезапусти бота.`,
    { parse_mode: "HTML" }
  );
});

const generating = new Set();

bot.callbackQuery(/^gen_(.+)$/, async (ctx) => {
  if (!isAllowedChat(ctx)) {
    await ctx.answerCallbackQuery();
    return;
  }

  const orderId = ctx.match[1];

  if (generating.has(orderId)) {
    await ctx.answerCallbackQuery({ text: "Уже генерирую, секунду..." });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Генерирую отклик..." });

  const order = await getOrder(orderId);
  if (!order) {
    await ctx.reply("⚠️ Этот заказ уже удалён из кэша — сгенерировать отклик не получится.");
    return;
  }

  generating.add(orderId);
  try {
    await ctx.replyWithChatAction("typing");

    if (!order.proposal) {
      order.proposal = await generateProposal(order.title, order.description);
      await saveOrder(order);
    }

    await ctx.reply(
      `🎯 <b>Готовый отклик</b> (нажми на блок для копирования):\n\n<pre>${escapeHtml(order.proposal)}</pre>`,
      {
        parse_mode: "HTML",
        reply_parameters: ctx.callbackQuery.message
          ? { message_id: ctx.callbackQuery.message.message_id }
          : undefined,
      }
    );
  } catch (error) {
    console.error("Ошибка при генерации:", error.message);
    await ctx.reply("⚠️ Не удалось сгенерировать отклик. Попробуй позже.");
  } finally {
    generating.delete(orderId);
  }
});

bot.catch((err) => {
  console.error("Ошибка в работе бота:", err);
});

let tgClient = null;

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

async function shutdown(signal) {
  console.log(`\n${signal} получен, останавливаюсь...`);
  try {
    cronTask.stop();
    await bot.stop();
    await tgClient?.disconnect();
  } catch (error) {
    console.error("Ошибка при остановке:", error.message);
  } finally {
    process.exit(0);
  }
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

bot.start({
  onStart: (botInfo) => {
    console.log(`Бот @${botInfo.username} успешно запущен!`);
    checkFreelance();

    startTgListener(processOrder)
      .then((client) => {
        tgClient = client;
      })
      .catch((error) => {
        console.error("[TG Listener] Не удалось запустить:", error.message);
      });
  },
});