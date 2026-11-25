// node tests/a11y.mjs
// Serves this repo and runs axe-core in headless Chrome.
// Fails on serious or critical violations. Moderate and minor results are printed, not failed.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';
import puppeteer from 'puppeteer';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const axePath = require.resolve('axe-core');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'narrow', width: 390, height: 844 },
];

const FAIL_IMPACTS = new Set(['serious', 'critical']);

// Axe leaves color-contrast incomplete when a gradient is behind the text.
// Sample the painted background and apply the same WCAG AA ratios axe uses.
function decodePNG(buf) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idats = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    offset += 4;
    const type = buf.subarray(offset, offset + 4).toString('ascii');
    offset += 4;
    const data = buf.subarray(offset, offset + length);
    offset += length + 4;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idats));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const pixels = [];
  let index = 0;
  const prev = Buffer.alloc(stride);
  const row = Buffer.alloc(stride);
  const paeth = (left, up, upLeft) => {
    const estimate = left + up - upLeft;
    const pa = Math.abs(estimate - left);
    const pb = Math.abs(estimate - up);
    const pc = Math.abs(estimate - upLeft);
    if (pa <= pb && pa <= pc) return left;
    return pb <= pc ? up : upLeft;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = raw[index];
    index += 1;
    for (let x = 0; x < stride; x += 1) row[x] = raw[index++];
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? row[x - bpp] : 0;
      const up = prev[x];
      const upLeft = x >= bpp ? prev[x - bpp] : 0;
      let value = row[x];
      if (filter === 1) value = (value + left) & 255;
      else if (filter === 2) value = (value + up) & 255;
      else if (filter === 3) value = (value + ((left + up) >> 1)) & 255;
      else if (filter === 4) value = (value + paeth(left, up, upLeft)) & 255;
      row[x] = value;
    }
    for (let x = 0; x < width; x += 1) {
      pixels.push([row[x * bpp], row[x * bpp + 1], row[x * bpp + 2]]);
    }
    row.copy(prev);
  }
  return pixels;
}

