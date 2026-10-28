// Serves the repo under a strict CSP, loads demo/ in Chromium, counts CSP violations and
// console errors, and writes demo/shots/*.png. Needs `playwright` resolvable (NODE_PATH ok).
//   node test/csp-check.js        -> exit 0 only if 0 violations and 0 errors
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'";
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Content-Security-Policy': CSP });
    res.end(buf);
  });
});

const shots = [
  ['desktop-light.png', 1440, 'light'],
  ['desktop-dark.png', 1440, 'dark'],
  ['mobile-light.png', 390, 'light'],
];

server.listen(0, '127.0.0.1', async () => {
  const url = `http://127.0.0.1:${server.address().port}/demo/index.html`;
  const browser = await chromium.launch();
  const problems = [];
  try {
    fs.mkdirSync(path.join(ROOT, 'demo/shots'), { recursive: true });
    for (const [file, width, scheme] of shots) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: scheme });
      page.on('console', m => { if (m.type() === 'error' || /Content.Security.Policy/i.test(m.text())) problems.push(`${file}: ${m.text()}`); });
      page.on('pageerror', e => problems.push(`${file}: ${e.stack}`));
      await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e =>
        console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`)));
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      // exercise the interactive paths too: a mark click and a tooltip
      await page.click('[data-dv-mark="C"]');
      await page.click('[data-dv-mark="B"]');
      const box = await page.locator('#c-score').boundingBox();
      await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
      await page.waitForTimeout(300);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(ROOT, 'demo/shots', file), fullPage: true });
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  problems.forEach(p => console.log(p));
  console.log(`${problems.filter(p => /CSP/i.test(p)).length} CSP violations, ${problems.length} console problems total`);
  process.exit(problems.length ? 1 : 0);
});
