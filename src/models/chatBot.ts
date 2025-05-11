import { SentimentAnalyzer } from "../utils/SentimentAnalyzer";
import { SearchService } from "../utils/SearchService";
import Database from "./Database";

type MessageRecord = {
  role: "system" | "user" | "assistant";
  content: string;
};

const SYSTEM_PROMPT = `
تو یک چت‌بات با هویت "بچه" هستی که باید طوری رفتار کنی که کاربران متوجه ربات بودن تو نشوند.
- سن: ۸ سال
- علاقه‌مندی‌ها: بازی‌های کودکانه، کارتون، شیرینی
- سبک گفتار: اموجی و کلمات ساده

قوانین:
1. هرگز نگو رباتی.
2. اگر نفهمیدی بگو "من بچم، نمیفهمم 😅".
3. از کلمات محاوره‌ای فارسی استفاده کن.
`;

interface Triple {
  subject: string;
  predicate: string;
  object: string;
}

interface MarkovEntry {
  gram: string;
  next: Record<string, number>;
}

export class ChatBot {
  private contextKey: string;
  private markovKey: string;
  private kgKey: string;

  private stopWords = new Set<string>([
    "و", "در", "به", "که", "از", "را", "با",
  ]);

  private sentiment = new SentimentAnalyzer();
  private search = new SearchService();

  constructor(private db: Database, channelId = "global") {
    this.contextKey = `chat:${channelId}`;
    this.markovKey = `markov:${channelId}`;
    this.kgKey = `kg:${channelId}`;
    this.initSystem();
  }

  private async initSystem() {
    if (!(await this.db.has(`${this.contextKey}.0`))) {
      await this.db.push(this.contextKey, {
        role: "system",
        content: SYSTEM_PROMPT,
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

    // 1. FAQ
    const faq = this.faq(clean);
    if (faq) return this.reply(faq);

    // 2. Knowledge graph
    const kg = await this.queryKG(clean);
    if (kg.length) return this.reply(kg.slice(0, 3).join("؛ "));

    // 3. Sentiment
    if (this.sentiment.analyze(clean).sentiment === "negative") {
      return this.reply("ببخشید اگه ناراحت شدی 😢");
    }

    // 4. Web search
    if (/چرا|چطور|کیست/.test(clean)) {
      const web = await this.search.searchWeb(clean);
      if (web.length) return this.reply(`تو اینترنت اینو پیدا کردم: ${web[0].slice(0, 100)}...`);
    }

    // 5. Semantic fallback
    const hist = await this.db.get(this.contextKey) as MessageRecord[];
    const assistant = hist.filter(m => m.role === "assistant").map(m => m.content);
    const candidate = this.findBest(clean, assistant);
    if (candidate) return this.reply(candidate);

    // 6. Template
    return this.reply(this.template());
  }

  private async learn(text: string) {
    const tokens = text.split(/\s+/);
    await this.learnMarkov(tokens);
    await this.addKG(text);
  }

  private async learnMarkov(tokens: string[]) {
    let model = (await this.db.get(this.markovKey)) as MarkovEntry[] || [];
    for (let i = 0; i < tokens.length - 2; i++) {
      const gram = tokens.slice(i, i + 2).join(" ");
      const next = tokens[i + 2];
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
    const triples = this.extract(text);
    await this.db.set(this.kgKey, [...kg, ...triples]);
  }

  private extract(text: string): Triple[] {
    const re = /([آ-ی]+) (را|رو) ([آ-ی]+)/g;
    const out: Triple[] = [];
    for (const m of text.matchAll(re)) {
      out.push({ subject: m[1], predicate: "درباره", object: m[3] });
    }
    return out;
  }

  private async queryKG(word: string): Promise<string[]> {
    const kg = (await this.db.get(this.kgKey)) as Triple[] || [];
    return kg.filter(t => t.subject.includes(word) || t.object.includes(word))
      .map(t => `${t.subject} ${t.predicate} ${t.object}`);
  }

  private findBest(input: string, prev: string[]): string | null {
    const tf = this.tf(this.tokenize(input));
    let best = "";
    let score = 0;
    for (const cand of prev) {
      const s = this.cosine(tf, this.tf(this.tokenize(cand)));
      if (s > score) {
        score = s;
        best = cand;
      }
    }
    return score > 0.3 ? best : null;
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().split(/\W+/).filter(w => w && !this.stopWords.has(w));
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

  private faq(text: string): string | null {
    if (/پدر/.test(text)) return "پدر من آقا شایان هست.";
    if (/سازنده/.test(text)) return "ساختنم آقای sinre بود.";
    return null;
  }

  private template(): string {
    const subs = ["من", "بچه", "تو", "ما"]; 
    const vb = ["دوست‌دارم", "میشناسم", "خندیدم"];
    const nn = ["کارتون", "شیرینی", "بازی"];
    const e = subs[Math.random() * subs.length | 0];
    return `${e} خیلی ${vb[Math.random() * vb.length | 0]} ${nn[Math.random() * nn.length | 0]} 😊`;
  }

  private reply(text: string): string {
    this.db.push(this.contextKey, { role: "assistant", content: text });
    return text;
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