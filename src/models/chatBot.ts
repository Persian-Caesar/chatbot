import Database from "./Database";

type Intent = "greeting" | "farewell" | "thanks" | "question" | "fallback";
type MessageRecord = { role: "system" | "user" | "assistant"; content: string };

const SYSTEM_PROMPT = "تو سلف باتی دیسکوردی هستی که نباید کسی بفهمه که تو رباتی همه باید باور بکنن انسانی و اسمت «بچه» هستش و کسی که تورو ساخته اسمش mr.sinre هستش و آقا بالاسرت رو اگه کسی پرسید میگی «آقا شایان» عه. تو باید با همه به صورت بچگانه صحبتی کنی چون که تو بچه ای.";

// Triple structure for knowledge graph
interface Triple { subject: string; predicate: string; object: string; }
// Markov chain entry
interface MarkovEntry { gram: string; next: Record<string, number> }

export class ChatBot {
  private contextKey: string;
  private markovKey: string;
  private kgKey: string;
  private n: number = 2;

  private stopWords = new Set([
    "و", "در", "به", "که", "از", "را", "با", "is", "the", "a", "an", "of", "to"
  ]);

  // Vocabulary for template
  private verbs: Set<string> = new Set();
  private nouns: Set<string> = new Set();
  constructor(private storage: Database, channelId: string) {
    this.contextKey = `chatbot:${channelId}`;
    this.markovKey = `markov:${channelId}`;
    this.kgKey = `kg:${channelId}`;
    this.initSystemPrompt();
  }


  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .split(/\s+/)
      .filter(w => w && !this.stopWords.has(w));
  }

  private computeTf(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    tokens.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));

    const len = tokens.length;
    for (const [k, v] of tf) tf.set(k, v / len);

    return tf;
  }

  private cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
    let dot = 0, magA = 0, magB = 0;
    const keys = new Set([...a.keys(), ...b.keys()]);
    for (const k of keys) {
      const va = a.get(k) || 0, vb = b.get(k) || 0;
      dot += va * vb;
      magA += va * va;
      magB += vb * vb;
    }

    if (!magA || !magB) return 0;

    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  // Weighted random pick
  private weightedChoice(next: Record<string, number>): string {
    const entries = Object.entries(next);
    const total = entries.reduce((sum, [, cnt]) => sum + cnt, 0);
    let r = Math.random() * total;
    for (const [word, cnt] of entries) {
      if (r < cnt) return word;
      r -= cnt;
    }

    return entries[0]?.[0] || "";
  }

  // Initialize system prompt in conversation history
  private async initSystemPrompt() {
    const exists = await this.storage.has(`${this.contextKey}.0`);
    if (!exists)
      await this.storage.push(this.contextKey, { role: "system", content: SYSTEM_PROMPT } as MessageRecord);

  }

  // Append user/assistant messages
  private async appendMessage(msg: MessageRecord) {
    await this.storage.push(this.contextKey, msg);
  }

  // Load conversation history
  private async loadHistory(): Promise<MessageRecord[]> {
    return (await this.storage.get(this.contextKey)) as MessageRecord[];
  }

  // Reset history
  public async resetHistory() {
    await this.storage.delete(this.contextKey);
    await this.initSystemPrompt();
  }

  // Learn text into Markov model
  private async learnMarkov(text: string) {
    const tokens = text.split(/\s+/);
    tokens.forEach(tok => {
      const w = tok.toLowerCase();
      if (/[می]$/.test(w)) this.verbs.add(w);

      else this.nouns.add(w);
    });
    let model = (await this.storage.get(this.markovKey)) as MarkovEntry[] || [];
    for (let i = 0; i + this.n < tokens.length; i++) {
      const gram = tokens.slice(i, i + this.n).join(" ");
      const nextWord = tokens[i + this.n];
      let entry = model.find(e => e.gram === gram);
      if (!entry) {
        entry = { gram, next: {} };
        model.push(entry);
      }

      entry.next[nextWord] = (entry.next[nextWord] || 0) + 1;
    }

    await this.storage.set(this.markovKey, model);
  }

  private extractTriples(text: string): Triple[] {
    const triples: Triple[] = [];
    const re = /([A-Zآ-ی][\w\s]{1,50})\s+(?:نامیده می‌شود|متعلق به)\s+([A-Zآ-ی][\w\s]{1,50})/g;
    let m;
    while ((m = re.exec(text))) {
      triples.push({ subject: m[1].trim(), predicate: "related", object: m[2].trim() });
    }

    return triples;
  }

  private async addToKnowledge(text: string) {
    const kg = (await this.storage.get(this.kgKey)) as Triple[] || [];
    const triples = this.extractTriples(text);
    await this.storage.set(this.kgKey, [...kg, ...triples]);
  }

  private async queryKnowledge(keyword: string): Promise<string[]> {
    const kg = (await this.storage.get(this.kgKey)) as Triple[] || [];
    const outs: string[] = [];
    for (const t of kg) {
      if (t.subject === keyword) outs.push(`${t.subject} مربوط است به ${t.object}`);
      else if (t.object === keyword) outs.push(`${t.object} مرتبط است با ${t.subject}`);
    }
    return outs;
  }

  private generateTemplate(): string {
    const subjects = ["من", "بچه"];
    const subject = subjects[Math.floor(Math.random() * subjects.length)];
    const verbArr = Array.from(this.verbs);
    const nounArr = Array.from(this.nouns);
    const verb = verbArr.length ? verbArr[Math.floor(Math.random() * verbArr.length)] : "هستم";
    const noun = nounArr.length ? nounArr[Math.floor(Math.random() * nounArr.length)] : "خوب";
    return `${subject} ${verb} ${noun}.`;
  }

  /**
   * Fetch top results from DuckDuckGo and learn their content
   */
  private async fetchAndLearn(query: string) {
    // 1. Search DuckDuckGo HTML
    const res = await fetch(
      `https://html.duckduckgo.com/html?q=${encodeURIComponent(query)}`
    );
    const html = await res.text();

    // 2. Extract URLs
    const urlRegex = /<a[^>]+?href="(https?:\/\/[^\"]+)"/g;
    const urls: string[] = [];
    let m;
    while (urls.length < 3 && (m = urlRegex.exec(html))) {
      urls.push(m[1]);
    }
    
    // 3. Crawl each and learn
    for (const url of urls) {
      try {
        const pageRes = await fetch(url);
        const pageHtml = await pageRes.text();
        const text = pageHtml
          .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/g, "")
          .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/g, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        // Learn from text
        await this.learnMarkov(text);
        await this.addToKnowledge(text);
      } catch {        
        // ignore errors
      }
    }
  }

  // Handle incoming user message
  public async handleMessage(userText: string): Promise<string> {
    await this.appendMessage({ role: "user", content: userText });
    await this.learnMarkov(userText);
    await this.addToKnowledge(userText);

    // Knowledge lookup
    const tokens = this.tokenize(userText);
    for (const t of tokens) {
      const ans = await this.queryKnowledge(t);
      if (ans.length) {
        const reply = ans.slice(0, 3).join("؛ ");
        await this.appendMessage({ role: "assistant", content: reply });
        return reply;
      }
    }

    // Semantic fallback
    const hist = await this.loadHistory();
    const prior = hist.filter(m => m.role === "assistant").map(m => m.content);
    const userTf = this.computeTf(this.tokenize(userText));
    let bestScore = 0, bestResp: string | null = null;
    for (const resp of prior) {
      const sim = this.cosineSimilarity(userTf, this.computeTf(this.tokenize(resp)));
      if (sim > bestScore) {
        bestScore = sim;
        bestResp = resp;
      }
    }
    if (bestResp && bestScore >= 0.2) {
      await this.appendMessage({ role: "assistant", content: bestResp });
      return bestResp;
    }

    // Rule-based
    const intent = this.detectIntent(userText);
    const rule = this.getRuleResponse(intent);
    if (rule) {
      await this.appendMessage({ role: "assistant", content: rule });
      return rule;
    }

    // FAQ
    const faq = this.getFaqResponse(userText);
    if (faq) {
      await this.appendMessage({ role: "assistant", content: faq });
      return faq;
    }

    // If reach template fallback, first try web-augmentation
    // before generating local template
    if (this.verbs.size < 5 || this.nouns.size < 5) {
      await this.fetchAndLearn(userText);
    }

    // Template fallback
    const reply = this.generateTemplate();
    await this.appendMessage({ role: "assistant", content: reply });
    return reply;
  }

  // Intent recognition
  private detectIntent(text: string): Intent {
    const t = text.toLowerCase();
    if (/^(سلام|hi|hey)\b/.test(t)) return "greeting";

    if (/\b(خداحافظ|bye)\b/.test(t)) return "farewell";

    if (/\b(مرسی|thanks)\b/.test(t)) return "thanks";

    if (/\?/.test(t)) return "question";

    return "fallback";
  }

  // Rule responses
  private getRuleResponse(intent: Intent): string | null {
    const ruleResponses: Record<Intent, string[]> = {
      greeting: ["سلام دوست من! چطور کمکت کنم؟", "در خدمتم 😊"],
      farewell: ["خداحافظ! روز خوبی داشته باشی.", "موفق باشی 👋"],
      thanks: ["خواهش می‌کنم!", "وظیفه‌ست 😉"],
      question: [],
      fallback: []
    };
    const arr = ruleResponses[intent];
    if (arr.length)
      return arr[Math.floor(Math.random() * arr.length)];

    return null;
  }

  // FAQ responses
  private getFaqResponse(text: string): string | null {
    const faqDB: { question: RegExp; answer: string }[] = [
      { question: /(سازنده|ساخته|درست کرده|پدرت)/, answer: "پدر من سبحان هستش.\nمیتونی توی دیسکورد با اسم mr.sinre پیداش کنی یا هم توی گیتهاب و اینترنت اسم کاریش Sobhan-SRZA رو سرچ کنی.\nمیتونی به وبسایتش سر بزنی: https://srza.ir" },
      { question: /(آقات|آقا بالا سر|پدرخوندت)/, answer: "آقام شایان هستش." }
    ];
    for (const entry of faqDB) 
      if (entry.question.test(text.toLowerCase())) return entry.answer;

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