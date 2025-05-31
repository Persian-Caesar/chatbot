import { Config } from "../config";

export class SearchService {
    private readonly SERP_API_KEY = process.env.SERP_API_KEY || "";
    private readonly WIKI_API = "https://fa.wikipedia.org/w/api.php";
    private positiveWords: Set<string>;
    private negativeWords: Set<string>;
    private questionWords: Set<string>;
    private cartoonCharacters: Set<string>;
    private toysList: Set<string>;
    private stopWords: Set<string>;

    constructor() {
        if (!this.SERP_API_KEY) {
            console.warn("کلید SerpAPI تنظیم نشده! جستجوی وب محدود خواهد بود.");
        }
        this.positiveWords = new Set(Config.dictionaries.positiveWords || []);
        this.negativeWords = new Set(Config.dictionaries.negativeWords || []);
        this.questionWords = new Set(Config.dictionaries.questionWords || []);
        this.cartoonCharacters = new Set(Config.dictionaries.cartoonCharacters || []);
        this.toysList = new Set(Config.dictionaries.toysList || []);
        this.stopWords = new Set([
            "و", "در", "به", "که", "از", "را", "با", "هم", "برای", "این", "آن"
        ]);
    }

    async searchWeb(query: string): Promise<string[]> {
        try {
            const tokens = this.tokenize(query);
            const results: string[] = [];

            // تشخیص سؤال
            const isQuestion = tokens.some(token => this.questionWords.has(token));

            // برای سؤال‌های کوتاه یا خاص، مستقیم به پاسخ محلی برو
            if (tokens.length < 3 || query.toLowerCase().includes("اسمت چیه")) {
                const localResults = this.searchLocal(tokens);
                if (localResults.length > 0) {
                    return localResults;
                }
                return [this.getFallbackResponse()];
            }

            // جستجو در SerpAPI (گوگل)
            const serpResults = await this.searchSerpAPI(query);
            if (serpResults.length > 0) {
                results.push(...this.formatResults(serpResults, isQuestion, tokens, "SerpAPI"));
            }

            // جستجو در ویکی‌پدیا
            const wikiResults = await this.searchWikipedia(query);
            if (wikiResults.length > 0) {
                results.push(...this.formatResults(wikiResults, isQuestion, tokens, "Wikipedia"));
            }

            // اضافه کردن پاسخ‌های محلی از Config
            const localResults = this.searchLocal(tokens);
            if (localResults.length > 0) {
                results.push(...localResults);
            }

            // اضافه کردن جوک یا معما برای جذابیت
            if (isQuestion && Math.random() < 0.3) {
                const extra = this.getJokeOrMystery();
                if (extra) results.push(extra);
            }

            // اگر هیچ نتیجه‌ای نبود
            if (results.length === 0) {
                results.push(this.getFallbackResponse());
            }

            // حذف نتایج تکراری و کوتاه
            return [...new Set(results)]
                .filter(text => text && text.length > 10)
                .slice(0, 5);
        } catch (error) {
            console.error("خطا در جستجوی وب:", error);
            return [this.getFallbackResponse()];
        }
    }

    private async searchSerpAPI(query: string): Promise<{ text: string; url: string }[]> {
        if (!this.SERP_API_KEY) return [];

        try {
            const params = new URLSearchParams({
                q: `${query} کودکانه کارتون`, // فیلتر قوی‌تر کودکانه
                api_key: this.SERP_API_KEY,
                hl: "fa",
                gl: "ir",
                num: "5"
            });
            const res = await fetch(`https://serpapi.com/search?${params}`);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const data = await res.json();

            const results: { text: string; url: string }[] = [];
            if (data.organic_results) {
                for (const item of data.organic_results) {
                    if (item.snippet && item.link) {
                        results.push({ text: item.snippet, url: item.link });
                    }
                }
            }
            return results;
        } catch (error) {
            console.error("خطا در جستجوی SerpAPI:", error);
            return [];
        }
    }

    private async searchWikipedia(query: string): Promise<{ text: string; url: string }[]> {
        try {
            const params = new URLSearchParams({
                action: "query",
                list: "search",
                srsearch: `${query} کودکانه`, // فیلتر کودکانه
                format: "json",
                utf8: "",
                srlimit: "3"
            });
            const res = await fetch(`${this.WIKI_API}?${params}`);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const data = await res.json();

            const results: { text: string; url: string }[] = [];
            if (data.query?.search) {
                for (const item of data.query.search) {
                    if (item.snippet) {
                        const cleanText = this.cleanSnippet(item.snippet);
                        const url = `https://fa.wikipedia.org/wiki/${encodeURIComponent(item.title)}`;
                        results.push({ text: cleanText, url });
                    }
                }
            }
            return results;
        } catch (error) {
            console.error("خطا در جستجوی ویکی‌پدیا:", error);
            return [];
        }
    }

