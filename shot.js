import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import { setTimeout as wait } from 'timers/promises';

const env = { ...process.env, PORT: '3222', ADMIN_KEY: 'shot' };
const srv = spawn('node', ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let booted = false;
srv.stdout.on('data', d => { if (/running/.test(d.toString())) booted = true; });
for (let i = 0; i < 30 && !booted; i++) await wait(100);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// Desktop — step 1
let page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
await page.goto('http://localhost:3222', { waitUntil: 'networkidle' });
await page.screenshot({ path: 'shot-desktop-step1.png' });

// Desktop — advance to step 2 (career) to show chips
await page.fill('input[name="full_name"]', 'Dr Aisha Rahman');
await page.fill('input[name="email"]', 'aisha@nhs.net');
await page.click('#nextBtn');
await wait(400);
await page.click('#cs2'); // FY1
await page.screenshot({ path: 'shot-desktop-step2.png' });

// Mobile — step 1
let m = await browser.newPage({ viewport: { width: 390, height: 1400 } });
await m.goto('http://localhost:3222', { waitUntil: 'networkidle' });
await m.screenshot({ path: 'shot-mobile-step1.png' });

// Mobile — final step with consent (scroll shown via full page)
await m.fill('input[name="full_name"]', 'Dr Tom Okafor');
await m.fill('input[name="email"]', 'tom@nhs.net');
await m.click('#nextBtn'); await wait(300);
await m.click('#cs1'); await m.click('#nextBtn'); await wait(300);
await m.click('#nextBtn'); await wait(300);
await m.screenshot({ path: 'shot-mobile-step4.png', fullPage: true });

await browser.close();
srv.kill();
console.log('screenshots done');
process.exit(0);
