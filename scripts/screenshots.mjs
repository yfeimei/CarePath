/**
 * Regenerates the screenshots used by the docs site in `docs/img/`.
 *
 * Playwright is deliberately NOT a dependency of this project — it is only
 * needed to refresh documentation images. To run this:
 *
 *   PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install -D playwright --no-save
 *   npm run build && PORT=3111 npm start &
 *   node scripts/screenshots.mjs
 *
 * It drives the installed Microsoft Edge (channel: 'msedge') rather than
 * downloading a browser.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.CAREPATH_URL ?? 'http://127.0.0.1:3111';
const OUT = new URL('../docs/img/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const DESKTOP = { width: 1180, height: 900 };
const PHONE = { width: 390, height: 844 };

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge' });

  // --- Receptionist desk, destination chosen ---
  const desk = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 2 });
  const deskPage = await desk.newPage();
  await deskPage.goto(`${BASE}/desk`, { waitUntil: 'networkidle' });
  await deskPage.selectOption('select', { label: 'Imaging (from Main Lobby)' });
  await deskPage.waitForTimeout(150);
  await shot(deskPage, 'desk-selected.png', { fullPage: false });

  // --- Receptionist desk, QR issued ---
  await deskPage.getByRole('button', { name: 'Create CarePath' }).click();
  await deskPage.waitForSelector('img[alt*="QR code"]');
  await deskPage.waitForTimeout(250);
  await shot(deskPage, 'desk-qr.png', { fullPage: false });

  // Grab the token so the visitor screens use a real, live pass.
  const href = await deskPage.evaluate(() => {
    const img = document.querySelector('img[alt*="QR code"]');
    return img ? img.getAttribute('alt') : null;
  });
  if (!href) throw new Error('QR did not render');

  const created = await deskPage.evaluate(async () => {
    const response = await fetch('/api/passes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeId: 'lobby-imaging' }),
    });
    return response.json();
  });
  const token = new URL(created.url).pathname.split('/r/')[1];

  // --- Front-desk lookup ---
  await deskPage.fill('input[placeholder="RP-4821"]', created.publicId);
  await deskPage.getByRole('button', { name: 'Look up' }).click();
  await deskPage.waitForTimeout(600);
  await deskPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await deskPage.waitForTimeout(200);
  await shot(deskPage, 'desk-lookup.png', { fullPage: false });
  await desk.close();

  // --- Visitor route page ---
  const phone = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const visitor = await phone.newPage();
  await visitor.goto(`${BASE}/r/${token}`, { waitUntil: 'networkidle' });
  await shot(visitor, 'visitor-route.png', { fullPage: false });

  // --- Lost help, mid-conversation ---
  await visitor.getByRole('link', { name: /lost/i }).click();
  await visitor.waitForURL('**/lost');
  await askAndCapture(visitor, 'I can see the blue mural', 'visitor-lost-answer.png');
  await visitor.reload({ waitUntil: 'networkidle' });
  await askAndCapture(visitor, 'what room is my mother in', 'visitor-lost-refusal.png');

  await phone.close();
  await browser.close();
  console.log('screenshots written to docs/img/');
}

async function shot(page, name, options) {
  await page.screenshot({ path: `${OUT}${name}`, ...options });
  console.log('  ✓', name);
}

/**
 * Ask the assistant something and capture the reply. Scrolls to the bottom
 * first: the fixed Call Front Desk bar otherwise clips the end of a long reply,
 * which makes for a screenshot that misrepresents the page.
 */
async function askAndCapture(page, message, name) {
  await page.fill('input[placeholder="I am near Elevator B"]', message);
  await page.getByRole('button', { name: 'Ask' }).click();
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(250);
  await shot(page, name, { fullPage: false });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