function channel(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(fg, bg) {
  const lum = (rgb) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  const lighter = Math.max(lum(fg), lum(bg));
  const darker = Math.min(lum(fg), lum(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

async function renderedContrast(page, selector) {
  const info = await page.$eval(selector, (el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const match = style.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    el.dataset.a11yColor = el.style.color;
    el.style.color = 'transparent';
    return {
      color: match ? match.slice(1, 4).map(Number) : null,
      fontSize: parseFloat(style.fontSize),
      weight: Number.parseInt(style.fontWeight, 10) || 400,
      x: rect.x,
      y: rect.y,
      w: rect.width,
      h: rect.height,
    };
  });
  if (!info?.color || info.w < 8 || info.h < 8) {
    await page.$eval(selector, (el) => {
      el.style.color = el.dataset.a11yColor || '';
      delete el.dataset.a11yColor;
    });
    return null;
  }
  const clip = {
    x: Math.max(0, info.x + 6),
    y: Math.max(0, info.y + info.h / 2 - 2),
    width: Math.max(1, Math.min(info.w - 12, 280)),
    height: 4,
  };
  let png;
  try {
    png = await page.screenshot({ clip, type: 'png' });
  } finally {
    await page.$eval(selector, (el) => {
      el.style.color = el.dataset.a11yColor || '';
      delete el.dataset.a11yColor;
    });
  }
  const ratios = decodePNG(png).map((pixel) => contrastRatio(info.color, pixel)).sort((a, b) => a - b);
  const picked = ratios[Math.floor(ratios.length * 0.35)] ?? ratios[0];
  const large = info.fontSize >= 24 || (info.weight >= 700 && info.fontSize >= 18.66);
  return { selector, ratio: picked, need: large ? 3 : 4.5 };
}

async function checkRenderedContrast(page, label, selectors) {
  const failures = [];
  for (const selector of selectors) {
    const found = await page.$(selector);
    if (!found) throw new Error(`${label}: missing ${selector}`);
    await page.$eval(selector, (el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    const sample = await renderedContrast(page, selector);
    if (!sample) continue;
    const ok = sample.ratio + 0.05 >= sample.need;
    console.log(`  ${ok ? 'pass' : 'FAIL'} rendered contrast ${sample.selector}: ${sample.ratio.toFixed(2)}:1 (need ${sample.need}:1)`);
    if (!ok) failures.push(sample);
  }
  const placeholder = await page.$('#q');
  if (placeholder) {
    const colors = await page.$eval('#q', (el) => {
      const text = getComputedStyle(el, '::placeholder');
      const field = getComputedStyle(el);
      const parse = (value) => value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/).slice(1, 4).map(Number);
      return { fg: parse(text.color), bg: parse(field.backgroundColor) };
    });
    const ratio = contrastRatio(colors.fg, colors.bg);
    const ok = ratio + 0.05 >= 4.5;
    console.log(`  ${ok ? 'pass' : 'FAIL'} placeholder contrast #q: ${ratio.toFixed(2)}:1 (need 4.5:1)`);
    if (!ok) failures.push({ selector: '#q::placeholder', ratio, need: 4.5 });
  }
  return failures;
}

function startServer() {
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = path.resolve(root, '.' + pathname);
      if (file !== root && !file.startsWith(root + path.sep)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      const body = readFileSync(file);
      const type = MIME[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(body);
    } catch (error) {
      const missing = error && error.code === 'ENOENT';
      res.writeHead(missing ? 404 : 500).end(missing ? 'Not found' : 'Error');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

function chromePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

async function runAxe(page) {
  const ready = await page.evaluate(() => typeof window.axe !== 'undefined');
  if (!ready) await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const results = await window.axe.run(document, { resultTypes: ['violations'] });
    return results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes.map((node) => ({
        impact: node.impact,
        target: node.target,
        html: node.html,
        failureSummary: node.failureSummary,
      })),
    }));
  });
}

function oneLine(value, max = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function printReport(report) {
  console.log(`\n${report.name}`);
  if (!report.violations.length) {
    console.log('  no violations');
    return { failing: 0, noted: 0 };
  }
  let failing = 0;
  let noted = 0;
  const ordered = [...report.violations].sort((a, b) => {
    const rank = (impact) => (FAIL_IMPACTS.has(impact) ? 0 : 1);
    return rank(a.impact) - rank(b.impact);
  });
  for (const violation of ordered) {
    const fails = FAIL_IMPACTS.has(violation.impact);
    if (fails) failing += 1;
    else noted += 1;
    const label = fails ? 'FAIL' : 'note';
    console.log(`  ${label} [${violation.impact}] ${violation.id}: ${violation.help} (${violation.nodes.length})`);
    console.log(`    ${violation.helpUrl}`);
    for (const node of violation.nodes.slice(0, 6)) {
      console.log(`    - ${node.target.map(String).join(' ')}`);
      const summary = oneLine(String(node.failureSummary || '').split('\n').find((line) => line.trim()) || node.failureSummary);
      if (summary) console.log(`      ${summary}`);
      console.log(`      ${oneLine(node.html)}`);
    }
    if (violation.nodes.length > 6) console.log(`    … ${violation.nodes.length - 6} more`);
  }
  return { failing, noted };
}

async function checkHome(page, origin) {
  await page.goto(`${origin}/`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('main h1');
  return { name: `home /`, violations: await runAxe(page) };
}

async function checkTracker(page, origin) {
  await page.goto(`${origin}/tracker/`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#cards article.card');
  await page.waitForFunction(() => /\d+%/.test(document.querySelector('#pct')?.textContent || ''));
  const cards = await page.$$eval('#cards article.card', (nodes) => nodes.length);
  if (cards < 1) throw new Error('tracker rendered no cards');
  return { name: `tracker /tracker/ (${cards} cards)`, violations: await runAxe(page) };
}

async function checkDeck(page, origin) {
  await page.goto(`${origin}/deck/`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.slide.active');
  const labels = await page.$$eval('.slide', (slides) => slides.map((slide) => slide.getAttribute('aria-label') || 'untitled'));
  if (labels.length < 2) throw new Error(`expected multiple slides, found ${labels.length}`);

  const reports = [];
  for (let index = 0; index < labels.length; index += 1) {
    if (index > 0) {
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction((expected) => {
        const slides = [...document.querySelectorAll('.slide')];
        const active = slides.findIndex((slide) => slide.classList.contains('active'));
        return active === expected;
      }, {}, index);
    }
    const position = await page.$eval('#count', (node) => node.textContent.trim());
    const expected = `${index + 1} / ${labels.length}`;
    if (position !== expected) {
      throw new Error(`keyboard navigation landed on "${position}", expected "${expected}" (${labels[index]})`);
    }
    reports.push({
      name: `deck slide ${index + 1}/${labels.length} “${labels[index]}”`,
      violations: await runAxe(page),
    });
  }

  await page.keyboard.press('Home');
  await page.waitForFunction(() => document.querySelector('#count')?.textContent.trim().startsWith('1 /'));
  await page.keyboard.press('End');
  await page.waitForFunction((total) => document.querySelector('#count')?.textContent.trim() === `${total} / ${total}`, {}, labels.length);
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction((total) => document.querySelector('#count')?.textContent.trim() === `${total - 1} / ${total}`, {}, labels.length);

  return reports;
}

async function main() {
  const { server, origin } = await startServer();
  const executablePath = chromePath();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    ...(executablePath ? { executablePath } : {}),
  });

  let failing = 0;
  let noted = 0;
  let pages = 0;
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    for (const viewport of VIEWPORTS) {
      await page.setViewport(viewport);
      console.log(`\n=== ${viewport.name} ${viewport.width}×${viewport.height} ===`);
      const reports = [
        await checkHome(page, origin),
        ...(await checkDeck(page, origin)),
        await checkTracker(page, origin),
      ];
      for (const report of reports) {
        const counts = printReport({ ...report, name: `[${viewport.name}] ${report.name}` });
        failing += counts.failing;
        noted += counts.noted;
        pages += 1;
      }
      console.log(`\n[${viewport.name}] rendered contrast (gradient text axe cannot score)`);
      await page.goto(`${origin}/`, { waitUntil: 'networkidle0' });
      const homeContrast = await checkRenderedContrast(page, 'home', ['.by', '.thesis small', '.card p']);
      await page.goto(`${origin}/deck/#14`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.querySelector('.slide.active')?.getAttribute('aria-label') === 'Close');
      const deckContrast = await checkRenderedContrast(page, 'deck', ['.slide.active .attrib', '.slide.active .blake']);
      await page.goto(`${origin}/tracker/`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('#cards article.card');
      const trackerContrast = await checkRenderedContrast(page, 'tracker', ['.method', '.legend', '.tag', '.lede']);
      failing += homeContrast.length + deckContrast.length + trackerContrast.length;
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`\n${pages} page states. ${failing} serious/critical or contrast failure${failing === 1 ? '' : 's'}, ${noted} moderate/minor noted.`);
  if (failing > 0) {
    console.error('Accessibility check failed.');
    process.exit(1);
  }
  console.log('Accessibility check passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
