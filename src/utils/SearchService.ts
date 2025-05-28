export class SearchService {
    private readonly WIKI_API = "https://fa.wikipedia.org/w/api.php";

    async searchWeb(query: string): Promise<string[]> {
        try {
            const results = await Promise.allSettled([
                this.searchDuckDuckGo(query),
                this.searchWikipedia(query)
            ]);

            return this.processResults(results);
        } catch (error) {
            console.error("خطا در جستجوی کلی:", error);
            return [];
        }
    }

    private async searchDuckDuckGo(query: string) {
        try {
            const res = await fetch(
                `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1`
            );

            if (!res.ok)
                throw new Error(`HTTP error! status: ${res.status}`);

            return await res.json();
        } catch (error) {
            console.error("خطا در جستجوی DuckDuckGo:", error);
            return null;
        }
    }

    private async searchWikipedia(query: string) {
        try {
            const params = new URLSearchParams({
                action: "query",
                list: "search",
                srsearch: query,
                format: "json",
                utf8: "",
                srlimit: "5"
            });

            const res = await fetch(`${this.WIKI_API}?${params}`);

            if (!res.ok)
                throw new Error(`HTTP error! status: ${res.status}`);

            return await res.json();
        } catch (error) {
            console.error("خطا در جستجوی ویکی‌پدیا:", error);
            return null;
        }
    }

    private processResults(results: PromiseSettledResult<any>[]): string[] {
        const extracted: string[] = [];

        results.forEach(result => {
            if (result.status === "fulfilled" && result.value) {
                extracted.push(...this.extractText(result.value));
            }
        });

        // حذف نتایج تکراری و کوتاه
        return [...new Set(extracted)]
            .filter(text => text && text.length > 20)
            .slice(0, 5);
    }

    private extractText(data: any): string[] {
        const results: string[] = [];

        // DuckDuckGo results
        if (data?.AbstractText) {
            results.push(data.AbstractText);
        }

        if (data?.Results) {
            results.push(...data.Results
                .filter((r: any) => r.Text)
                .map((r: any) => r.Text)
            );
        }

        // Wikipedia results
        if (data?.query?.search) {
            results.push(...data.query.search
                .filter((s: any) => s.snippet)
                .map((s: any) => this.cleanSnippet(s.snippet))
            );
        }

        return results;
    }

    // حذف تگ‌های HTML و کاراکترهای خاص
    private cleanSnippet(snippet: string): string {
        return snippet
            .replace(/<span class="searchmatch">|<\/span>/g, "")
            .replace(/&quot;/g, "\"")
            .replace(/&#39;/g, "'")
            .replace(/[^\u0600-\u06FF\s.,!?0-9]/g, "")
            .replace(/\s+/g, " ")
            .trim();
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