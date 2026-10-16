import crypto from "node:crypto";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import { ConnectionTCPObfuscated } from "telegram/network/index.js";
import input from "input";
import { evaluateOrder, normalize } from "./config.js";

const CHANNELS_TO_WATCH = ["freelancetaverna", "normrabota", "distantsiya"];

// Переменные .env:
//   TG_DEBUG=1     — подробные логи (каждый пост из каналов + логи gramjs)
//   TG_AUTO_JOIN=1 — автоматически подписаться на каналы из списка
//   TG_CONNECTION=obfuscated — маскированное соединение (помогает, когда провайдер/сеть
//                              режет обычный протокол Telegram: TCP есть, а ответа нет)
//   TG_PORT=443|80  — порт подключения (по умолчанию 443)
//   TG_PROXY_HOST / TG_PROXY_PORT [/ TG_PROXY_TYPE=socks5|socks4, TG_PROXY_USER, TG_PROXY_PASS]
//                            — SOCKS-прокси; для MTProxy добавь TG_MTPROXY_SECRET
const DEBUG = process.env.TG_DEBUG === "1";
const AUTO_JOIN = process.env.TG_AUTO_JOIN === "1";
const CONNECTION_MODE = (process.env.TG_CONNECTION || "full").toLowerCase();
// Порт Telegram. По умолчанию 443 (его пропускает почти любой VPN/прокси); TG_PORT=80 вернёт порт 80
const TG_PORT = Number(process.env.TG_PORT) === 80 ? 80 : 443;

const HEARTBEAT_MS = 30 * 60 * 1000;

const log = (...args) => console.log("[TG Listener]", ...args);
const warn = (...args) => console.warn("[TG Listener]", ...args);

