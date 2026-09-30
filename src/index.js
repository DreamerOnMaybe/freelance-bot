import { Bot } from "grammy";
import "dotenv/config";

const bot = new Bot(process.env.BOT_TOKEN);

if (!process.env.BOT_TOKEN) {
  throw new Error("Критическая ошибка: BOT_TOKEN не задан в .env файле!");
}

bot.command("start", async (ctx) => {
    await ctx.reply("Привет! я живой бот, который поможет тебе найти работу на фрилансе. Чтобы узнать больше, напиши /help");
});

bot.on("message:text", async (ctx) => {
    await ctx.reply(`Вы написали: ${ctx.message.text}`);
});

bot.catch((err) => {
  console.error("Ошибка в работе бота:", err);
});

bot.start({
  onStart: (botInfo) => {
    console.log(`Бот @${botInfo.username} успешно запущен и слушает обновления!`);
  },
});