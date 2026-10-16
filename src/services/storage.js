import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : fileURLToPath(new URL("../data", import.meta.url));

const SEEN_FILE = path.join(DATA_DIR, "seen.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

const MAX_SEEN = 300;
const MAX_ORDERS = 200;

let writeQueue = Promise.resolve();
function enqueue(task) {
  const run = writeQueue.then(task);
  writeQueue = run.catch(() => {});
  return run;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    console.error(`[storage] Не удалось прочитать ${path.basename(file)}:`, error.message);
    if (error instanceof SyntaxError) {
      try {
        await fs.rename(file, `${file}.corrupt-${Date.now()}`);
      } catch {}
    }
    return fallback;
  }
}

function writeJsonAtomic(file, data) {
  return enqueue(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tmp, file);
  });
}

let seenCache = null;

async function loadSeen() {
  if (seenCache) return seenCache;
  const data = await readJson(SEEN_FILE, []);
  seenCache = Array.isArray(data) ? data.map(String) : [];
  return seenCache;
}

/** @param {string} id */
export async function isSeen(id) {
  return (await loadSeen()).includes(String(id));
}

export async function markSeen(id) {
  const seen = await loadSeen();
  const key = String(id);
  if (seen.includes(key)) return;

  seen.push(key);
  if (seen.length > MAX_SEEN) seen.splice(0, seen.length - MAX_SEEN);

  try {
    await writeJsonAtomic(SEEN_FILE, seen);
  } catch (error) {
    console.error("[storage] Ошибка при записи seen.json:", error.message);
  }
}

let ordersCache = null;

async function loadOrders() {
  if (ordersCache) return ordersCache;
  const data = await readJson(ORDERS_FILE, []);
  ordersCache = new Map(
    Array.isArray(data) ? data.filter((o) => o?.id).map((o) => [String(o.id), o]) : []
  );
  return ordersCache;
}

export async function getOrder(id) {
  return (await loadOrders()).get(String(id)) ?? null;
}

export async function saveOrder(order) {
  const orders = await loadOrders();
  const key = String(order.id);

  orders.delete(key);
  orders.set(key, order);

  while (orders.size > MAX_ORDERS) {
    orders.delete(orders.keys().next().value);
  }

  try {
    await writeJsonAtomic(ORDERS_FILE, [...orders.values()]);
  } catch (error) {
    console.error("[storage] Ошибка при записи orders.json:", error.message);
  }
}