    private searchLocal(tokens: string[]): string[] {
        const results: string[] = [];
        if (!Config.keywords) return results;
        for (const [topic, keywords] of Object.entries(Config.keywords)) {
            if (tokens.some(token => keywords.includes(token))) {
                const responses = Config.topicResponses?.[topic as keyof typeof Config.topicResponses] || [];
                if (responses.length > 0) {
                    results.push(responses[0]);
                }
            }
        }
        for (const token of tokens) {
            if (this.cartoonCharacters.has(token)) {
                results.push(`وای، ${token} خیلی باحاله! تو کدوم کارتونشو دوست داری؟ 😄`);
            } else if (this.toysList.has(token)) {
                results.push(`اووه، ${token} خیلی خوبه! باهاش چی بازی می‌کنی؟ 🧸`);
            }
        }
        return results;
    }

    private formatResults(items: { text: string; url: string }[], isQuestion: boolean, tokens: string[], source: string): string[] {
        const results: string[] = [];
        const positiveCount = tokens.filter(t => this.positiveWords.has(t)).length;
        const negativeCount = tokens.filter(t => this.negativeWords.has(t)).length;
        const childFriendlyScore = tokens.filter(t => this.cartoonCharacters.has(t) || this.toysList.has(t)).length;

        for (const item of items) {
            // فیلتر نتایج نامرتبط
            if (item.text.includes("مرگ") || item.text.includes("زندانی") || item.text.includes("جنگ")) {
                continue; // حذف نتایج نامناسب
            }

            let response = isQuestion ? "وای، یه چیز باحال پیدا کردم! 😊 " : "هورا! اینو نگاه کن! 🎉 ";
            response += this.rephraseChildlike(item.text);
            response += ` اگه دوست داشتی بیشتر بخونی، اینجا برو: ${item.url}`;

            if (positiveCount > negativeCount) {
                response += " این خیلی شاد و خوبه! 😄";
            } else if (negativeCount > positiveCount) {
                response += " اووه، یه کم غمگینه... بیا یه چیز شاد پیدا کنیم! 😔";
            }

            if (childFriendlyScore > 0) {
                response += " این خیلی برای بچه‌ها باحاله! 🧸";
            }

            results.push(response);
        }
        return results;
    }

    private rephraseChildlike(text: string): string {
        let result = text
            .replace(/است/g, "هست")
            .replace(/می‌باشد/g, "هست")
            .replace(/بسیار/g, "خیلی")
            .replace(/همچنین/g, "مثلاً")
            .replace(/بنابراین/g, "واسه همین")
            .replace(/\s+/g, " ")
            .trim();

        if (this.positiveWords.size > 0 && Math.random() < 0.3) {
            const positiveWord = Array.from(this.positiveWords)[Math.floor(Math.random() * this.positiveWords.size)];
            result = `${result} وای، این ${positiveWord}ه! 😊`;
        }
        return result;
    }

    private cleanSnippet(snippet: string): string {
        return snippet
            .replace(/<span class="searchmatch">|<\/span>/g, "")
            .replace(/"/g, "\"")
            .replace(/'/g, "'")
            .replace(/[^\u0600-\u06FF\s.,!?0-9]/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    private tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^\u0600-\u06FF\s]/g, "")
            .replace(/[.,!?;:؟]/g, " ")
            .split(/\s+/)
            .filter(token => token.length > 1 && !this.stopWords.has(token));
    }

    private getFallbackResponse(): string {
        if (!Config.fallbackResponses || Config.fallbackResponses.length === 0) {
            return "وای، اینو نفهمیدم! یه جور دیگه بگو 😊";
        }
        return Config.fallbackResponses[Math.floor(Math.random() * Config.fallbackResponses.length)];
    }

    private getJokeOrMystery(): string | null {
        const options = [...(Config.dictionaries?.jokes || []), ...(Config.dictionaries?.mysteries || [])];
        if (options.length > 0) {
            return options[Math.floor(Math.random() * options.length)];
        }
        return null;
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