export declare class SearchService {
    private readonly WIKI_API;
    searchWeb(query: string): Promise<string[]>;
    private searchDuckDuckGo;
    private searchWikipedia;
    private processResults;
    private extractText;
}
/**
 * @copyright
 * Code by Sobhan-SRZA (mr.sinre) | https://github.com/Sobhan-SRZA
 * Developed for Persian Caesar | https://github.com/Persian-Caesar | https://dsc.gg/persian-caesar
 *
 * If you encounter any issues or need assistance with this code,
 * please make sure to credit "Persian Caesar" in your documentation or communications.
 */ 
