import {
  MarkovEntry,
  MessageRecord,
  Triple
} from "../types";
import { SentimentAnalyzer } from "../utils/SentimentAnalyzer";
import { SearchService } from "../utils/SearchService";
import { HeapTree } from "../utils/HeapTree";
import { Config } from "../config";
import Database from "../utils/Database";

export class ChatBot {
  private responseHeap: HeapTree = new HeapTree();
  private userInterests: { [userId: string]: string[] } = {};
  private shortTermMemory: string[] = [];
  private usedJokes: string[] = []; // حافظه جوک‌های استفاده‌شده
  private maxMemorySize = 5;
  private maxJokeMemory = 10; // حداکثر تعداد جوک در حافظه
  private contextKey: string;
  private markovKey: string;
  private kgKey: string;
  private searchService: SearchService;
  private sentimentAnalyzer: SentimentAnalyzer;

  private sentimentResponses = Config.sentimentResponses || {
    positive: ["خوشحال می‌شم که اینقدر شادی!", "عالیه، به همین ترتیب ادامه بده!"],
    negative: ["اووه، انگار یه کم ناراحتی. می‌خوای بگی چی شده؟", "می‌فهمم، گاهی همه‌چیز سخت می‌شه. بگو چی تو سرته."],
    excited: ["وای، چقدر هیجان‌انگیز! بیشتر بگو!", "این دیگه فوق‌العاده‌ست!"]
  };
  private stopWords = new Set<string>([
    "و", "در", "به", "که", "از", "را", "با", "هم", "برای", "این", "آن"
  ]);
  private negativeWords = new Set<string>(["کسخل", "کسشر", "بی‌شعور", "احمق"]); // کلمات توهین‌آمیز
  private sensitiveWords = new Set<string>(["سکس", "جنسی", "بزرگسال"]); // کلمات حساس
  private followUpPatterns = [
    { regex: /من به (\w+) رفتم/, category: "location" },
    { regex: /من (\w+) کردم/, category: "activity" },
    { regex: /من (\w+) دوست دارم/, category: "interest" }
  ];
  private forbiddenQuestions = [
    "اسمت چیه", "اسم تو چیه", "تو کی هستی", "اسمت چی هست", "اسم تو چی هست"
  ]; // سؤال‌های ممنوعه

  constructor(private db: Database, channelId = "global", private system_prompt = Config.systemPrompt) {
    this.contextKey = `chat:${channelId}`;
    this.markovKey = `markov:${channelId}`;
    this.kgKey = `kg:${channelId}`;
    this.searchService = new SearchService();
    this.sentimentAnalyzer = new SentimentAnalyzer();
    this.initSystem();
  }

