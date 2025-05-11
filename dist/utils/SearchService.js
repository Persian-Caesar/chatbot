"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchService = void 0;
class SearchService {
    WIKI_API = "https://fa.wikipedia.org/w/api.php";
    async searchWeb(query) {
        const sources = [
            this.searchDuckDuckGo(query),
            this.searchWikipedia(query),
        ];
        const results = await Promise.allSettled(sources);
        return this.processResults(results);
    }
    async searchDuckDuckGo(query) {
        const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`);
        return res.json();
    }
    async searchWikipedia(query) {
        const params = new URLSearchParams({
            action: "query",
            list: "search",
            srsearch: query,
            format: "json",
            utf8: ""
        });
        const res = await fetch(`${this.WIKI_API}?${params}`);
        return res.json();
    }
    processResults(results) {
        return results.flatMap(result => {
            if (result.status === "fulfilled") {
                return this.extractText(result.value);
            }
            return [];
        });
    }
    extractText(data) {
        if (data?.AbstractText)
            return [data.AbstractText];
        if (data?.query?.search)
            return data.query.search.map((s) => s.snippet);
        if (data?.Results)
            return data.Results.map((r) => r.Text);
        return [];
    }
}
exports.SearchService = SearchService;
/**
 * @copyright
 * Code by Sobhan-SRZA (mr.sinre) | https://github.com/Sobhan-SRZA
 * Developed for Persian Caesar | https://github.com/Persian-Caesar | https://dsc.gg/persian-caesar
 *
 * If you encounter any issues or need assistance with this code,
 * please make sure to credit "Persian Caesar" in your documentation or communications.
 */ 
//# sourceMappingURL=SearchService.js.map