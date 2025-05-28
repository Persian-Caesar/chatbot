import {
  MarkovEntry,
  MessageRecord,
  Triple
} from "../types";
import { SentimentAnalyzer } from "../utils/SentimentAnalyzer";
import { SearchService } from "../utils/SearchService";
import { Config } from "../config";
import Database from "../utils/Database";

export class ChatBot {
  private shortTermMemory: string[] = [];
  private maxMemorySize = 5;
  private contextKey: string;
  private markovKey: string;
  private kgKey: string;

  private stopWords = new Set<string>([
    "و", "در", "به", "که", "از", "را", "با", "هم", "برای", "این", "آن"
  ]);

  private sentimentResponses = Config.sentimentResponses;

  private sentiment = new SentimentAnalyzer();
  private search = new SearchService();

  constructor(private db: Database, channelId = "global", private system_prompt = Config.systemPrompt) {
    this.contextKey = `chat:${channelId}`;
    this.markovKey = `markov:${channelId}`;
    this.kgKey = `kg:${channelId}`;
    this.initSystem();
  }

  private async rememberContext(text: string) {
    this.shortTermMemory.push(text);
    if (this.shortTermMemory.length > this.maxMemorySize) {
      this.shortTermMemory.shift();
    }
  }

  private async findBestResponse(input: string): Promise<string | null> {
    const history = await this.db.get(this.contextKey) as MessageRecord[];
    const assistantResponses = history
      .filter(m => m.role === "assistant")
      .map(m => m.content);

    const inputTf = this.tf(this.tokenize(input));
    let bestResponse = "";
    let bestScore = 0;

    const contextTf = this.tf(this.tokenize(this.shortTermMemory.join(" ")));
    const contextScore = this.cosine(inputTf, contextTf);

    if (contextScore > bestScore * 1.2) {
      // اگر متن مرتبط در حافظه کوتاه‌مدت وجود دارد
      const lastMessage = this.shortTermMemory[this.shortTermMemory.length - 1];
      return this.generateFollowUp(lastMessage);
    }

    for (const response of assistantResponses) {
      const responseTf = this.tf(this.tokenize(response));
      const score = this.cosine(inputTf, responseTf);

      if (score > bestScore) {
        bestScore = score;
        bestResponse = response;
      }
    }

    return bestScore > 0.4 ? bestResponse : null;
  }

