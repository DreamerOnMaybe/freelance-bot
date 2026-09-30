// test-rss.js
import { fetchOrders, filterOrders } from "./src/services/rss.js";

async function test() {
  console.log("Запрашиваю заказы с биржи...");
  const orders = await fetchOrders();
  console.log(`Всего заказов: ${orders.length}`);

  const matchedOrders = filterOrders(orders);
  console.log(`Подходящих заказов под наш стек: ${matchedOrders.length}`);

  if (matchedOrders.length > 0) {
    console.log("\n--- Первый отфильтрованный заказ ---");
    console.log("Заголовок:", matchedOrders[0].title);
    console.log("Ссылка:", matchedOrders[0].link);
  }
}

test();