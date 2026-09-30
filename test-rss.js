// test-rss.js
import { fetchOrders, filterOrders } from "./src/services/rss.js";
import { getSeenIds, saveSeenIds } from "./src/services/storage.js";

async function test() {
  console.log("1. Читаем уже просмотренные ID из файла...");
  const seenIds = await getSeenIds();
  console.log(`Уже в базе ID: ${seenIds.length}`);

  console.log("\n2. Запрашиваем свежие заказы с биржи...");
  const allOrders = await fetchOrders();
  const matchedOrders = filterOrders(allOrders);
  console.log(`Подходящих под стек: ${matchedOrders.length}`);

  const newOrders = matchedOrders.filter((order) => !seenIds.includes(order.id));
  console.log(`Из них действительно НОВЫХ (не отправленных ранее): ${newOrders.length}`);

  if (newOrders.length > 0) {
    console.log("\n--- Будем отправлять этот заказ ---");
    console.log("Заголовок:", newOrders[0].title);

    const newIds = newOrders.map((order) => order.id);
    await saveSeenIds([...seenIds, ...newIds]);
    console.log("\n-> Новые заказы успешно сохранены в seen.json!");
  } else {
    console.log("\nНовых заказов нет, всё уже было просмотрено.");
  }
}

test();