  private tokenize(text: string): string[] {
    return text
      .replace(/[.،؛!?:؟]/g, '') // حذف نشانه‌های سجاوندی
      .split(/[\s\u200c]+/) // تقسیم بر اساس فاصله و نیم‌فاصله
      .filter(w => w && w.length > 1 && !this.stopWords.has(w));
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

  private async getLastAssistantMessage(): Promise<string | null> {
    const history = await this.db.get(this.contextKey) as MessageRecord[];
    for (let i = history.length - 1; i >= 0; i--)
      if (history[i].role === "assistant")
        return history[i].content;

    return null;
  }

  private generateFollowUp(text: string): string {
    const followUps = [
      `راجع به ${text}، میخوای بیشتر بدونم؟`,
      `جالبه! در مورد ${text} چی بیشتر میدونی؟`,
      `حالا که صحبت ${text} شد، نظرت چیه؟`,
      `منم فکر ${text} رو دوست دارم، تو چی؟`
    ];

    return this.getRandomResponse(followUps);
  }

  private addNaturalPauses(text: string): string {
    const pausePoints = [',', '...', '،', ' - '];
    const words = text.split(' ');

    if (words.length > 6) {
      const insertAt = Math.floor(words.length / 2);
      words.splice(insertAt, 0, pausePoints[Math.floor(Math.random() * pausePoints.length)]);
    }

    return words.join(' ');
  }

  private reply(text: string): string {
    const finalText = this.addNaturalPauses(text);
    this.db.push(this.contextKey, { role: "assistant", content: finalText });
    this.rememberContext(finalText); // ذخیره در حافظه کوتاه‌مدت
    return finalText;
  }

  private async initSystem() {
    if (!(await this.db.has(`${this.contextKey}.0`))) {
      await this.db.push(this.contextKey, {
        role: "system",
        content: this.system_prompt,
      } as MessageRecord);
    }
  }

  public async reset() {
    await this.db.delete(this.contextKey);
    await this.initSystem();
  }

  public async handleMessage(text: string): Promise<string> {
    const clean = text.trim();
    await this.db.push(this.contextKey, { role: "user", content: clean });
    await this.learn(clean);

    // 1. Dynamic FAQ
    const faq = await this.faq(clean);
    if (faq)
      return this.reply(faq);


    // 2. Enhanced knowledge graph
    const kg = await this.queryKG(clean);
    if (kg.length > 0)
      return this.reply(this.formatKGResponse(kg));


    // 3. Nuanced sentiment handling
    const sentimentResult = await this.sentiment.analyze(clean);
    if (sentimentResult.sentiment === "negative") {
      const lastAssistantMessage = await this.getLastAssistantMessage();

      if (lastAssistantMessage && sentimentResult.score < -0.7)
        return this.reply(this.getRandomResponse([
          "ببخشید حرف قبلی من واضح نبود، منظورم این بود که...",
          "شاید بد بیان کردم، بذار دوباره توضیح بدم"
        ]));

      return this.reply(this.getRandomResponse(this.sentimentResponses.negative));
    }

    else if (sentimentResult.sentiment === "positive")
      if (Math.random() < 0.3)
        return this.reply(this.getRandomResponse(this.sentimentResponses.positive));


    // 4. Contextual web search
    if (this.needsWebSearch(clean)) {
      const web = await this.search.searchWeb(clean);
      if (web.length > 0)
        return this.reply(this.formatWebResponse(web[0]));

    }

    // 5. Markov-based response generation
    const markovResponse = await this.generateResponse(clean);
    if (markovResponse)
      return this.reply(markovResponse);

    // 6. Contextual semantic match
    const candidate = await this.findBestResponse(clean);

    if (candidate)
      return this.reply(this.refineResponse(candidate));

    // 7. Personality-driven fallback
    return this.reply(this.generatePersonalityResponse());
  }

  private async learn(text: string) {
    const tokens = this.tokenize(text);
    await this.learnMarkov(tokens);
    await this.addKG(text);
  }

  private async learnMarkov(tokens: string[]) {
    let model = (await this.db.get(this.markovKey)) as MarkovEntry[] || [];

    // Add beginning/end markers
    const markedTokens = ["[START]", ...tokens, "[END]"];

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
    const kg = (await this.db.get(this.kgKey)) as Triple[] || [];
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
          predicate: "is",
          object: m[3]
        })
      },
      {
        regex: /(\w+)\s+می‌تواند\s+(\w+)/gi,
        handler: (m: RegExpMatchArray) => ({
          subject: m[1],
          predicate: "can",
          object: m[2]
        })
      }
    ];

    const triples: Triple[] = [];
    for (const { regex, handler } of patterns) {
      const matches = text.matchAll(regex);
      for (const match of matches)
        triples.push(handler(match));

    }

    return triples;
  }

  private async queryKG(query: string): Promise<Triple[]> {
    const kg = (await this.db.get(this.kgKey)) as Triple[] || [];
    const queryTokens = new Set(this.tokenize(query));

    return kg.filter(triple => {
      const subjectTokens = new Set(this.tokenize(triple.subject));
      const objectTokens = new Set(this.tokenize(triple.object));

      const subjectMatch = [...queryTokens].filter(t => subjectTokens.has(t)).length;
      const objectMatch = [...queryTokens].filter(t => objectTokens.has(t)).length;

      return subjectMatch > 0 || objectMatch > 0;
    });
  }

  private formatKGResponse(triples: Triple[]): string {
    if (triples.length === 0)
      return "";

    const selected = triples.slice(0, 3);
    const responses = [
      `فکر کنم قبلاً گفتی که: ${selected.map(t => `${t.subject} ${t.predicate} ${t.object}`).join('، ')}`,
      `یادم میاد در این مورد گفتی: ${selected[0].subject} ${selected[0].predicate} ${selected[0].object}`,
      `پارسال هم راجع به این صحبت کردیم: ${selected.map(t => t.object).join(' و ')}`
    ];

    return this.getRandomResponse(responses);
  }

  private async generateResponse(input: string): Promise<string | null> {
    const model = (await this.db.get(this.markovKey)) as MarkovEntry[] || [];
    if (model.length === 0)
      return null;

    const inputTokens = this.tokenize(input);
    let currentGram = "[START]";

    // Find relevant starting point
    const relevantGrams = model.filter(entry =>
      inputTokens.some(t => entry.gram.includes(t))
    );

    if (relevantGrams.length > 0)
      currentGram = relevantGrams[Math.floor(Math.random() * relevantGrams.length)].gram;

    let safety = 0;
    const maxLength = 15;
    const responseTokens = [];

    while (safety++ < 50 && responseTokens.length < maxLength) {
      const entry = model.find(e => e.gram === currentGram);
      if (!entry)
        break;

      const possibleNext = Object.entries(entry.next);
      const totalWeight = possibleNext.reduce((sum, [_, weight]) => sum + weight, 0);
      let random = Math.random() * totalWeight;

      let nextWord = "";
      for (const [word, weight] of possibleNext) {
        random -= weight;
        if (random <= 0) {
          nextWord = word;
          break;
        }
      }

      if (nextWord === "[END]" || nextWord === "")
        break;

      responseTokens.push(nextWord);

      // Update current gram
      const gramParts = currentGram.split(" ");
      currentGram = `${gramParts[1] || gramParts[0]} ${nextWord}`;
    }

    return responseTokens.length > 2 ?
      this.capitalize(responseTokens.join(" ")) + this.getRandomPunctuation() :
      null;
  }

  private getRandomPunctuation(): string {
    const punctuations = ["!", "؟", "...", ".", " 😊", " 🤔"];
    return punctuations[Math.floor(Math.random() * punctuations.length)];
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  private needsWebSearch(text: string): boolean {
    return /چرا|چطور|کیست|کجا|چه|چی|؟\s*$/.test(text);
  }

  private formatWebResponse(result: string): string {
    const responses = [
      `توی نت اینو پیدا کردم: ${result.slice(0, 120)}...`,
      `یه منبع اینو میگه: ${result.slice(0, 100)}`,
      `بذار برات خلاصه کنم: ${result.split('.').slice(0, 2).join('.')}`
    ];
    return this.getRandomResponse(responses);
  }

  private async faq(text: string): Promise<string | null> {
    const faqData: { triggers: string[], response: string }[] = [
      {
        triggers: ["پدرت", "سازنده", "خالق", "پدر", "بابا"],
        response: "منو آقا شایان با کمک Mr.Sinre ساختن! اگه کار داشتی میتونی بهش سر بزنی: https://srza.ir"
      },
      {
        triggers: ["سن", "چند سالته", "تولد"],
        response: "من یه رباتم ولی اگه بخوای سن روحی حساب کنم، همیشه ۱۸ سالمه 😄"
      },
      {
        triggers: ["هوش", "هوشمند", "هوش مصنوعی"],
        response: "من با مدل زبانی آموزش دادم، روز به روز هم دارم یاد میگیرم. تو چه چیزی دوست داری بهم یاد بدی؟"
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
      (s: string) => s.replace(/می(\w+)/g, "می‌$1"),  // Add ZWNJ
      (s: string) => s.replace(/\s+\./g, "."),
      (s: string) => {
        const starters = ["فکر کنم ", "یادم اومد که ", "یه زمانی ", "حالا که فکر میکنم "];
        return Math.random() > 0.7 ? starters[Math.floor(Math.random() * starters.length)] + s : s;
      }
    ];

    return transformations.reduce((str, transform) => transform(str), response);
  }

  private generatePersonalityResponse(): string {
    const personalities = [
      {
        prefix: ["صبر کن ببینم... ", "هومم... ", "جالب شد! "],
        subjects: ["این موضوع", "حرفت", "سوالت"],
        verbs: ["مرا به فکر فرو برد", "جالبه", "یاد یه خاطره انداخت"],
        endings: ["درسته؟", "نظرت چیه؟", "دربش بیشتر بگو"]
      },
      {
        prefix: [],
        subjects: ["من", "ما رباتا", "تو این موقعیت"],
        verbs: ["کنجکاوم", "همیشه یاد میگیریم", "سعی میکنم بهتر باشم"],
        endings: ["😊", "!", "..."]
      }
    ];

    const style = personalities[Math.floor(Math.random() * personalities.length)];
    const prefix = style.prefix.length > 0 ?
      this.getRandomResponse(style.prefix) : "";
    const subject = this.getRandomResponse(style.subjects);
    const verb = this.getRandomResponse(style.verbs);
    const ending = this.getRandomResponse(style.endings);

    return `${prefix}${subject} ${verb}${ending}`;
  }

  private getRandomResponse(responses: string[]): string {
    const variations = [
      (response: string) => response + " " + ["😊", "🤔", "😄", "🙂"][Math.floor(Math.random() * 4)],
      (response: string) => ["همینطور... ", "اصلاً... ", "راستش... "][Math.floor(Math.random() * 3)] + response
    ];

    const baseResponse = responses[Math.floor(Math.random() * responses.length)];
    return variations[Math.floor(Math.random() * variations.length)](baseResponse);
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