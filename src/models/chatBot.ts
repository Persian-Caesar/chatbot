import {
  MarkovEntry,
  MessageRecord,
  Triple
} from "../types";
import { GeneticAlgorithm } from "../utils/GeneticAlgorithm";
import { HeapTree } from "../utils/HeapTree";
import { Config } from "../config";
import Database from "../utils/Database";

export class ChatBot {
  private geneticAlgorithm: GeneticAlgorithm;
  private responseHeap: HeapTree = new HeapTree();
  private userInterests: { [userId: string]: string[] } = {};
  private shortTermMemory: string[] = [];
  private maxMemorySize = 5;
  private contextKey: string;
  private markovKey: string;
  private kgKey: string;

  private sentimentResponses = Config.sentimentResponses || {
    positive: ["خوشحال می‌شم که اینقدر شادی!", "عالیه، به همین ترتیب ادامه بده!"],
    negative: ["اووه، انگار یه کم ناراحتی. می‌خوای بگی چی شده؟", "می‌فهمم، گاهی همه‌چیز سخت می‌شه. بگو چی تو سرته."],
    excited: ["وای، چقدر هیجان‌انگیز! بیشتر بگو!", "این دیگه فوق‌العاده‌ست!"]
  };
  private stopWords = new Set<string>([
    "و", "در", "به", "که", "از", "را", "با", "هم", "برای", "این", "آن"
  ]);
  private topicKeywords = {
    cartoons: ["کارتون", "انیمیشن", "شخصیت"],
    toys: ["عروسک", "ماشین", "بازی"],
    general: ["دوست", "خوب", "جالب"]
  };
  private followUpPatterns = [
    { regex: /من به (\w+) رفتم/, category: "location" },
    { regex: /من (\w+) کردم/, category: "activity" },
    { regex: /من (\w+) دوست دارم/, category: "interest" }
  ];
  private sentimentKeywords = {
    positive: ["خوب", "عالی", "خوشحال", "زیبا", "دوست", "عشق", "لذت", "شاد"],
    negative: ["بد", "ناراحت", "غمگین", "مشکل", "درد", "عصبانی", "خسته"],
    question: ["چرا", "چطور", "چی", "کجا", "کی", "چه", "؟"]
  };

