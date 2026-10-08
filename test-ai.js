import "dotenv/config";
import { generateProposal } from "./src/services/ai.js";

async function test() {
    console.log("Отправляю тестовый запрос в нейросеть...")
    try {
        const proposal = await generateProposal(
            "Сверстать лендинг по макету из Figma",
            "Нужен адаптивный лендинг (HTML5, Tailwind или чистый CSS). 5 экранов, форма заявки, табы с переключением тарифов. Чистый код без лишних библиотек."
        )
        console.log("\n=== Готовый отклик от ИИ ===\n")
        console.log(proposal)
    } catch (error) {
        console.error("Тест упал с ошибкой:", error);
    }
}

test ()
