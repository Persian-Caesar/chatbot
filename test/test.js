const { Database, default: ChatBot } = require("../dist/index");
const { QuickDB, JSONDriver } = require("quick.db");
const readline = require("readline");

const database = new Database(new QuickDB({ driver: new JSONDriver() }));
const chatBot = new ChatBot(database, "1");

const rl = readline.createInterface({
 input: process.stdin,
 output: process.stdout
});

const ask = (query) =>
 new Promise(resolve => rl.question(query, resolve));

(async () => {
 while (true) {
  const userPrompt = await ask("user: ");
  if (userPrompt.trim().toLowerCase() === "exit") break;

  const botAnswer = await chatBot.handleMessage(userPrompt);
  console.log("bot:", botAnswer);
 }
 rl.close();
})();

/**
 * @copyright
 * Code by Sobhan-SRZA (mr.sinre) | https://github.com/Sobhan-SRZA
 * Developed for Persian Caesar | https://github.com/Persian-Caesar | https://dsc.gg/persian-caesar
 *
 * If you encounter any issues or need assistance with this code,
 * please make sure to credit "Persian Caesar" in your documentation or communications.
 */