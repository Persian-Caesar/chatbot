import { Config } from "../config";

export class SentimentAnalyzer {
    private positiveWords: Set<string> = new Set();
    private negativeWords: Set<string> = new Set();
    private intensifiers: Set<string> = new Set();
    private negationWords: Set<string> = new Set();

    private dictionariesLoaded = false;

    constructor() {
        this.positiveWords = new Set(Config.dictionaries.positiveWords);
        this.negativeWords = new Set(Config.dictionaries.negativeWords);
        this.intensifiers = new Set(Config.dictionaries.intensifiers);
        this.negationWords = new Set(Config.dictionaries.negationWords);

        this.dictionariesLoaded = true;
    }

    async analyze(text: string): Promise<{ score: number; sentiment: "positive" | "neutral" | "negative" }> {
        if (!this.dictionariesLoaded) {
            await new Promise(resolve => setTimeout(resolve, 100));
            if (!this.dictionariesLoaded) {
                console.warn("لغت‌نامه‌ها هنوز بارگذاری نشده‌اند، استفاده از نسخه ساده");
                return this.simpleAnalyze(text);
            }
        }

        const tokens = this.tokenize(text);
        let score = 0;
        let negation = false;
        let intensifier = 1;
        let lastTokenWasIntensifier = false;

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            // بررسی کلمات نفی
            if (this.negationWords.has(token)) {
                negation = true;
                continue;
            }

            // بررسی تقویت کننده‌ها
            if (this.intensifiers.has(token)) {
                intensifier = 2;
                lastTokenWasIntensifier = true;
                continue;
            }

            // تحلیل کلمات مثبت
            if (this.positiveWords.has(token)) {
                const value = negation ? -1 * intensifier : 1 * intensifier;
                score += value;

                // ریست کردن حالت‌ها
                negation = false;
                intensifier = 1;
                lastTokenWasIntensifier = false;
            }
            // تحلیل کلمات منفی
            else if (this.negativeWords.has(token)) {
                const value = negation ? 1 * intensifier : -1 * intensifier;
                score += value;

                // ریست کردن حالت‌ها
                negation = false;
                intensifier = 1;
                lastTokenWasIntensifier = false;
            }
            // ریست تقویت کننده در صورت عدم تطابق
            else if (lastTokenWasIntensifier) {
                intensifier = 1;
                lastTokenWasIntensifier = false;
            }
        }

        // تشخیص احساس نهایی
        return {
            score,
            sentiment: score > 0 ? "positive" : score < 0 ? "negative" : "neutral"
        };
    }

    private simpleAnalyze(text: string): { score: number; sentiment: "positive" | "neutral" | "negative" } {
        const tokens = this.tokenize(text);
        let score = 0;

        tokens.forEach(token => {
            if (this.positiveWords.has(token)) score++;
            if (this.negativeWords.has(token)) score--;
        });

        return {
            score,
            sentiment: score > 0 ? "positive" : score < 0 ? "negative" : "neutral"
        };
    }

    private tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^\u0600-\u06FF\s]/g, "")
            .replace(/[.,!?;:]/g, " ")
            .split(/\s+/)
            .filter(token => token.length > 1);
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