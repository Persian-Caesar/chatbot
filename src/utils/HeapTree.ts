import { Config } from "../config";

interface HeapItem {
    response: string;
    score: number;
    timestamp: number; // برای تازگی پاسخ
    source?: string; // منبع پاسخ (مثل SerpAPI یا Wikipedia)
}

export class HeapTree {
    private heap: HeapItem[] = [];
    private positiveWords: Set<string>;
    private negativeWords: Set<string>;
    private questionWords: Set<string>;
    private maxSize: number = 50; // محدود کردن اندازه هیپ

    constructor() {
        this.positiveWords = new Set(Config.dictionaries.positiveWords || []);
        this.negativeWords = new Set(Config.dictionaries.negativeWords || []);
        this.questionWords = new Set(Config.dictionaries.questionWords || []);
    }

    // اضافه کردن پاسخ به هیپ
    add(response: string, source?: string, queryTokens: string[] = []) {
        const childlikeResponse = this.rephraseChildlike(response);
        const existing = this.heap.find(item => item.response === childlikeResponse);

        if (existing) {
            existing.score += this.calculateScore(childlikeResponse, queryTokens, source);
            existing.timestamp = Date.now();
            this.heapifyUp(this.heap.indexOf(existing));
        } else {
            const newItem: HeapItem = {
                response: childlikeResponse,
                score: this.calculateScore(childlikeResponse, queryTokens, source),
                timestamp: Date.now(),
                source
            };
            this.heap.push(newItem);
            this.heapifyUp(this.heap.length - 1);
        }

        // محدود کردن اندازه هیپ
        if (this.heap.length > this.maxSize) {
            this.removeLowest();
        }
    }

    // گرفتن چند پاسخ برتر
    getTop(count: number = 1): string[] {
        if (this.heap.length === 0) return [];
        return this.heap
            .slice(0, Math.min(count, this.heap.length))
            .map(item => item.response);
    }

    // حذف پاسخ‌های قدیمی یا کم‌امتیاز
    pruneOld(maxAgeHours: number = 24) {
        const now = Date.now();
        const threshold = now - maxAgeHours * 60 * 60 * 1000;
        this.heap = this.heap.filter(item => item.timestamp >= threshold);
        this.rebuildHeap();
    }

    // محاسبه امتیاز پاسخ
    private calculateScore(response: string, queryTokens: string[], source?: string): number {
        let score = 1; // امتیاز پایه
        const tokens = this.tokenize(response);

        // تطبیق با موضوعات
        for (const [topic, keywords] of Object.entries(Config.keywords || {})) {
            if (tokens.some(token => keywords.includes(token))) {
                score += 2; // امتیاز برای تطبیق موضوع
            }
        }

        // تطبیق با ورودی کاربر
        const queryMatch = queryTokens.filter(qt => tokens.includes(qt)).length;
        score += queryMatch * 1.5;

        // احساسات
        const positiveCount = tokens.filter(t => this.positiveWords.has(t)).length;
        const negativeCount = tokens.filter(t => this.negativeWords.has(t)).length;
        score += positiveCount * 0.5 - negativeCount * 0.5;

        // امتیاز بر اساس منبع
        if (source === "Wikipedia") score += 3;
        else if (source === "SerpAPI") score += 2;

        // امتیاز برای تازگی
        score += 1 / (1 + (Date.now() - this.heap.length * 1000) / 3600000); // کاهش با زمان

        return score;
    }

    // تبدیل پاسخ به لحن کودکانه
    private rephraseChildlike(text: string): string {
        let result = text
            .replace(/است/g, "هست")
            .replace(/می‌باشد/g, "هست")
            .replace(/بسیار/g, "خیلی")
            .replace(/همچنین/g, "مثلاً")
            .replace(/بنابراین/g, "واسه همین")
            .replace(/\s+/g, " ")
            .trim();

        if (this.positiveWords.size > 0) {
            const positiveWord = Array.from(this.positiveWords)[0];
            result = `${result} وای، این ${positiveWord}ه! 😊`;
        }
        return result;
    }

    // توکن‌سازی متن
    private tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^\u0600-\u06FF\s]/g, "")
            .replace(/[.,!?;:؟]/g, " ")
            .split(/\s+/)
            .filter(token => token.length > 1);
    }

    // Heapify up
    private heapifyUp(index: number) {
        let current = index;
        while (current > 0) {
            const parentIndex = Math.floor((current - 1) / 2);
            if (this.heap[current].score > this.heap[parentIndex].score) {
                [this.heap[current], this.heap[parentIndex]] = [
                    this.heap[parentIndex],
                    this.heap[current]
                ];
                current = parentIndex;
            } else {
                break;
            }
        }
    }

    // Heapify down
    private heapifyDown(index: number) {
        let current = index;
        const length = this.heap.length;

        while (true) {
            let maxIndex = current;
            const leftChild = 2 * current + 1;
            const rightChild = 2 * current + 2;

            if (
                leftChild < length &&
                this.heap[leftChild].score > this.heap[maxIndex].score
            ) {
                maxIndex = leftChild;
            }
            if (
                rightChild < length &&
                this.heap[rightChild].score > this.heap[maxIndex].score
            ) {
                maxIndex = rightChild;
            }

            if (maxIndex !== current) {
                [this.heap[current], this.heap[maxIndex]] = [
                    this.heap[maxIndex],
                    this.heap[current]
                ];
                current = maxIndex;
            } else {
                break;
            }
        }
    }

    // حذف پاسخ با کمترین امتیاز
    private removeLowest() {
        if (this.heap.length <= 1) {
            this.heap = [];
            return;
        }
        const minIndex = this.heap.reduce((minIdx, item, idx, arr) =>
            item.score < arr[minIdx].score ? idx : minIdx, 0);
        this.heap[minIndex] = this.heap[this.heap.length - 1];
        this.heap.pop();
        this.heapifyDown(minIndex);
    }

    // بازسازی هیپ بعد از حذف
    private rebuildHeap() {
        for (let i = Math.floor(this.heap.length / 2) - 1; i >= 0; i--) {
            this.heapifyDown(i);
        }
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