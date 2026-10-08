import OpenAI from "openai";

const groq = new OpenAI({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
});

const MODEL_NAME = "qwen/qwen3.8-27b";

/**
 * @param {string} taskTitle — Заголовок заказа
 * @param {string} taskDescription — Описание заказа
 * @returns {Promise<string>}
 */
export async function generateProposal(taskTitle = "", taskDescription = "") {
  try {
    const promptText = `Заказ:\nЗаголовок: ${taskTitle}\n\nОписание:\n${taskDescription}`;

    const completion = await groq.chat.completions.create({
      model: MODEL_NAME,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: `Ты — опытный фронтенд-разработчик и специалист по верстке. 
Твоя задача — написать короткий, живой и убедительный отклик на заказ с биржи.

Правила:
1. Без штампов вроде "Здравствуйте, ознакомился с ТЗ". Сразу к делу.
2. Подчеркни понимание задачи и стек (чистый HTML5/CSS, Tailwind, JavaScript).
3. Задай 1-2 экспертных вопроса по деталям (Figma, адаптивность, анимации, дедлайн).
4. Объем: строго 3-5 предложений. Тон: вежливый, уверенный, партнерский.`,
        },
        {
          role: "user",
          content: promptText,
        },
      ],
      temperature: 0.7,
    });

    const reply = completion.choices?.[0]?.message?.content;

    if (!reply) {
      throw new Error("Пустой ответ от нейросети.");
    }

    return reply.trim();
  } catch (error) {
    console.error("Ошибка при обращении к Groq API:", error.message);
    throw error;
  }
}