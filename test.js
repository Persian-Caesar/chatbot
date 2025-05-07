const { Database, default: ChatBot } = require("./dist/index")
const { QuickDB, JSONDriver } = require("quick.db")
const database = new Database(new QuickDB({ driver: new JSONDriver() }))
const chatBot = new ChatBot(database, "1");
chatBot.handleMessage()