/**
 * Если промис не завершился за ms — отклоняем с понятным сообщением.
 * Нужен, чтобы подключение не "зависало молча".
 */
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: нет ответа за ${ms / 1000} сек`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Приводит ID канала к виду без "-100" и минуса */
function normalizeId(id) {
  return String(id ?? "")
    .replace(/^-100/, "")
    .replace(/^-/, "");
}

/**
 * ID на основе хэша текста: один и тот же заказ, репостнутый
 * в несколько каналов, получит одинаковый ID и не придёт дважды.
 */
function makeOrderId(text) {
  const hash = crypto
    .createHash("md5")
    .update(normalize(text).replace(/\s+/g, " ").trim().slice(0, 500))
    .digest("hex")
    .slice(0, 12);
  return `tg_${hash}`;
}

/** Собирает опции клиента из .env (тип соединения и прокси) */
function buildClientOptions() {
  const options = { connectionRetries: 5 };

  if (CONNECTION_MODE === "obfuscated") {
    options.connection = ConnectionTCPObfuscated;
  }

  const proxyHost = process.env.TG_PROXY_HOST?.trim();
  const proxyPort = Number(process.env.TG_PROXY_PORT);
  if (proxyHost && proxyPort) {
    const base = { ip: proxyHost, port: proxyPort, timeout: 10 };
    if (process.env.TG_PROXY_USER) base.username = process.env.TG_PROXY_USER;
    if (process.env.TG_PROXY_PASS) base.password = process.env.TG_PROXY_PASS;

    options.proxy = process.env.TG_MTPROXY_SECRET
      ? { ...base, MTProxy: true, secret: process.env.TG_MTPROXY_SECRET }
      : { ...base, socksType: process.env.TG_PROXY_TYPE === "socks4" ? 4 : 5 };
  }

  return options;
}

/** Человекочитаемая причина ошибки (в т.ч. FloodWait от Telegram) */
function describeError(err) {
  if (err?.seconds) return `Telegram просит подождать ${err.seconds} сек (flood-лимит). ${err.message}`;
  return err?.message || String(err);
}

/**
 * @param {(order: object) => Promise<unknown>} onNewOrderCallback
 * @returns {Promise<TelegramClient | null>} клиент (чтобы корректно отключить при остановке)
 */
export async function startTgListener(onNewOrderCallback) {
  const apiId = Number(process.env.TG_API_ID);
  const apiHash = process.env.TG_API_HASH;
  const sessionString = process.env.TG_SESSION?.trim();

  if (!apiId || !apiHash) {
    warn("TG_API_ID или TG_API_HASH не заданы. Пропуск запуска клиента.");
    return null;
  }

  const stringSession = new StringSession(sessionString || "");
  const clientOptions = buildClientOptions();
  const client = new TelegramClient(stringSession, apiId, apiHash, clientOptions);
  client.setLogLevel(DEBUG ? "info" : "error");

  // gramjs при подключении жёстко берёт порт 80 (useWSS=false) или 443 (useWSS=true), а в конструкторе
  // запрещает useWSS вместе с прокси. Поэтому включаем флаг уже ПОСЛЕ создания клиента: в Node он
  // влияет только на выбор порта 443/80 (WebSocket при этом не включается).
  client.useWSS = TG_PORT === 443;

  log(
    `Запуск. Соединение: ${CONNECTION_MODE}, порт: ${TG_PORT}, ` +
      `прокси: ${clientOptions.proxy ? `${clientOptions.proxy.ip}:${clientOptions.proxy.port}` : "нет"}, ` +
      `debug: ${DEBUG ? "да" : "нет"}`
  );

  // ───────────── Подключение ─────────────
  try {
    if (sessionString) {
      log("Подключаюсь к Telegram...");
      await withTimeout(client.connect(), 30_000, "connect");
      log("connect() завершился, проверяю, отвечает ли Telegram...");

      const isAuth = await withTimeout(client.checkAuthorization(), 20_000, "checkAuthorization");
      if (!isAuth) {
        console.error(
          "[TG Listener] ❌ Сессия в TG_SESSION недействительна! Очисти TG_SESSION в .env и перезапусти бота."
        );
        client.disconnect().catch(() => {});
        return null;
      }
      log("Клиент успешно подключен по сохраненной сессии!");
    } else {
      // Первый вход: интерактивный, без таймаута (ждём, пока ты введёшь код)
      await client.start({
        phoneNumber: async () => await input.text("Введи номер телефона: "),
        password: async () => await input.text("Введи 2FA пароль (если включен): "),
        phoneCode: async () => await input.text("Введи код подтверждения: "),
        onError: (err) => console.error("[TG Listener] Ошибка авторизации:", err),
      });
      console.log("\n⚠️ СКОПИРУЙ ЭТУ СТРОКУ В .env КАК TG_SESSION (никому её не показывай):\n");
      console.log(`TG_SESSION="${client.session.save()}"\n`);
    }
  } catch (err) {
    console.error(`[TG Listener] ❌ Не удалось подключиться: ${describeError(err)}`);
    console.error(
      "[TG Listener] Подсказка: если TCP-соединение есть, а ответа нет — сеть режет протокол Telegram. " +
        "Попробуй TG_CONNECTION=obfuscated, затем SOCKS/MTProxy (TG_PROXY_*) или другой VPN. " +
        "Node не использует системный прокси/VPN-расширения браузера."
    );
    client.disconnect().catch(() => {});
    return null;
  }

  // ───────────── Поиск каналов ─────────────
  const channelMap = new Map(); // cleanId -> username

  for (const username of CHANNELS_TO_WATCH) {
    try {
      log(`Ищу канал @${username}...`);
      const entity = await withTimeout(client.getEntity(username), 30_000, `getEntity @${username}`);

      // Без подписки Telegram не присылает обновления из канала
      if (AUTO_JOIN) {
        try {
          await withTimeout(
            client.invoke(new Api.channels.JoinChannel({ channel: entity })),
            20_000,
            `JoinChannel @${username}`
          );
        } catch (joinErr) {
          warn(`Не удалось подписаться на @${username}: ${describeError(joinErr)}`);
        }
      }

      const cleanId = normalizeId(entity.id);
      channelMap.set(cleanId, username);
      log(`Подключен канал: @${username} (ID: ${cleanId})`);

      // Самопроверка: читаем последний пост. Если он пришёл — доступ к каналу точно есть.
      try {
        const [last] = await withTimeout(
          client.getMessages(entity, { limit: 1 }),
          15_000,
          `getMessages @${username}`
        );
        const preview = (last?.message || "(без текста)").replace(/\s+/g, " ").slice(0, 60);
        log(`   ↳ последний пост в @${username}: "${preview}"`);
      } catch (readErr) {
        warn(`   ↳ не удалось прочитать последний пост @${username}: ${describeError(readErr)}`);
      }
    } catch (err) {
      warn(`Пропускаем @${username}: ${describeError(err)}`);
    }
  }

  if (channelMap.size === 0) {
    warn("Ни один канал не был подключен.");
    client.disconnect().catch(() => {});
    return null;
  }

  // ───────────── Обработка новых постов ─────────────
  const stats = { received: 0, matched: 0 };

  client.addEventHandler(async (event) => {
    try {
      const message = event.message;
      const text = message?.message; // сырой текст (или подпись к медиа)
      if (!text) return;

      const rawId = message.peerId?.channelId ?? message.chatId;
      const cleanChatId = normalizeId(rawId);
      const username = channelMap.get(cleanChatId);
      if (!username) return; // не из наших каналов

      stats.received++;

      // В постах из Telegram нет заголовка — считаем им первую строку
      const firstLine = text.split("\n")[0].slice(0, 120);
      const { ok, score } = evaluateOrder(firstLine, text);

      if (DEBUG) {
        log(`[Debug] @${username}: "${firstLine.slice(0, 60)}" → score ${score}${ok ? " ✅" : " (пропущен)"}`);
      }

      if (!ok) return;
      stats.matched++;

      const order = {
        id: makeOrderId(text),
        title: `Заказ из Telegram (@${username})`,
        description: text,
        link: `https://t.me/${username}/${message.id}`,
        source: "telegram",
      };

      log(`🎯 Найден заказ в @${username} (score ${score}). Передаю в бота...`);
      await onNewOrderCallback(order);
    } catch (handlerErr) {
      console.error("[TG Listener] Ошибка обработки сообщения:", handlerErr.message);
    }
  }, new NewMessage({})); // фильтр по каналам — внутри обработчика (gramjs 2.26.21 не принимает объекты в `chats`)

  // ───────────── Пульс: видно, что мониторинг жив ─────────────
  const heartbeat = setInterval(() => {
    log(
      `[Status] ${client.connected ? "подключен ✅" : "отключен ❌"} | ` +
        `постов получено: ${stats.received}, подошло под фильтр: ${stats.matched}`
    );
  }, HEARTBEAT_MS);
  heartbeat.unref(); // не мешает процессу завершиться

  log(`Активен мониторинг (${channelMap.size} каналов). Ожидание новых постов...`);
  return client;
}