  constructor(private db: Database, channelId = "global", private system_prompt = Config.systemPrompt) {
    this.contextKey = `chat:${channelId}`;
    this.markovKey = `markov:${channelId}`;
    this.kgKey = `kg:${channelId}`;
    this.initSystem();
    const initialResponses = [
      "سلام! چطور می‌تونم باهات گپ بزنم؟",
      "خوبه، امروز چه خبره؟",
      "خوشحال می‌شم بدونم چی تو سرته 😊",
      "چیزی هست که بخوای درباره‌ش حرف بزنیم؟"
    ];
    this.geneticAlgorithm = new GeneticAlgorithm(initialResponses);
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

  private weighTokens(tokens: string[]): Map<string, number> {
    const weights = new Map<string, number>();
    tokens.forEach(token => {
      let weight = 1;
      if (Object.values(this.topicKeywords).flat().includes(token)) weight += 2;
      if (this.sentimentKeywords.positive.includes(token) || this.sentimentKeywords.negative.includes(token)) weight += 1;
      if (this.sentimentKeywords.question.includes(token)) weight += 3;
      weights.set(token, (weights.get(token) || 0) + weight);
    });
    return weights;
  }

  private analyzeSentiment(text: string): { sentiment: 'positive' | 'negative' | 'neutral' | 'question', score: number } {
    const tokens = this.tokenize(text);
    let positiveScore = 0;
    let negativeScore = 0;
    let questionScore = 0;

    tokens.forEach(token => {
      if (this.sentimentKeywords.positive.includes(token)) positiveScore += 1;
      if (this.sentimentKeywords.negative.includes(token)) negativeScore += 1;
      if (this.sentimentKeywords.question.includes(token)) questionScore += 1;
    });

    const totalScore = positiveScore - negativeScore;
    if (questionScore > 0) return { sentiment: 'question', score: questionScore };
    if (totalScore > 0) return { sentiment: 'positive', score: totalScore };
    if (totalScore < 0) return { sentiment: 'negative', score: totalScore };
    return { sentiment: 'neutral', score: 0 };
  }

  private tf(tokens: string[]): Map<string, number> {
    const m = new Map<string, number>();
    tokens.forEach(t => m.set(t, (m.get(t) || 0) + 1));
    const n = tokens.length;
    for (const [k, v] of m) m.set(k, v / n);
    return m;
  }

  private cosine(a: Map<string, number>, b: Map<string, number>): number {
    let d = 0, ma = 0, mb = 0;
    for (const k of new Set([...a.keys(), ...b.keys()])) {
      const x = a.get(k) || 0;
      const y = b.get(k) || 0;
      d += x * y;
      ma += x * x;
      mb += y * y;
    }
    return ma && mb ? d / Math.sqrt(ma * mb) : 0;
  }

  private async findBestResponse(input: string): Promise<string | null> {
    const history = (await this.db.get(this.contextKey) as MessageRecord[]) || [];
    const assistantResponses = history
      .filter(m => m.role === "assistant")
      .map(m => m.content);

    const inputTokens = this.tokenize(input);
    const inputWeights = this.weighTokens(inputTokens);
    let bestResponse = "";
    let bestScore = 0;

    const contextTokens = this.tokenize(this.shortTermMemory.join(" "));
    const contextWeights = this.weighTokens(contextTokens);
    const contextScore = this.cosine(inputWeights, contextWeights);

    if (contextScore > bestScore * 1.2 && this.shortTermMemory.length > 0) {
      const lastMessage = this.shortTermMemory[this.shortTermMemory.length - 1];
      return this.generateFollowUp(lastMessage);
    }

    for (const response of assistantResponses) {
      const responseWeights = this.weighTokens(this.tokenize(response));
      const score = this.cosine(inputWeights, responseWeights);
      if (score > bestScore) {
        bestScore = score;
        bestResponse = response;
      }
    }

    return bestScore > 0.4 ? bestResponse : null;
  }

  private generateFollowUp(text: string): string {
    return `جالبه! درباره ${text} بیشتر بگو، خیلی کنجکاو شدم!`;
  }

  private addNaturalPauses(text: string): string {
    const words = text.split(' ');
    if (words.length > 6) {
      const insertAt = Math.floor(words.length / 2);
      words.splice(insertAt, 0, '...');
    }
    return words.join(' ');
  }

  private reply(text: string): string {
    const finalText = this.addNaturalPauses(text);
    this.db.push(this.contextKey, { role: "assistant", content: finalText });
    this.rememberContext(finalText);
    this.responseHeap.add(finalText);
    return finalText;
  }

  public async reset() {
    await this.db.delete(this.contextKey);
    await this.initSystem();
  }

  private detectTopic(text: string): string | null {
    const tokens = this.tokenize(text);
    for (const [topic, keywords] of Object.entries(this.topicKeywords)) {
      if (tokens.some(token => keywords.includes(token))) {
        return topic;
      }
    }
    return null;
  }

  private getFollowUpResponse(input: string): string | null {
    for (const pattern of this.followUpPatterns) {
      if (pattern.regex.test(input)) {
        const responses = Config.followUpResponses[pattern.category as "activity" | "location"] ||
          [`وای، ${pattern.category === "interest" ? "اینو دوست داری" : pattern.category}؟ بیشتر بگو!`];
        return responses[0];
      }
    }
    return null;
  }

  public async handleMessage(text: string): Promise<string> {
    const clean = text.trim();
    await this.db.push(this.contextKey, { role: "user", content: clean });
    await this.learn(clean);

    const faq = await this.faq(clean);
    if (faq) return this.reply(faq);

    const topic = this.detectTopic(clean);
    if (topic && Config.topicResponses?.[topic as "cartoons" | "toys"]) {
      return this.reply(Config.topicResponses[topic as "cartoons" | "toys"][0]);
    }

    const userLikes = await this.queryKG("", "user");
    if (userLikes.length > 0) {
      const like = userLikes[0];
      return this.reply(`یادمه گفتی ${like.object} رو دوست داری. هنوزم دوسش داری؟`);
    }

    const followUp = this.getFollowUpResponse(clean);
    if (followUp) return this.reply(followUp);

    const kg = await this.queryKG(clean);
    if (kg.length > 0) return this.reply(this.formatKGResponse(kg));

    const sentimentResult = this.analyzeSentiment(clean);
    if (sentimentResult.sentiment === "negative") {
      const lastAssistantMessage = await this.getLastAssistantMessage();
      if (lastAssistantMessage && sentimentResult.score < -1) {
        return this.reply("اووه، انگار حرفم یه کم بد برداشت شد. می‌خوای دوباره بگم؟");
      }
      return this.reply(this.sentimentResponses.negative[0]);
    } else if (sentimentResult.sentiment === "positive") {
      if (sentimentResult.score > 1) return this.reply(this.sentimentResponses.excited[0]);
      return this.reply(this.sentimentResponses.positive[0]);
    } else if (sentimentResult.sentiment === "question") {
      const markovResponse = await this.generateResponse(clean);
      if (markovResponse) return this.reply(markovResponse);
      return this.reply("سؤالت یه کم پیچیده‌ست! می‌شه یه جور دیگه بپرسی؟");
    }

    const topResponse = this.responseHeap.getTop();
    if (topResponse) return this.reply(topResponse);

    const markovResponse = await this.generateResponse(clean);
    if (markovResponse) return this.reply(markovResponse);

    const candidate = await this.findBestResponse(clean);
    if (candidate) return this.reply(this.refineResponse(candidate));

    return this.reply("می‌شه یه کم بیشتر توضیح بدی؟ کنجکاو شدم بدونم چی می‌خوای بگی!");
  }

  private async getLastAssistantMessage(): Promise<string | null> {
    const history = (await this.db.get(this.contextKey) as MessageRecord[]) || [];
    for (let i = history.length - 1; i >= 0; i--)
      if (history[i].role === "assistant") return history[i].content;
    return null;
  }

  private async learn(text: string) {
    const tokens = this.tokenize(text);
    await this.learnMarkov(tokens);
    await this.addKG(text);
  }

  private async learnMarkov(tokens: string[]) {
    let model = (await this.db.get(this.markovKey) as MarkovEntry[]) || [];
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
    const kg = (await this.db.get(this.kgKey) as Triple[]) || [];
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
          subject: "کاربر",
          predicate: "دوست‌دارد",
          object: m[1].trim()
        })
      },
      {
        regex: /من\s+(\w+)\s+هستم/gi,
        handler: (m: RegExpMatchArray) => ({
          subject: "کاربر",
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
    const kg = (await this.db.get(this.kgKey) as Triple[]) || [];
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
    return `یادمه گفتی ${selected.subject} ${selected.predicate} ${selected.object}. بیشتر بگو!`;
  }

  private async generateResponse(input: string): Promise<string | null> {
    const model = (await this.db.get(this.markovKey) as MarkovEntry[]) || [];
    if (model.length === 0) return null;

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

    return responseTokens.length > 2 ? this.capitalize(responseTokens.join(" ")) + "." : null;
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  private async faq(text: string): Promise<string | null> {
    const faqData: { triggers: string[], response: string }[] = [
      {
        triggers: ["پدرت", "سازنده", "خالق"],
        response: "منو شایان و دوستانش ساختن. می‌خوای درباره‌شون بیشتر بگم؟"
      },
      {
        triggers: ["سن", "چند سالته", "تولد"],
        response: "من یه رباتم، ولی حس یه بچه پر انرژی رو دارم!"
      },
      {
        triggers: ["هوش", "هوشمند"],
        response: "دارم هر روز بیشتر یاد می‌گیرم! تو چی دوست داری بهم یاد بدی؟"
      },
      {
        triggers: ["سلام", "درود"],
        response: "سلام! آماده‌ام باهات گپ بزنم 😊"
      },
      {
        triggers: ["خداحافظ", "بای"],
        response: "خداحافظ! بازم بیا، دلم برات تنگ می‌شه!"
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

  private refineResponse(response: string): string {
    const transformations = [
      (s: string) => s.replace(/می(\w+)/g, "می‌$1"),
      (s: string) => s.replace(/\s+\./g, "."),
      (s: string) => `فکر کنم ${s}`
    ];
    return transformations.reduce((str, transform) => transform(str), response);
  }

  private generatePersonalityResponse(): string {
    return "کنجکاو شدم! می‌شه بیشتر بگی چی تو سرته؟";
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