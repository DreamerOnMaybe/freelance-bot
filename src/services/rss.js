import Parser from 'rss-parser';

const parser = new Parser();
const FEED_URL = "https://www.fl.ru/rss/all.xml";

const KEYWORDS = [
    "верстк",
    "вёрстк",
    "правки",
    "разработка",
    "доработка",
    "html",
    "css",
    "лендинг",
    "landing",
    "frontend",
    "frontend",
    "javascript",
    "js",
    "сайт под ключ",
    "сайт",
]

const STOP_WORDS = [
    "звонки",
    "холодн",
    "продаж",
    "менеджер",
    "копирайт",
    "дизайн интерьер",
];

function extractShortId(link = "") {
    const match = link.match(/\/projects\/(\d+)\//)
    if (match) {
        return match[1]
    }
    return link.slice(-20).replace(/[^a-zA-Z0-9]/g, "")
}

export async function fetchOrders() {
    try {
        const feed = await parser.parseURL(FEED_URL);

        const orders = feed.items.map((item) => {
            return {
                id: extractShortId(item.link) || String(Date.now()),
                title: item.title,
                link: item.link,
                description: item.contentSnippet || item.content || "Без описания",
                pubDate: item.pubDate,
            }
        })
        return orders;
    } catch (error) {
        console.error("Ошибка при получении RSS-ленты:", error);
        return [];
    }
}

export function filterOrders(orders) {
    const TWO_HOURS_MS = 5 * 60 * 60 * 1000;
    const now = new Date();

    return orders.filter((order) => {

        const orderTime = new Date(order.pubDate).getTime();
        if (now - orderTime > TWO_HOURS_MS) {
            return false;
        }

        const textToSearch = `${order.title} ${order.description}`.toLowerCase();

        const hasStopWord = STOP_WORDS.some((word) => textToSearch.includes(word));
        if (hasStopWord) {
            return false;
        }

        return KEYWORDS.some((keyword) => textToSearch.includes(keyword.toLowerCase()));
    });
}