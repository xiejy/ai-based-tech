// Shared helpers for the demo-video tools (Playwright + a local static server).
const fs = require('fs');
const path = require('path');
const http = require('http');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return require('/opt/node22/lib/node_modules/playwright');
  }
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' };

// Serve the game folder on a random local port.
function serve(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
      const file = p.endsWith('/') ? path.join(p, 'index.html') : p;
      if (!file.startsWith(root) || !fs.existsSync(file)) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/` }));
  });
}

module.exports = { loadPlaywright, serve, GAME_ROOT: path.resolve(__dirname, '../..') };
