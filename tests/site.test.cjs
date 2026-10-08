const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const siteRoot = path.join(root, 'docs');
let server;
let browser;
let baseUrl;

function contentType(filePath) {
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  }[path.extname(filePath)] || 'application/octet-stream';
}

before(async () => {
  assert.ok(fs.existsSync(path.join(siteRoot, 'index.html')), 'docs/index.html must exist');

  server = http.createServer((req, res) => {
    const cleanPath = decodeURIComponent(req.url.split('?')[0]);
    const requested = cleanPath === '/' ? '/index.html' : cleanPath;
    const filePath = path.resolve(siteRoot, `.${requested}`);

    if (!filePath.startsWith(siteRoot) || !fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.SITE_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  browser = await chromium.launch({ headless: true, executablePath });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('visitor can understand the skill and reach both primary destinations', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  await assert.doesNotReject(() => page.getByRole('heading', { level: 1, name: 'SEO Blog Writer' }).waitFor());
  assert.equal(await page.locator('meta[name="description"]').getAttribute('content'), 'Từ một từ khóa đến bài blog SEO tiếng Việt, bộ ảnh minh họa và bản nháp WordPress — theo một quy trình rõ ràng, có kiểm tra.');

  const openSkill = page.getByRole('link', { name: 'Mở skill trong ChatGPT' });
  const readGuide = page.getByRole('link', { name: 'Đọc hướng dẫn đầy đủ' });
  assert.match(await openSkill.getAttribute('href'), /^https:\/\/chatgpt\.com\/skills\?/);
  assert.equal(await readGuide.getAttribute('href'), 'https://github.com/trinhtphat/seo-blog-writer-skill/blob/main/SKILL.md');

  await page.close();
});

test('social metadata points to a valid 1200 by 630 preview image', async () => {
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  assert.equal(await page.locator('meta[property="og:title"]').getAttribute('content'), 'SEO Blog Writer — Viết blog SEO tiếng Việt bằng ChatGPT');
  assert.equal(await page.locator('meta[property="og:image"]').getAttribute('content'), 'https://trinhtphat.github.io/seo-blog-writer-skill/assets/social-preview.png');

  const dimensions = await page.evaluate(async () => {
    const image = new Image();
    image.src = './assets/social-preview.png';
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
  assert.deepEqual(dimensions, { width: 1200, height: 630 });

  await page.close();
});

test('mobile layout has no horizontal overflow and keeps calls to action visible', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  const layout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    contentWidth: document.documentElement.scrollWidth,
  }));
  assert.equal(layout.contentWidth, layout.viewportWidth);

  for (const label of ['Mở skill trong ChatGPT', 'Đọc hướng dẫn đầy đủ']) {
    assert.equal(await page.getByRole('link', { name: label }).isVisible(), true);
  }

  await page.close();
});