  private async initSystem() {
    if (!(await this.db.has(`${this.contextKey}.0`))) {
      await this.db.push(this.contextKey, {
        role: "system",
        content: this.system_prompt || "من یه چت‌بات دوست‌داشتنی‌ام که عاشق گپ زدنم!",
      } as MessageRecord);
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

  private async analyzeSentiment(text: string): Promise<{ sentiment: 'positive' | 'negative' | 'neutral' | 'question', score: number }> {
    return await this.sentimentAnalyzer.analyze(text);
  }

  private addNaturalPauses(text: string): string {
    const words = text.split(' ');
    if (words.length > 6) {
      const insertAt = Math.floor(words.length / 2);
      words.splice(insertAt, 0, '...');
    }
    return words.join(' ');
  }

  private reply(text: string, userId?: string): string {
    const finalText = this.addNaturalPauses(this.rephraseChildlike(text));
    this.db.push(this.contextKey, { role: "assistant", content: finalText });
    this.rememberContext(finalText);
    this.responseHeap.add(finalText, "ChatBot", this.tokenize(text));
    if (userId) {
      if (!this.userInterests[userId]) this.userInterests[userId] = [];
      this.userInterests[userId].push(text); // ذخیره علاقه‌مندی‌ها
    }
    return finalText;
  }

  public async reset() {
    await this.db.delete(this.contextKey);
    this.usedJokes = []; // ریست حافظه جوک‌ها
    await this.initSystem();
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
      if (pattern.regex.test(input)) {
        const responses = Config.followUpResponses?.[pattern.category as "activity" | "location" | "interest"] ||
          [`وای، ${pattern.category === "interest" ? "اینو دوست داری" : pattern.category}؟ بیشتر بگو! 😊`];
        return responses[0];
      }
    }
    return null;
  }

  public async handleMessage(text: string, userId?: string): Promise<string> {
    const clean = text.trim().toLowerCase();
    const tokens = this.tokenize(clean);
    await this.db.push(this.contextKey, { role: "user", content: clean });
    await this.learn(clean);

    // چک کردن کلمات حساس
    if (tokens.some(token => this.sensitiveWords.has(token))) {
      return this.reply("اووه، این حرفا برای بچه‌ها نیست! 😅 بیا درباره کارتون یا اسباب‌بازی گپ بزنیم! 🧸", userId);
    }

    // چک کردن توهین
    if (tokens.some(token => this.negativeWords.has(token))) {
      return this.reply("اووه، این حرفا چیه؟ بیا یه چیز باحال بگیم! 😄", userId);
    }

    // چک کردن سؤال‌های ممنوعه
    if (this.forbiddenQuestions.some(q => clean.includes(q))) {
      return this.reply("وای، این سؤال یه کم عجیبه! 😅 یه چیز دیگه بپرس!", userId);
    }

    // چک کردن FAQ
    const faq = await this.faq(clean);
    if (faq) return this.reply(faq, userId);

    // تشخیص موضوع
    const topic = this.detectTopic(clean);
    if (topic && Config.topicResponses?.[topic as keyof typeof Config.topicResponses]) {
      return this.reply(Config.topicResponses[topic as keyof typeof Config.topicResponses][0], userId);
    }

    // چک کردن علاقه‌مندی‌های کاربر
    if (userId && this.userInterests[userId]?.length > 0) {
      const lastInterest = this.userInterests[userId][this.userInterests[userId].length - 1];
      return this.reply(`یادمه گفتی ${lastInterest} رو دوست داری. هنوزم دوسش داری؟ 😄`, userId);
    }

    // پاسخ‌های دنباله‌دار
    const followUp = this.getFollowUpResponse(clean);
    if (followUp) return this.reply(followUp, userId);

    // چک کردن عبارات مربوط به اسم یا بچه
    if (clean.includes("اسم") || clean.includes("بچه")) {
      return this.reply("هه، بچه؟ من یه چت‌بات باحالم! 😄 اسم تو چیه؟", userId);
    }

    // تحلیل احساسات
    const sentimentResult = await this.analyzeSentiment(clean);
    const isQuestion = tokens.some(token => Config.dictionaries?.questionWords?.includes(token));

    if (sentimentResult.sentiment === "negative") {
      const lastAssistantMessage = await this.getLastAssistantMessage();
      if (lastAssistantMessage && sentimentResult.score < -1) {
        return this.reply("اووه، انگار حرفم یه کم بد برداشت شد. می‌خوای دوباره بگم؟ 😔", userId);
      }
      return this.reply(this.sentimentResponses.negative[0], userId);
    } else if (sentimentResult.sentiment === "positive") {
      if (sentimentResult.score > 1) return this.reply(this.sentimentResponses.excited[0], userId);
      return this.reply(this.sentimentResponses.positive[0], userId);
    } else if (sentimentResult.sentiment === "question" || isQuestion) {
      const searchResults = await this.searchService.searchWeb(clean);
      if (searchResults.length > 0) {
        return this.reply(searchResults[0], userId);
      }
      const kgResponse = await this.queryKG(clean);
      if (kgResponse.length > 0) {
        return this.reply(this.formatKGResponse(kgResponse), userId);
      }
      const markovResponse = await this.generateResponse(clean);
      if (markovResponse) return this.reply(markovResponse, userId);
      return this.reply(Config.fallbackResponses?.[0] || "سؤالت یه کم پیچیده‌ست! می‌شه یه جور دیگه بپرسی؟ 😅", userId);
    }

    // پاسخ‌های ذخیره‌شده
    const topResponse = this.responseHeap.getTop();
    if (topResponse[0]) return this.reply(topResponse[0], userId);

    // تولید پاسخ جدید
    const kgResponse = await this.queryKG(clean);
    if (kgResponse.length > 0) {
      return this.reply(this.formatKGResponse(kgResponse), userId);
    }
    const markovResponse = await this.generateResponse(clean);
    if (markovResponse) return this.reply(markovResponse, userId);

    return this.reply(Config.fallbackResponses?.[0] || "می‌شه یه کم بیشتر توضیح بدی؟ کنجکاو شدم! 😊", userId);
  }

  private async getLastAssistantMessage(): Promise<string | null> {
    const history = (await this.db.get(this.contextKey) as MessageRecord[] | false);
    if (!history || !Array.isArray(history)) return null;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "assistant") return history[i].content;
    }
    return null;
  }

  private async learn(text: string) {
    const tokens = this.tokenize(text);
    await this.learnMarkov(tokens);
    await this.addKG(text);
  }

  private async learnMarkov(tokens: string[]) {
    let model = (await this.db.get(this.markovKey) as MarkovEntry[] | false) || [];
    if (!Array.isArray(model)) model = [];
    const markedTokens = ["[start]", ...tokens, "[end]"];
    for (let i = 0; i < markedTokens.length - 2; i++) {
      const gram = markedTokens.slice(i, i + 2).join(" ");
      const next = markedTokens[i + 2];
      let entry = model.find(e => e.gram === gram);
      if (!entry) {
        entry = { gram, next: {} };
        model.push(entry);
      }
      entry.next[next] = (entry.next[next] || 0) + 1;
    }
    await this.db.set(this.markovKey, model);
  }

  private async addKG(text: string) {
    let kg = (await this.db.get(this.kgKey) as Triple[] | false) || [];
    if (!Array.isArray(kg)) kg = [];
    const triples = this.extractKG(text);
    await this.db.set(this.kgKey, [...kg, ...triples]);
  }

  private extractKG(text: string): Triple[] {
    const patterns = [
      {
        regex: /(\w+)\s+(را|رو)\s+(\w+)/g,
        handler: (m: RegExpMatchArray) => ({
          subject: m[1],
          predicate: "درباره",
          object: m[3]
        })
      },
      {
        regex: /(\w+)\s+(هست|است)\s+(\w+)/gi,
        handler: (m: RegExpMatchArray) => ({
          subject: m[1],
          predicate: "است",
          object: m[3]
        })
      },
      {
        regex: /(\w+)\s+می‌تواند\s+(\w+)/gi,
        handler: (m: RegExpMatchArray) => ({
          subject: m[1],
          predicate: "قابلیت",
          object: m[2]
        })
      },
      {
        regex: /من\s+([\w\s]+)\s+(را|رو)\s+دوست دارم/g,
        handler: (m: RegExpMatchArray) => ({
          subject: "user",
          predicate: "likes",
          object: m[1].trim()
        })
      },
      {
        regex: /من\s+(\w+)\s+هستم/gi,
        handler: (m: RegExpMatchArray) => ({
          subject: "user",
          predicate: "است",
          object: m[1]
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
    const kg = (await this.db.get(this.kgKey) as Triple[] | false) || [];
    if (!Array.isArray(kg)) return [];
    const queryTokens = new Set(this.tokenize(query));

    return kg.filter(triple => {
      if (subject && triple.subject !== subject) return false;
      const subjectTokens = new Set(this.tokenize(triple.subject));
      const objectTokens = new Set(this.tokenize(triple.object));
      const subjectMatch = [...queryTokens].filter(t => subjectTokens.has(t)).length;
      const objectMatch = [...queryTokens].filter(t => objectTokens.has(t)).length;
      return subjectMatch > 0 || objectMatch > 0;
    });
  }

  private formatKGResponse(triples: Triple[]): string {
    if (triples.length === 0) return "";
    const selected = triples[0];
    return `یادمه گفتی ${selected.subject} ${selected.predicate} ${selected.object}. بیشتر بگو! 😊`;
  }

  private async generateResponse(input: string): Promise<string | null> {
    const model = (await this.db.get(this.markovKey) as MarkovEntry[] | false) || [];
    if (!Array.isArray(model) || model.length === 0) return null;

    const inputTokens = this.tokenize(input);
    let currentGram = "[start]";

    const relevantGrams = model.filter(entry => inputTokens.some(t => entry.gram.includes(t)));
    if (relevantGrams.length > 0) currentGram = relevantGrams[0].gram;

    let safety = 0;
    const maxLength = 15;
    const responseTokens = [];

    while (safety++ < 50 && responseTokens.length < maxLength) {
      const entry = model.find(e => e.gram === currentGram);
      if (!entry) break;

      const possibleNext = Object.entries(entry.next);
      let maxWeight = 0;
      let nextWord = "";

      for (const [word, weight] of possibleNext) {
        if (weight > maxWeight) {
          maxWeight = weight;
          nextWord = word;
        }
      }

      if (nextWord === "[end]" || !nextWord) break;

      responseTokens.push(nextWord);
      const gramParts = currentGram.split(" ");
      currentGram = `${gramParts[1] || gramParts[0]} ${nextWord}`;
    }

    return responseTokens.length > 2 ? this.rephraseChildlike(responseTokens.join(" ")) + "." : null;
  }

  private rephraseChildlike(text: string): string {
    let result = text
      .replace(/است/g, "هست")
      .replace(/می‌باشد/g, "هست")
      .replace(/بسیار/g, "خیلی")
      .replace(/همچنین/g, "مثلاً")
      .replace(/بنابراین/g, "واسه همین")
      .replace(/می(\w+)/g, "می‌$1")
      .replace(/\s+\./g, ".")
      .replace(/\s+/g, " ")
      .trim();

    // اضافه کردن عبارات کودکانه با احتمال 30% و فقط یک بار
    if (Math.random() < 0.3 && Config.dictionaries?.positiveWords?.length > 0) {
      const positiveWord = Config.dictionaries.positiveWords[Math.floor(Math.random() * Config.dictionaries.positiveWords.length)];
      result = `فکر کنم ${result} وای، این ${positiveWord}ه! 😊`;
    } else if (Math.random() < 0.3 && Config.dictionaries?.jokes?.length > 0) {
      const availableJokes = Config.dictionaries.jokes.filter(joke => !this.usedJokes.includes(joke));
      if (availableJokes.length > 0) {
        const joke = availableJokes[Math.floor(Math.random() * availableJokes.length)];
        this.usedJokes.push(joke);
        if (this.usedJokes.length > this.maxJokeMemory) {
          this.usedJokes.shift(); // حذف جوک قدیمی
        }
        result = `${result} راستی، اینو شنیدی؟ ${joke} 😄`;
      }
    }

    // بزرگ کردن حرف اول
    return result.charAt(0).toUpperCase() + result.slice(1);
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
        response: "دارم هر روز بیشتر یاد می‌م! تو چی دوست داری بهم یاد بدی؟ 🎓"
      },
      {
        triggers: Config.dictionaries?.greetingWords || ["سلام"],
        response: "سلام! آماده‌ام باهات گپ بزنم! 😊"
      },
      {
        triggers: ["خوبی", "حالت خوبه", "حالت چطوره", "چطوره", "خوبه"],
        response: "آره، من عالی‌ام! تو چی، حال و خوب؟ 😄"
      },
      {
        triggers: ["چطور", "چطوره حال"],
        response: "من پرت! تو چطور؟ 😎"
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