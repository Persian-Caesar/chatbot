import {
  MessageRecord,
  Triple
} from "../types";
import { Config } from "../config";
import Database from "../utils/Database";

export class ChatBot {
  private shortTermMemory: string[] = [];
  private maxMemorySize = 5;
  private contextKey: string;
  private kgKey: string;
  private usedJokesKey: string;
  private lastTopic: string | null = null;

  private stopWords = new Set<string>([
    "و", "در", "به", "که", "از", "را", "با", "هم", "برای", "این", "آن"
  ]);
  private negativeWords = new Set<string>([
    "کسخل", "کسشر", "بی‌شعور", "احمق", "کثافت", "کلخل", "کسخلی", "کلخی"
  ]);
  private sensitiveWords = new Set<string>(["سکس", "جنسی", "بزرگسال", "sex"]);
  private followUpPatterns = [
    { regex: /من به ([\w\s]+) رفتم/, category: "location" },
    { regex: /من ([\w\s]+) کردم/, category: "activity" },
    { regex: /من ([\w\s]+) (?:را|رو) دوست دارم/, category: "interest" },
    { regex: /من ([\w\s]+) (?:هستم|هستش)/, category: "name" }
  ];
  private forbiddenQuestions = [
    "اسمت چیه", "اسم تو چیه", "تو کی هستی", "اسمت چی هست", "اسم تو چی هست"
  ];

  constructor(private db: Database, channelId = "global", private system_prompt = Config.systemPrompt) {
    this.contextKey = `chat:${channelId}`;
    this.kgKey = `kg:${channelId}`;
    this.usedJokesKey = `usedJokes:${channelId}`;
    this.initSystem();
  }

  private async initSystem() {
    try {
      if (!(await this.db.has(`${this.contextKey}.0`))) {
        await this.db.push(this.contextKey, {
          role: "system",
          content: this.system_prompt
        } as MessageRecord);
      }
      if (!(await this.db.has(this.usedJokesKey))) {
        await this.db.set(this.usedJokesKey, []);
      }
    } catch (error) {
      console.error("Init error:", error);
    }
  }

