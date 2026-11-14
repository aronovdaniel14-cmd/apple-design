// Apple Design film renderer. Serves this folder, drives headless Chrome with GPU, and pipes frames to ffmpeg.
//
//   node render.mjs <film> stills 1.5,6,17      -> films/<film>/out/still_<t>.jpg   (check frames fast)
//   node render.mjs <film> sheet                -> films/<film>/out/sheet.jpg       (8-frame contact sheet)
//   node render.mjs <film> picture [fps]        -> films/<film>/out/picture.mp4     (silent, default 60 fps)
//   node render.mjs <film> final [fps]          -> <Film>_Launch_Film.mp4           (picture + out/score.wav)
//
// Run `python3 films/<film>/music.py` first: it writes out/score.wav and (if the film uses it) env.json.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.dirname(fileURLToPath(import.meta.url));
const [film, mode = 'sheet', arg] = process.argv.slice(2);
if (!film || !fs.existsSync(path.join(root, 'films', film, 'index.html'))) {
  console.error('Usage: node render.mjs <film> stills|sheet|picture|final [arg]\nFilms: ' + fs.readdirSync(path.join(root, 'films')).join(', '));
  process.exit(1);
}
const dir = path.join(root, 'films', film), OUT = path.join(dir, 'out');
fs.mkdirSync(OUT, { recursive: true });

const CHROME = process.env.CHROME_PATH || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('Chrome not found. Set CHROME_PATH.'); process.exit(1); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(root, u === '/' ? `films/${film}/index.html` : u);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const port = server.address().port;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await browser.newPage();
page.on('pageerror', e => console.error('PAGE ERROR', e.message));
page.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/GPU stall|ReadPixels/.test(m.text())) console.error('console:', m.text().slice(0, 400)); });
await page.goto(`http://127.0.0.1:${port}/films/${film}/index.html`, { waitUntil: 'load' });
await page.waitForFunction('window.READY===true', { timeout: 120000 });
const SECS = Number(process.env.SECS ?? await page.evaluate(() => window.DURATION ?? 34));
const shot = async t => { await page.evaluate(t => window.renderAt(t), t); return page.screenshot({ type: 'jpeg', quality: 98, optimizeForSpeed: false }); };
const ff = (args, opts) => spawn('ffmpeg', ['-y', '-loglevel', 'error', ...args], opts);

if (mode === 'stills' || mode === 'sheet') {
  const times = mode === 'stills' ? arg.split(',').map(Number) : Array.from({ length: 8 }, (_, i) => +(SECS * (i + .5) / 8).toFixed(2));
  const files = [];
  for (const t of times) { const f = path.join(OUT, `still_${t.toFixed(2).padStart(5, '0')}.jpg`); fs.writeFileSync(f, await shot(t)); files.push(f); }
  if (mode === 'sheet') {
    const inputs = files.flatMap(f => ['-i', f]);
    const fc = files.map((_, i) => `[${i}]scale=960:-1[s${i}]`).join(';') + ';' + files.map((_, i) => `[s${i}]`).join('') + `xstack=inputs=8:layout=0_0|w0_0|0_h0|w0_h0|0_h0+h1|w0_h0+h1|0_h0+h1+h2|w0_h0+h1+h2`;
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', fc, '-q:v', '3', path.join(OUT, 'sheet.jpg')], { stdio: 'inherit' });
    console.log('sheet:', path.join(OUT, 'sheet.jpg'), 'times', times.join(', '));
  } else console.log('stills:', files.join('\n'));
} else if (mode === 'picture' || mode === 'final') {
  const fps = Number(arg ?? 60), n = Math.round(fps * SECS), t0 = Date.now();
  const pic = path.join(OUT, 'picture.mp4');
  const enc = ff(['-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '15',
    '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', pic], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < n; i++) {
    const buf = await shot(i / fps);
    if (!enc.stdin.write(buf)) await new Promise(r => enc.stdin.once('drain', r));
    if (i % fps === 0) process.stdout.write(`\rframe ${i}/${n}  ${((Date.now() - t0) / (i + 1)).toFixed(0)} ms/frame   `);
  }
  enc.stdin.end(); await new Promise(r => enc.on('close', r));
  console.log(`\npicture done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (mode === 'final') {
    const wav = path.join(OUT, 'score.wav');
    if (!fs.existsSync(wav)) console.error(`No ${wav}. Run: python3 films/${film}/music.py`);
    else {
      const name = film.charAt(0).toUpperCase() + film.slice(1);
      const final = path.join(root, `${name}_Launch_Film.mp4`);
      spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', pic, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', final], { stdio: 'inherit' });
      console.log('final:', final);
    }
  }
}
await browser.close();
server.close();
