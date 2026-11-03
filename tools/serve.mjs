#!/usr/bin/env node
// Serves dist/ on http://localhost:8080 (or $PORT) after a build.
//   npm run build && npm run serve
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

export function serve(port = Number(process.env.PORT) || 8080, root = ROOT) {
  return http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, path.normalize(p));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      if (fs.existsSync(file + '/index.html')) { res.writeHead(301, { location: p + '/' }); return res.end(); }
      res.writeHead(404); return res.end('not found');
    }
    res.writeHead(200, { 'content-type': `${TYPES[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` });
    fs.createReadStream(file).pipe(res);
  }).listen(port, '127.0.0.1');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!fs.existsSync(ROOT)) { console.error('✗ no dist/: run npm run build first'); process.exit(1); }
  const s = serve();
  s.on('listening', () => console.log(`http://localhost:${s.address().port}/`));
}