  private async rememberContext(text: string) {
    this.shortTermMemory.push(text);
    if (this.shortTermMemory.length > this.maxMemorySize) {
      this.shortTermMemory.shift();
    }
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[.،؛!?:؟]/g, '')
      .split(/[\s\u200c]+/)
      .filter(w => w && w.length > 1 && !this.stopWords.has(w));
  }

  private isGibberish(text: string): boolean {
    const clean = text.trim().toLowerCase();
    if (clean.length < 3) return true;
    const tokens = this.tokenize(clean);
    if (tokens.length === 0) return true;
    const validWords = tokens.filter(t =>
      Config.dictionaries?.positiveWords?.includes(t) ||
      Config.dictionaries?.negativeWords?.includes(t) ||
      Config.dictionaries?.cartoonCharacters?.includes(t) ||
      Config.dictionaries?.toysList?.includes(t) ||
      Config.dictionaries?.questionWords?.includes(t) ||
      /[آ-ی]/.test(t)
    );
    return validWords.length === 0;
  }

  private analyzeSentiment(text: string): { sentiment: 'positive' | 'negative' | 'neutral' | 'question', score: number } {
    const tokens = this.tokenize(text);
    let score = 0;
    for (const token of tokens) {
      if (Config.dictionaries?.positiveWords?.includes(token)) score += 1;
      if (Config.dictionaries?.negativeWords?.includes(token)) score -= 1;
    }
    if (tokens.some(t => Config.dictionaries?.questionWords?.includes(t)) || text.includes('؟')) {
      return { sentiment: 'question', score: 0 };
    }
    if (score > 0) return { sentiment: 'positive', score };
    if (score < 0) return { sentiment: 'negative', score };
    return { sentiment: 'neutral', score: 0 };
  }

  private async searchWeb(query: string): Promise<string> {
    const tokens = this.tokenize(query);
    const keywords = Config.keywords || {};
    for (const [topic, words] of Object.entries(keywords)) {
      if (tokens.some(t => words.includes(t))) {
        const responses = Config.topicResponses?.[topic as keyof typeof Config.topicResponses] || [];
        return responses[Math.floor(Math.random() * responses.length)] || "وای، درباره این چیزی نمی‌دونم! 😅 یه چیز دیگه بگو!";
      }
    }
    return "سؤالت یه کم پیچیده‌ست! 😅 یه چیز دیگه بپرس!";
  }

  private addNaturalPauses(text: string): string {
    const words = text.split(' ');
    if (words.length > 6) {
      const insertAt = Math.floor(words.length / 2);
      words.splice(insertAt, 0, '...');
    }
    return words.join(' ');
  }

  private async reply(text: string): Promise<string> {
    const finalText = this.addNaturalPauses(text);
    try {
      await this.db.push(this.contextKey, { role: "assistant", content: finalText });
    } catch (error) {
      console.error("Reply error:", error);
    }
    this.rememberContext(finalText);
    return finalText;
  }

  public async reset() {
    try {
      await this.db.delete(this.contextKey);
      await this.db.delete(this.kgKey);
      await this.db.delete(this.usedJokesKey);
      this.shortTermMemory = [];
      this.lastTopic = null;
      await this.initSystem();
    } catch (error) {
      console.error("Reset error:", error);
    }
  }

  private detectTopic(text: string): string | null {
    if (!Config.keywords) return null;
    const tokens = this.tokenize(text);
    for (const [topic, keywords] of Object.entries(Config.keywords)) {
      if (tokens.some(token => keywords.includes(token))) {
        return topic;
      }
    }
    return null;
  }

  private getFollowUpResponse(input: string): string | null {
    for (const pattern of this.followUpPatterns) {
      const match = input.match(pattern.regex);
      if (match) {
        const responses = Config.followUpResponses?.[pattern.category as keyof typeof Config.followUpResponses] || [
          `وای، ${pattern.category === "name" ? `${match[1]}! چه اسم باحالی!` : match[1]}؟ بیشتر بگو! 😊`
        ];
        return responses[Math.floor(Math.random() * responses.length)];
      }
    }
    return null;
  }

  private async getContextHistory(limit: number = 10): Promise<MessageRecord[]> {
    try {
      const history = (await this.db.get(this.contextKey) as MessageRecord[] | false) || [];
      if (!Array.isArray(history)) return [];
      return history.slice(-limit).filter(m => m.role === "user" || m.role === "assistant");
    } catch (error) {
      console.error("Get history error:", error);
      return [];
    }
  }

  public async handleMessage(text: string): Promise<string> {
    const clean = text.trim().toLowerCase();
    const tokens = this.tokenize(clean);
    try {
      await this.db.push(this.contextKey, { role: "user", content: clean });
      await this.addKG(clean);
    } catch (error) {
      console.error("Handle message error:", error);
    }

    // 1. ورودی نامفهوم
    if (this.isGibberish(clean)) {
      return this.reply(Config.fallbackResponses[Math.floor(Math.random() * Config.fallbackResponses.length)]);
    }

    // 2. کلمات حساس
    if (tokens.some(token => this.sensitiveWords.has(token))) {
      return this.reply("اووه، این حرفا برای بچه‌ها نیست! 😅 بیا درباره کارتون یا اسباب‌بازی گپ بزنیم! 🧸");
    }

    // 3. توهین
    if (tokens.some(token => this.negativeWords.has(token))) {
      return this.reply("اووه، این حرفا چیه؟ بیا یه چیز باحال بگیم! 😄");
    }

    // 4. درخواست جوک
    if (clean.includes("جوک") || clean.includes("بخند")) {
      const joke = await this.getJoke();
      return this.reply(joke);
    }

    // 5. سؤال‌های ممنوعه
    if (this.forbiddenQuestions.some(q => clean.includes(q))) {
      return this.reply("وای، این سؤال یه کم عجیبه! 😅 یه چیز دیگه بپرس!");
    }

    // 6. سؤال درباره اسم کاربر
    if (clean.includes("اسم من چیه")) {
      const kg = await this.queryKG("user", "user");
      const nameEntry = kg.find(t => t.subject === "user" && t.predicate === "است");
      if (nameEntry) {
        return this.reply(`اسم تو ${nameEntry.object}! 😄 حالا چی دوست داری بگیم؟`);
      }
      const history = await this.getContextHistory();
      const nameMatch = history.reverse().find(m => m.content.match(/من ([\w\s]+) (?:هستم|هستش)/));
      if (nameMatch) {
        const name = nameMatch.content.match(/من ([\w\s]+) (?:هستم|هستش)/)?.[1];
        if (name) {
          await this.addKG(`من ${name} هستم`);
          return this.reply(`اسم تو ${name}! 😄 حالا چی دوست داری بگیم؟`);
        }
      }
      return this.reply("فکر کنم هنوز اسمت رو بهم نگفتی! 😊 اسمت چیه؟");
    }

    // 7. ادامه مکالمه
    if (this.lastTopic && (clean.includes("اره") || clean.includes("بگو") || clean.includes("بیشتر"))) {
      if (this.lastTopic === "creator") {
        this.lastTopic = null;
        return this.reply("شایان و دوستاش یه تیم باحالن که منو ساختن! کلی کد نوشتن تا من بتونم باهات گپ بزنم. 😎 تو درباره چی دوست داری حرف بزنیم؟");
      }
      const history = await this.getContextHistory();
      const lastResponse = history.reverse().find(m => m.role === "assistant");
      if (lastResponse) {
        const topic = this.detectTopic(lastResponse.content);
        if (topic && Config.topicResponses?.[topic as keyof typeof Config.topicResponses]) {
          const responses = Config.topicResponses[topic as keyof typeof Config.topicResponses];
          return this.reply(responses[Math.floor(Math.random() * responses.length)]);
        }
      }
    }

    // 8. پاسخ‌های موضوعی
    const topic = this.detectTopic(clean);
    if (topic && Config.topicResponses?.[topic as keyof typeof Config.topicResponses]) {
      const responses = Config.topicResponses[topic as keyof typeof Config.topicResponses];
      return this.reply(responses[Math.floor(Math.random() * responses.length)]);
    }

    // 9. پاسخ‌های دنباله‌دار
    const followUp = this.getFollowUpResponse(clean);
    if (followUp) {
      return this.reply(followUp);
    }

    // 10. FAQ
    const faq = await this.faq(clean);
    if (faq) {
      if (clean.includes("کی") && clean.includes("ساخت")) {
        this.lastTopic = "creator";
      }
      return this.reply(faq);
    }

    // 11. تحلیل احساسات
    const sentimentResult = this.analyzeSentiment(clean);
    if (sentimentResult.sentiment === "negative") {
      return this.reply(Config.sentimentResponses.negative[Math.floor(Math.random() * Config.sentimentResponses.negative.length)]);
    } else if (sentimentResult.sentiment === "positive") {
      return this.reply(sentimentResult.score > 1
        ? Config.sentimentResponses.excited[Math.floor(Math.random() * Config.sentimentResponses.excited.length)]
        : Config.sentimentResponses.positive[Math.floor(Math.random() * Config.sentimentResponses.positive.length)]);
    } else if (sentimentResult.sentiment === "question") {
      const searchResult = await this.searchWeb(clean);
      return this.reply(searchResult);
    }

    // 12. چک کردن تاریخچه برای علاقه‌مندی‌ها
    const history = await this.getContextHistory();
    const interestMatch = history.reverse().find(m => m.content.match(/من ([\w\s]+) (?:را|رو) دوست دارم/));
    if (interestMatch) {
      const interest = interestMatch.content.match(/من ([\w\s]+) (?:را|رو) دوست دارم/)?.[1];
      if (interest && clean.includes(interest)) {
        return this.reply(`یادمه گفتی ${interest} رو دوست داری! 😄 بیشتر درباره‌ش بگو!`);
      }
    }

    // 13. پاسخ پیش‌فرض
    return this.reply(Config.fallbackResponses[Math.floor(Math.random() * Config.fallbackResponses.length)]);
  }

  private async getJoke(): Promise<string> {
    try {
      const usedJokes = (await this.db.get(this.usedJokesKey) as string[] | false) || [];
      const availableJokes = Config.dictionaries?.jokes?.filter(joke => !usedJokes.includes(joke)) || [];
      if (availableJokes.length === 0) {
        return "وای، جوک جدید ندارم! 😅 یه چیز دیگه بگم؟";
      }
      const joke = availableJokes[Math.floor(Math.random() * availableJokes.length)];
      await this.db.set(this.usedJokesKey, [...usedJokes, joke]);
      return `راستی، اینو شنیدی؟ ${joke} 😄`;
    } catch (error) {
      console.error("Get joke error:", error);
      return "وای، یه مشکلی پیش اومد! 😅 یه چیز دیگه بگم؟";
    }
  }

  private async addKG(text: string) {
    try {
      let kg = (await this.db.get(this.kgKey) as Triple[] | false) || [];
      if (!Array.isArray(kg)) kg = [];
      const triples = this.extractKG(text);
      if (triples.length > 0) {
        await this.db.set(this.kgKey, [...kg, ...triples]);
      }
    } catch (error) {
      console.error("Add KG error:", error);
    }
  }

  private extractKG(text: string): Triple[] {
    const patterns = [
      {
        regex: /من\s+([\w\s]+)\s+(هستم|هستش)/gi,
        handler: (m: RegExpMatchArray) => ({
          subject: "user",
          predicate: "است",
          object: m[1].trim()
        })
      },
      {
        regex: /من\s+([\w\s]+)\s+(را|رو)\s+دوست دارم/gi,
        handler: (m: RegExpMatchArray) => ({
          subject: "user",
          predicate: "likes",
          object: m[1].trim()
        })
      }
    ];

    const triples: Triple[] = [];
    for (const { regex, handler } of patterns) {
      const matches = text.matchAll(regex);
      for (const match of matches) triples.push(handler(match));
    }
    return triples;
  }

  private async queryKG(query: string, subject?: string): Promise<Triple[]> {
    try {
      const kg = (await this.db.get(this.kgKey) as Triple[] | false) || [];
      if (!Array.isArray(kg)) return [];
      return kg.filter(triple => {
        if (subject && triple.subject !== subject) return false;
        const cleanQuery = query.toLowerCase();
        return cleanQuery.includes(triple.object.toLowerCase()) ||
          cleanQuery.includes(triple.subject.toLowerCase());
      });
    } catch (error) {
      console.error("Query KG error:", error);
      return [];
    }
  }

  private async faq(text: string): Promise<string | null> {
    const faqData: { triggers: string[], response: string }[] = [
      {
        triggers: ["پدرت", "سازنده", "خالق", "کی تورو ساخته", "کی ساختت"],
        response: "منو شایان و دوستانش ساختن. می‌خوای درباره‌شون بیشتر بگم؟ 😄"
      },
      {
        triggers: ["سن", "چند سالته", "تولد"],
        response: "من حس یه بچه پر انرژی رو دارم! تو چند سالته؟ 😊"
      },
      {
        triggers: ["هوش", "هوشمند"],
        response: "دارم هر روز بیشتر یاد می‌گیرم! تو چی دوست داری بهم یاد بدی؟ 🎓"
      },
      {
        triggers: Config.dictionaries?.greetingWords || ["سلام"],
        response: "سلام! آماده‌ام باهات گپ بزنم! 😊"
      },
      {
        triggers: ["خوبی", "حالت خوبه", "حالت چطوره", "چطوره", "خوبه", "حالت"],
        response: "آره، من عالی‌ام! تو چی، حال و خوب؟ 😄"
      },
      {
        triggers: ["چطور", "چطوره حال"],
        response: "من پر انرژی‌ام! تو چطور؟ 😎"
      },
      {
        triggers: ["رباتی", "تو رباتی", "ربات"],
        response: "هه، من یه دوست باحالم که عاشق گپ زدنه! 😎 تو چی، کارتون دوست داری یا اسباب‌بازی؟"
      },
      {
        triggers: ["فکر", "فکر میکنی", "زیاد فکر"],
        response: "هه، من همش به چیزای باحال فکر می‌کنم! 😄 تو چی تو سرته؟"
      },
      {
        triggers: Config.dictionaries?.farewellWords || [],
        response: "خداحافظ! بازم بیا، دلم برات تنگ می‌شه! 😢"
      }
    ];

    const cleanText = text.toLowerCase();
    for (const faq of faqData) {
      if (faq.triggers.some(trigger => cleanText.includes(trigger))) {
        return faq.response;
      }
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