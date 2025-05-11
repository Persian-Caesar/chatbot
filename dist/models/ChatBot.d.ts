import Database from "./Database";
export declare class ChatBot {
    private db;
    private contextKey;
    private markovKey;
    private kgKey;
    private stopWords;
    private sentiment;
    private search;
    constructor(db: Database, channelId?: string);
    private initSystem;
    reset(): Promise<void>;
    handleMessage(text: string): Promise<string>;
    private learn;
    private learnMarkov;
    private addKG;
    private extract;
    private queryKG;
    private findBest;
    private tokenize;
    private tf;
    private cosine;
    private faq;
    private template;
    private reply;
}
/**
 * @copyright
 * Code by Sobhan-SRZA (mr.sinre) | https://github.com/Sobhan-SRZA
 * Developed for Persian Caesar | https://github.com/Persian-Caesar | https://dsc.gg/persian-caesar
 *
 * If you encounter any issues or need assistance with this code,
 * please make sure to credit "Persian Caesar" in your documentation or communications.
 */ 
