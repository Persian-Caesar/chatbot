const http = require('http');
const { Database, default: ChatBot } = require('../dist/index');
const { QuickDB, JSONDriver } = require('quick.db');

const db = new Database(new QuickDB({ driver: new JSONDriver() }));
const bot = new ChatBot(db, '1');
const PORT = 3000;
const server = http.createServer((req, res) => {
 if (req.method === 'OPTIONS') {
  res.writeHead(204, {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Methods': 'POST, OPTIONS',
   'Access-Control-Allow-Headers': 'Content-Type',
  });
  return res.end();
 }

 if (req.url === '/chat' && req.method === 'POST') {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
   try {
    const { message } = JSON.parse(body);
    const reply = await bot.handleMessage(message);

    res.writeHead(200, {
     'Content-Type': 'application/json',
     'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ reply }));
   } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
   }
  });
 }

 else {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
 }
});

server.listen(PORT, () => {
 console.log(`Server listening on http://localhost:${PORT}`);
});


/**
 * @copyright
 * Code by Sobhan-SRZA (mr.sinre) | https://github.com/Sobhan-SRZA
 * Developed for Persian Caesar | https://github.com/Persian-Caesar | https://dsc.gg/persian-caesar
 *
 * If you encounter any issues or need assistance with this code,
 * please make sure to credit "Persian Caesar" in your documentation or communications.
 */