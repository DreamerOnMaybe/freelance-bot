import Parser from 'rss-parser';

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