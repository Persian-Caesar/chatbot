"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SentimentAnalyzer = void 0;
class SentimentAnalyzer {
    POSITIVE_WORDS = new Set(["خوب", "عالی", "دوست دارم", "ممنون"]);
    NEGATIVE_WORDS = new Set(["بد", "زشت", "مشکل", "ناراحت"]);
    analyze(text) {
        const tokens = text.toLowerCase().split(/\s+/);
        let score = tokens.reduce((sum, token) => {
            if (this.POSITIVE_WORDS.has(token))
                return sum + 1;
            if (this.NEGATIVE_WORDS.has(token))
                return sum - 1;
            return sum;
        }, 0);
        return {
            score,
            sentiment: score > 0 ? "positive" : score < 0 ? "negative" : "neutral"
        };
    }
}
exports.SentimentAnalyzer = SentimentAnalyzer;
/**
 * @copyright
 * Code by Sobhan-SRZA (mr.sinre) | https://github.com/Sobhan-SRZA
 * Developed for Persian Caesar | https://github.com/Persian-Caesar | https://dsc.gg/persian-caesar
 *
 * If you encounter any issues or need assistance with this code,
 * please make sure to credit "Persian Caesar" in your documentation or communications.
 */ 
//# sourceMappingURL=SentimentAnalyzer.js.map