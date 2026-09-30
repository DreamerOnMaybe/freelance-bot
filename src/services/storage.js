import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve("data");
const FILE_PATH = path.join(DATA_DIR, "seen.json");

async function ensureDirectoryExists() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true});
    } catch (error) {
        console.error("Ошибка при создании папки data:", error.message);
    }
}

/**
 * Читает массив сохраненных ID из файла
 * @returns {Promise<string[]>}
 */ 

export async function getSeenIds() {
    await ensureDirectoryExists();
    try {
        const data = await fs.readFile(FILE_PATH, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }
        console.error("Ошибка при чтении файла seen.json:", error.message);
        return[]
    }
}

/**
 * Добавляет новые ID и сохраняет их в seen.json
 * @param {string[]} ids
 */

export async function saveSeenIds(ids) {
    await ensureDirectoryExists();
    try {
        const sliced = ids.slice(-100)
        await fs.writeFile(FILE_PATH, JSON.stringify(sliced, null, 2), "utf-8")
    } catch (error) {
        console.error("Ошибка при записи файла seen.json:", error.message);
    }
}