// Usage: node render.mjs stills t1 t2 ...   |   node render.mjs video out.mp4
// PW may point at a playwright-core install outside the repo.
const { chromium } = await import(process.env.PW || 'playwright-core');
import { spawn } from 'node:child_process';
import path from 'node:path';
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const mode = process.argv[2] || 'stills';
const browser = await chromium.launch({ executablePath: exe, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.resolve('ad.html'));
await page.evaluate(() => document.fonts.ready);
if (mode === 'stills') {
  const out = process.env.OUT || 'stills';
  for (const t of process.argv.slice(3).map(Number)) {
    await page.evaluate(t => seek(t), t);
    await page.screenshot({ path: `${out}/t${t.toFixed(2)}.jpg`, type: 'jpeg', quality: 80 });
  }
} else {
  const fps = 30, dur = 30, out = process.argv[3] || 'video.mp4';
  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'medium', out], { stdio: ['pipe', 'ignore', 'inherit'] });
  for (let f = 0; f < fps * dur; f++) {
    await page.evaluate(t => seek(t), f / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 90 === 0) console.log('frame', f);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
}
await browser.close();
