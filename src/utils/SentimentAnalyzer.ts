import { Config } from "../config";

export class SentimentAnalyzer {
    private positiveWords: Set<string>;
    private negativeWords: Set<string>;
    private questionWords: Set<string>;
    private stopWords: Set<string>;

    constructor() {
        this.positiveWords = new Set(Config.dictionaries.positiveWords || []);
        this.negativeWords = new Set(Config.dictionaries.negativeWords || []);
        this.questionWords = new Set(Config.dictionaries.questionWords || []);
        this.stopWords = new Set([
            "و", "در", "به", "که", "از", "را", "با", "هم", "برای", "این", "آن"
        ]);
    }

    async analyze(text: string): Promise<{ score: number; sentiment: "positive" | "negative" | "neutral" | "question" }> {
        const tokens = this.tokenize(text);
        let positiveScore = 0;
        let negativeScore = 0;
        let questionScore = 0;

        tokens.forEach(token => {
            let weight = 1;
            // وزن‌دهی به کلمات قوی‌تر
            if (["عالی", "محشر", "شگفت‌انگیز", "بهترین"].includes(token)) weight = 2;
            if (["غمگین", "ناراحت", "داغون", "ترسناک"].includes(token)) weight = 2;

            if (this.positiveWords.has(token)) positiveScore += weight;
            if (this.negativeWords.has(token)) negativeScore += weight;
            if (this.questionWords.has(token)) questionScore += 1;
        });

        const totalScore = positiveScore - negativeScore;

        if (questionScore > 0) {
            return { score: questionScore, sentiment: "question" };
        } else if (totalScore > 0) {
            return { score: totalScore, sentiment: "positive" };
        } else if (totalScore < 0) {
            return { score: totalScore, sentiment: "negative" };
        } else {
            return { score: 0, sentiment: "neutral" };
        }
    }

    private tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^\u0600-\u06FF\s]/g, "") // فقط حروف فارسی
            .replace(/[.,!?;:؟]/g, " ") // حذف علائم نگارشی
            .split(/\s+/)
            .filter(token => token.length > 1 && !this.stopWords.has(token));
    }
}
/**
 * @copyright
 * Code by Sobhan-SRZA (mr.sinre) | https://github.com/Sobhan-SRZA
 * Developed for Persian Caesar | https://github.com/Persian-Caesar | https://dsc.gg/persian-caesar
 *
 * If you encounter any issues or need assistance with this code,
 * please make sure to credit "Persian Caesar" in your documentation or communications.
 */