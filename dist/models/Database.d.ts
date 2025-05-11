import { QuickDB } from "quick.db";
export default class Database {
    db: QuickDB;
    constructor(db: QuickDB);
    has(name: string): Promise<boolean>;
    get(name: string): Promise<any>;
    set<T>(name: string, input: T): Promise<T>;
    push<T>(name: string, input: T | T[]): Promise<(T | T[])[]>;
    pull<T>(name: string, input: T | T[]): Promise<T[]>;
    add(name: string, input: number): Promise<number>;
    sub(name: string, input: number): Promise<number>;
    delete(name: string): Promise<number>;
    deleteAll(): Promise<number>;
    all(): Promise<{
        id: string;
        value: any;
    }[]>;
}
/**
 * @copyright
 * Code by Sobhan-SRZA (mr.sinre) | https://github.com/Sobhan-SRZA
 * Developed for Persian Caesar | https://github.com/Persian-Caesar | https://dsc.gg/persian-caesar
 *
 * If you encounter any issues or need assistance with this code,
 * please make sure to credit "Persian Caesar" in your documentation or communications.
 */ 
