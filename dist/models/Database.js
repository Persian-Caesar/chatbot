"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Database {
    db;
    constructor(db) {
        this.db = db;
        return this;
    }
    async has(name) {
        if (await this.db.has(name))
            return true;
        else
            return false;
    }
    async get(name) {
        if (await this.db.has(name))
            return await this.db.get(name);
        else
            return false;
    }
    async set(name, input) {
        return await this.db.set(name, input);
    }
    async push(name, input) {
        return await this.db.push(name, input);
    }
    async pull(name, input) {
        return await this.db.pull(name, input);
    }
    async add(name, input) {
        return await this.db.add(name, input);
    }
    async sub(name, input) {
        return await this.db.sub(name, input);
    }
    async delete(name) {
        return await this.db.delete(name);
    }
    async deleteAll() {
        return await this.db.deleteAll();
    }
    async all() {
        return await this.db.all();
    }
}
exports.default = Database;
/**
 * @copyright
 * Code by Sobhan-SRZA (mr.sinre) | https://github.com/Sobhan-SRZA
 * Developed for Persian Caesar | https://github.com/Persian-Caesar | https://dsc.gg/persian-caesar
 *
 * If you encounter any issues or need assistance with this code,
 * please make sure to credit "Persian Caesar" in your documentation or communications.
 */ 
//# sourceMappingURL=Database.js.map