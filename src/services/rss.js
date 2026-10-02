import Parser from 'rss-parser';

const KEYWORDS =[
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

const parser = new Parser();

const FEED_URL = "https://www.fl.ru/rss/all.xml";

export async function fetchOrders() {
    try {
        const feed = await parser.parseURL(FEED_URL);

        const orders = feed.items.map((item) => {
            return {
                id: item.guid || item.link,
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
        const isFresh = (now - orderTime) < TWO_HOURS_MS;

        if (!isFresh) {
            return false;
        }

        const textToSearch = `${order.title} ${order.description}`.toLowerCase();
        return KEYWORDS.some((keyword) => textToSearch.includes(keyword.toLowerCase()))
    })
}