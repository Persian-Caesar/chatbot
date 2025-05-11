export class SentimentAnalyzer {
 private POSITIVE_WORDS = new Set(["خوب", "عالی", "دوست دارم", "ممنون"]);
 private NEGATIVE_WORDS = new Set(["بد", "زشت", "مشکل", "ناراحت"]);

 analyze(text: string): { score: number; sentiment: "positive" | "neutral" | "negative" } {
  const tokens = text.toLowerCase().split(/\s+/);

  let score = tokens.reduce((sum, token) => {
   if (this.POSITIVE_WORDS.has(token)) return sum + 1;
   if (this.NEGATIVE_WORDS.has(token)) return sum - 1;
   return sum;
  }, 0);

  return {
   score,
   sentiment: score > 0 ? "positive" : score < 0 ? "negative" : "neutral"
  };
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