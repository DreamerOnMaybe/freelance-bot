import OpenAI from "openai";

// Модель можно менять через .env без правки кода. Список доступных: GET https://api.groq.com/openai/v1/models
const MODEL_NAME = process.env.GROQ_MODEL || "qwen/qwen3-32b";
const MAX_DESCRIPTION_CHARS = 3000;

let client = null;

// Ленивая инициализация: не зависит от порядка импортов и dotenv
function getClient() {
  if (!client) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY не задан в .env");
    }
    client = new OpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
      timeout: 20_000,
      maxRetries: 2,
    });
  }
  return client;
}

const SYSTEM_PROMPT = `Ты — опытный фронтенд-разработчик и специалист по верстке.
Твоя задача — написать короткий, живой и убедительный отклик на заказ с биржи.

Правила:
1. Без штампов вроде "Здравствуйте, ознакомился с ТЗ". Сразу к делу.
2. Подчеркни понимание задачи и стек (чистый HTML5/CSS, Tailwind, JavaScript).
3. Задай 1-2 экспертных вопроса по деталям (Figma, адаптивность, анимации, дедлайн).
4. Объем: строго 3-5 предложений. Тон: вежливый, уверенный, партнерский.
5. Описание может быть неполным — опирайся только на то что есть, не придумывай детали которых нет.
6. Пиши обычным текстом: без markdown, без списков, без эмодзи. Язык ответа — язык заказа.`;

/**
 * @param {string} taskTitle — Заголовок заказа
 * @param {string} taskDescription — Описание заказа
 * @returns {Promise<string>}
 */
export async function generateProposal(taskTitle = "", taskDescription = "") {
  try {
    const description =
      (taskDescription ?? "").trim().slice(0, MAX_DESCRIPTION_CHARS) || "Описание не указано";
    const promptText = `Заказ:\nЗаголовок: ${taskTitle}\n\nОписание:\n${description}`;

    const params = {
      model: MODEL_NAME,
      max_tokens: 600,
      temperature: 0.6,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: promptText },
      ],
    };

    // Qwen3 — reasoning-модель: отключаем «размышления», иначе они съедают токены
    if (/qwen3/i.test(MODEL_NAME)) {
      params.reasoning_effort = "none";
    }

    const completion = await getClient().chat.completions.create(params);

    const raw = completion.choices?.[0]?.message?.content ?? "";
    // Страховка: вырезаем <think>…</think>, если модель всё же их вернула
    const reply = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    if (!reply) {
      throw new Error("Пустой ответ от нейросети.");
    }

    return reply;
  } catch (error) {
    console.error("Ошибка при обращении к Groq API:", error.message);
    throw error;
  }
}