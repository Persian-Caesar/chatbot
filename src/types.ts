export interface MessageRecord {
    role: "system" | "user" | "assistant";
    content: string;
}
export interface Triple {
    subject: string;
    predicate: string;
    object: string;
}

export interface MarkovEntry {
    gram: string;
    next: Record<string, number>;
}
/**
 * @copyright
 * Code by Sobhan-SRZA (mr.sinre) | https://github.com/Sobhan-SRZA
 * Developed for Persian Caesar | https://github.com/Persian-Caesar | https://dsc.gg/persian-caesar
 *
 * If you encounter any issues or need assistance with this code,
 * please make sure to credit "Persian Caesar" in your documentation or communications.
 */