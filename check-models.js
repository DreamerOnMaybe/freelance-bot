import "dotenv/config";
import OpenAI from "openai";

const groq = new OpenAI({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
});

async function listModels() {
  try {
    const list = await groq.models.list();
    console.log("Доступные модели на твоем ключе Groq:\n");
    list.data.forEach((m) => console.log("- " + m.id));
  } catch (err) {
    console.error("Ошибка при получении списка моделей:", err.message);
  }
}

listModels();