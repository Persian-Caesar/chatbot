
export class SearchService {
 private readonly WIKI_API = "https://fa.wikipedia.org/w/api.php";

 async searchWeb(query: string) {
  const sources = [
   this.searchDuckDuckGo(query),
   this.searchWikipedia(query),
  ];

  const results = await Promise.allSettled(sources);
  return this.processResults(results);
 }

 private async searchDuckDuckGo(query: string) {
  const res = await fetch(
   `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`
  );
  return res.json();
 }

 private async searchWikipedia(query: string) {
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

 private processResults(results: PromiseSettledResult<any>[]) {
  return results.flatMap(result => {
   if (result.status === "fulfilled") {
    return this.extractText(result.value);
   }
   return [];
  });
 }

 private extractText(data: any): string[] {
  if (data?.AbstractText) return [data.AbstractText];

  if (data?.query?.search) return data.query.search.map((s: any) => s.snippet);

  if (data?.Results) return data.Results.map((r: any) => r.Text);

  return [];
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