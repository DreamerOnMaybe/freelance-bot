import crypto from "node:crypto";
import Parser from "rss-parser";
import { evaluateOrder } from "./config.js";

const FEED_URL = "https://www.fl.ru/rss/all.xml";
const MAX_AGE_MS = 30 * 60 * 1000; // берём только заказы свежее 30 минут

const parser = new Parser({
  timeout: 15_000,
  headers: { "User-Agent": "Mozilla/5.0 (compatible; FreelanceBot/1.0)" },
});

/**
 * Стабильный ID заказа. Раньше фоллбэк `Date.now()` давал новый ID
 * при каждой проверке и приводил к бесконечным дублям.
 */
function extractId(item) {
  const link = item.link || "";
  const match = link.match(/\/projects\/(\d+)\//);
  if (match) return match[1];

  const source = item.guid || link;
  if (!source) return null;
  return "fl_" + crypto.createHash("md5").update(source).digest("hex").slice(0, 12);
}

export async function fetchOrders() {
  try {
    const feed = await parser.parseURL(FEED_URL);

    return feed.items
      .map((item) => {
        const id = extractId(item);
        if (!id) return null;

        return {
          id,
          title: item.title || "Без названия",
          link: item.link,
          description: item.contentSnippet || item.content || "Без описания",
          pubDate: item.isoDate || item.pubDate,
          source: "fl.ru",
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.error("Ошибка при получении RSS-ленты:", error.message);
    return [];
  }
}

export function filterOrders(orders) {
  const now = Date.now();

  // Диагностика: на бирже заказы появляются постоянно, поэтому "самый свежий" обычно моложе часа.
  // Если здесь сотни минут — скорее всего, часы компьютера неверны.
  const times = orders.map((o) => new Date(o.pubDate).getTime()).filter((t) => !Number.isNaN(t));
  if (times.length) {
    const newestMin = Math.round((now - Math.max(...times)) / 60_000);
    const fresh = times.filter((t) => now - t <= MAX_AGE_MS).length;
    console.log(
      `[RSS] в ленте: ${orders.length}, свежих (≤30 мин): ${fresh}, самый свежий: ${newestMin} мин назад`
    );
    if (newestMin > 120 || newestMin < -5) {
      console.warn("[RSS] ⚠️ Подозрительный возраст заказов — проверь, что часы Windows идут верно.");
    }
  }

  return orders.filter((order) => {
    const orderTime = new Date(order.pubDate).getTime();

    // Невалидная дата раньше проходила фильтр (NaN > x === false)
    if (Number.isNaN(orderTime)) return false;
    if (now - orderTime > MAX_AGE_MS) return false;

    return evaluateOrder(order.title, order.description).ok;
  });
}