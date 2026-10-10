// Tiny static file server for local runs: `npm start`, then open :3000.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT ?? 3000);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;

  // Keep everything inside the project directory.
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(root, safe);

  if (!file.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  server.listen(port, () => {
    console.log(`🐼 Panda Tinder running at http://localhost:${port}`);
  });
}
