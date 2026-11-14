#!/usr/bin/env node
// Apple Design exporter: renders a reel page frame by frame in headless Chrome and encodes an MP4 with ffmpeg.
//
//   node scripts/export.mjs my-reel.html [--out reel.mp4] [--fps 30] [--aspect 9:16] [--audio music.mp3] [--png]
//
// Needs: ffmpeg on PATH, and `npm install` in this folder (installs playwright-core).
// Uses your installed Google Chrome; set CHROME_PATH to use another Chromium build.
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const input = args.find(a => !a.startsWith("--") && !isFlagValue(a));
function isFlagValue(a) { const i = args.indexOf(a); return i > 0 && ["--out", "--fps", "--aspect", "--audio", "--from", "--to"].includes(args[i - 1]); }
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
if (!input) {
  console.error("Usage: node scripts/export.mjs <reel.html> [--out reel.mp4] [--fps 30] [--aspect 16:9|9:16|1:1|4:5] [--audio track.mp3] [--from s] [--to s] [--png]");
  process.exit(1);
}
const out = path.resolve(opt("--out", input.replace(/\.html?$/i, "") + ".mp4"));
const lossless = args.includes("--png");

let chromium;
try { ({ chromium } = await import("playwright-core")); }
catch { console.error("playwright-core is missing. Run `npm install` in the apple-design folder first."); process.exit(1); }

// Artifact pages have no <!doctype>; wrap them so the browser renders in standards mode.
const src = path.resolve(input);
let html = await readFile(src, "utf8");
if (!/^\s*<!doctype/i.test(html)) {
  html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>\n${html}\n</body></html>`;
}
const tmp = await mkdtemp(path.join(tmpdir(), "apple-design-"));
const page_file = path.join(path.dirname(src), `.reel-export-${process.pid}.html`); // same folder so relative images resolve
await writeFile(page_file, html);

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", e => console.error("Page error:", e.message));
  await page.goto(pathToFileURL(page_file).href, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.reel && window.reel.duration > 0);
  if (opt("--aspect")) await page.evaluate(a => window.reel.setAspect(a), opt("--aspect"));
  const [W, H] = await page.evaluate(() => window.reel.size);
  await page.setViewportSize({ width: W, height: H });
  await page.evaluate(() => { window.reel.setExport(true); return document.fonts.ready; });
  const fps = Number(opt("--fps", await page.evaluate(() => window.reel.fps)));
  const dur = await page.evaluate(() => window.reel.duration);
  const from = Number(opt("--from", 0)), to = Math.min(dur, Number(opt("--to", dur)));
  const frames = Math.round((to - from) * fps);

  const audio = opt("--audio");
  const ff = [
    "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-i", "-",
    ...(audio ? ["-i", path.resolve(audio)] : []),
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    ...(audio ? ["-c:a", "aac", "-b:a", "192k", "-af", `afade=t=out:st=${Math.max(0, to - from - 1.5)}:d=1.5`, "-shortest"] : []),
    out,
  ];
  const enc = spawn("ffmpeg", ff, { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((res, rej) => enc.on("close", c => (c === 0 ? res() : rej(new Error("ffmpeg exited " + c)))));

  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate(s => window.reel.seek(s), from + i / fps);
    const buf = await page.screenshot({ type: lossless ? "png" : "jpeg", quality: lossless ? undefined : 95, clip: { x: 0, y: 0, width: W, height: H } });
    if (!enc.stdin.write(buf)) await new Promise(r => enc.stdin.once("drain", r));
    if (i % fps === 0) process.stdout.write(`\rFrame ${i + 1}/${frames}  (${Math.round((i / frames) * 100)}%)`);
  }
  enc.stdin.end();
  await done;
  console.log(`\rWrote ${out}  ${W}x${H} @ ${fps}fps, ${(to - from).toFixed(1)}s, in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
} finally {
  await browser.close();
  await rm(page_file, { force: true });
  await rm(tmp, { recursive: true, force: true });
}
