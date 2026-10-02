import { Bot, InlineKeyboard } from "grammy";
import "dotenv/config";
import cron from "node-cron";
import { fetchOrders, filterOrders } from "./services/rss.js";
import { getSeenIds, saveSeenIds } from "./services/storage.js";

if (!process.env.BOT_TOKEN) {
  throw new Error("Критическая ошибка: BOT_TOKEN не задан в .env файле!");
}

const bot = new Bot(process.env.BOT_TOKEN);
const CHAT_ID = process.env.CHAT_ID;

function escapeHtml(text = "") {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function checkFreelance() {
  if (!CHAT_ID) {
    console.log("ID пока не указан в .env")
    return;
  }

  try {
    const seenIds = await getSeenIds();
    const allOrders = await fetchOrders();
    const matched = filterOrders(allOrders);

    const newOrders = matched.filter((order) => !seenIds.includes(order.id));

    if (newOrders.length === 0) {
      console.log(`[${new Date().toLocaleTimeString()}] Проверка завершена: новых заказов нет.`)
      return;
    }

    console.log(`Найдено новых заказов: ${newOrders.length}. Отправляю в Telegram...`);

    for (const order of newOrders) {
      const safeTitle = escapeHtml(order.title);
      const safeDescription = escapeHtml(order.description.slice(0, 300));
      const message = `🔥 <b>${safeTitle}</b>\n\n${safeDescription}...\n\n🔗 <a href="${order.link}">Посмотреть заказ</a>`;

      const keyboard = new InlineKeyboard().text(
        "✍️ Сгенерировать отклик",
        "generate_response"
      );

      await bot.api.sendMessage(CHAT_ID, message, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      })
    }

    const updatedIds = [...seenIds, ...newOrders.map((o) => o.id)];
    await saveSeenIds(updatedIds);
  } catch (error) {
    console.error("Ошибка при проверке заказов:", error);
  }
}

cron.schedule("*/2 * * * *", () => {
  console.log("Запуск периодической проверки биржи...")
  checkFreelance()
})

bot.command("start", async (ctx) => {
  console.log("Твой CHAT_ID:", ctx.chat.id);
  await ctx.reply("Привет! Твой ID сохранен. Скоро начнем мониторинг.");
});

bot.callbackQuery("generate_response", async (ctx) => {
  await ctx.answerCallbackQuery();

  const originalPost = ctx.callbackQuery.message?.text;

  await ctx.reply("🤖 Получил задачу! Начинаю генерацию отклика через ИИ...");
  console.log("Текст заказа для нейросети:\n", originalPost);
});

bot.catch((err) => {
  console.error("Ошибка в работе бота:", err);
});

bot.start({
  onStart: (botInfo) => {
    console.log(`Бот @${botInfo.username} успешно запущен!`);
    checkFreelance();
  },
});