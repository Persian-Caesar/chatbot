export class SearchService {
    /**
     * Searches the web for a query and returns simplified, child-friendly results.
     * Uses Google search and parses results with regex to avoid external dependencies.
     * @param query The search query provided by the user.
     * @returns A promise resolving to an array of child-friendly search results.
     */
    async searchWeb(query: string): Promise<string[]> {
        try {
            // Encode the query for URL
            const encodedQuery = encodeURIComponent(query.trim());
            const url = `https://www.google.com/search?q=${encodedQuery}&hl=fa`; // Persian language results

            // Fetch the search results
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            if (!response.ok) {
                console.error(`Search failed with status: ${response.status}`);
                return ['وای، یه مشکلی پیش اومد! 😅 یه چیز دیگه بپرس!'];
            }

            const html = await response.text();

            // Simple regex to extract snippets from Google results
            // Matches divs containing search result snippets
            const snippetRegex = /<div[^>]*class="[^"]*VwiC3b[^"]*"[^>]*>(.*?)(?:<\/div>|$)/gis;
            const snippets: string[] = [];
            let match;

            while ((match = snippetRegex.exec(html)) !== null && snippets.length < 3) {
                let snippet = match[1]
                    .replace(/<[^>]+>/g, '') // Remove HTML tags
                    .replace(/&[^;]+;/g, '') // Remove HTML entities
                    .trim();

                if (snippet && snippet.length > 20) {
                    // Simplify and make it child-friendly
                    snippet = this.makeChildFriendly(snippet);
                    if (snippet) snippets.push(snippet);
                }
            }

            if (snippets.length === 0) {
                return ['وای، درباره این چیزی پیدا نکردم! 😅 یه سؤال دیگه بپرس!'];
            }

            return snippets.map(s => `راستی، اینو پیدا کردم! ${s} 😄 بیشتر بگو ببینم چی می‌خوای!`);
        } catch (error) {
            console.error('Search error:', error);
            return ['وای، یه مشکلی پیش اومد! 😅 یه چیز دیگه بپرس!'];
        }
    }

    /**
     * Converts a text snippet into a child-friendly version.
     * Simplifies language, removes complex terms, and ensures tone matches an 8-year-old's style.
     * @param text The text to convert.
     * @returns A child-friendly version of the text, or empty string if unsuitable.
     */
    private makeChildFriendly(text: string): string {
        // Basic stop words to avoid complex or unsuitable content
        const stopWords = ['دانلود', 'خرید', 'فروش', 'قیمت', 'بزرگسال', '18+', 'رایگان'];
        if (stopWords.some(word => text.toLowerCase().includes(word))) {
            return '';
        }

        // Simplify the text
        let simplified = text
            .replace(/\b(?:است|هستند|می‌باشد|می‌شوند)\b/g, 'هست') // Normalize verbs
            .replace(/\bبسیار\b/g, 'خیلی') // Simplify adverbs
            .replace(/\bهمچنین\b/g, 'مثلاً') // Simplify connectors
            .replace(/\[.*?\]|\(.*?\)/g, '') // Remove citations or parentheses
            .trim();

        // Keep it short and sweet (max 100 chars)
        if (simplified.length > 100) {
            simplified = simplified.substring(0, 97) + '...';
        }

        // Ensure it’s not empty and sounds exciting
        if (simplified.length < 10) return '';
        return simplified.charAt(0).toUpperCase() + simplified.slice(1) + '!';
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