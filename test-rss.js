// test-rss.js
import { fetchOrders } from "./src/services/rss.js";

async function test() {
  console.log("Запрашиваю заказы с биржи...");
  const orders = await fetchOrders();

  console.log(`Получено заказов: ${orders.length}`);

  if (orders.length > 0) {
    console.log("\n--- Самый свежий заказ ---");
    console.log("Заголовок:", orders[0].title);
    console.log("Ссылка:", orders[0].link);
    console.log("Описание:", orders[0].description.slice(0, 150) + "...");
  }
}

test();