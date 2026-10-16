export const MIN_SCORE = 2;

export function normalize(text = "") {
  return String(text ?? "").toLowerCase().replace(/ё/g, "е");
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compileTerms({ stems = [], words = [] }) {
  const stemList = stems.map(normalize);
  const wordRe = words.length
    ? new RegExp(
        `(?<![\\p{L}\\d])(?:${words.map((w) => escapeRe(normalize(w))).join("|")})(?![\\p{L}\\d])`,
        "u"
      )
    : null;

  return (normalizedText) =>
    stemList.some((s) => normalizedText.includes(s)) ||
    (wordRe ? wordRe.test(normalizedText) : false);
}

const hasStrong = compileTerms({
  stems: [
    "верстк",
    "html",
    "css",
    "лендинг",
    "landing",
    "frontend",
    "front-end",
    "фронтенд",
    "javascript",
    "figma",
    "фигма",
    "тильда",
    "tilda",
    "сайт под ключ",
    "поправить сайт",
  ],
  words: ["js"],
});

const hasWeak = compileTerms({
  stems: ["правки", "доработк", "разработк", "сайт"],
});

const hasStopHard = compileTerms({
  stems: ["холодн", "копирайт", "дизайн интерьер", "битрикс", "звонки"],
  words: ["1с", "1c"],
});

const hasStopSoft = compileTerms({
  stems: ["продаж", "менеджер"],
});

/**
 * @param {string} title
 * @param {string} description
 * @returns {{ ok: boolean, score: number }}
 */
export function evaluateOrder(title = "", description = "") {
  const t = normalize(title);
  const d = normalize(description);

  if (hasStopHard(t)) return { ok: false, score: -100 };

  let score = 0;

  if (hasStrong(t)) score += 4;
  else if (hasStrong(d)) score += 3;

  if (hasWeak(t)) score += 2;
  else if (hasWeak(d)) score += 1;

  if (hasStopHard(d)) score -= 2;

  if (hasStopSoft(t)) score -= 2;
  else if (hasStopSoft(d)) score -= 1;

  return { ok: score >= MIN_SCORE, score };
}