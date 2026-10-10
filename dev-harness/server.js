/* YourVision Dev Harness server.
 *
 * Serves the harness page and proxies /api/leetcode to
 * https://leetcode.com/graphql (avoids browser CORS issues).
 *
 * Usage: node server.js [port]   (default 8080)
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2] || 8080);
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
    });
    res.end(data);
  });
}

function proxyLeetCode(req, res) {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const out = https.request(
      {
        hostname: 'leetcode.com',
        path: '/graphql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Referer: 'https://leetcode.com/',
        },
      },
      (up) => {
        res.writeHead(up.statusCode, { 'Content-Type': 'application/json' });
        up.pipe(res);
      }
    );
    out.on('error', (e) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
    });
    out.end(body);
  });
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === '/api/leetcode' && req.method === 'POST') {
      return proxyLeetCode(req, res);
    }
    let p = url.pathname === '/' ? '/harness.html' : url.pathname;
    const file = path.join(ROOT, decodeURIComponent(p));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    serveFile(res, file);
  })
  .listen(PORT, () => {
    console.log(`Dev harness at http://localhost:${PORT}/`);
  });
