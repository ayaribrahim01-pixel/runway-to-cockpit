// Render jobs with Remotion. Usage:
//   node render.mjs jobs.json
// jobs.json: [{"comp":"Lesson","props":"timeline.json","out":"video.mp4"},
//             {"comp":"Thumbnail","props":"thumb.json","out":"thumb.png","still":true},
//             {"comp":"Lesson","props":"timeline.json","out":"f.jpg","still":true,"frame":300},
//             {"comp":"Lesson","props":"timeline.json","out":"part.mp4","frames":[0,899]}]
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const jobsPath = process.argv[2];
if (!jobsPath) {
  console.error('usage: node render.mjs jobs.json');
  process.exit(1);
}
const jobs = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
const localShell = '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const browserExecutable = process.env.REMOTION_BROWSER || (fs.existsSync(localShell) ? localShell : null);
const concurrency = Number(process.env.RENDER_CONCURRENCY || Math.max(1, os.cpus().length));
// software WebGL so the 3D shots render on machines without a GPU (GitHub runners, this workspace)
const chromiumOptions = {gl: process.env.REMOTION_GL === 'none' ? null : process.env.REMOTION_GL || 'swangle'};

const t0 = Date.now();
console.log('[render] bundling…');
const serveUrl = await bundle({
  entryPoint: path.join(here, 'src', 'index.ts'),
  publicDir: path.join(here, 'public'),
  onProgress: () => {},
});
console.log(`[render] bundled in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

for (const job of jobs) {
  const inputProps = JSON.parse(fs.readFileSync(path.resolve(path.dirname(jobsPath), job.props), 'utf8'));
  const out = path.resolve(path.dirname(jobsPath), job.out);
  fs.mkdirSync(path.dirname(out), {recursive: true});
  const composition = await selectComposition({serveUrl, id: job.comp, inputProps, browserExecutable, chromiumOptions, logLevel: 'error'});
  const t1 = Date.now();
  if (job.still) {
    await renderStill({
      composition,
      serveUrl,
      output: out,
      inputProps,
      frame: job.frame ?? 0,
      browserExecutable,
      chromiumOptions,
      imageFormat: out.endsWith('.jpg') ? 'jpeg' : 'png',
      ...(out.endsWith('.jpg') ? {jpegQuality: 92} : {}),
      logLevel: 'error',
    });
    console.log(`[render] still ${job.comp}#${job.frame ?? 0} -> ${out} (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
    continue;
  }
  if (job.segments && job.segments.length > 1) {
    // split render: software WebGL only where a 3D shot is on screen, Chrome's normal (much faster) raster elsewhere
    const parts = [];
    for (let k = 0; k < job.segments.length; k++) {
      const seg = job.segments[k];
      const part = out.replace(/\.mp4$/, `.part${String(k).padStart(2, '0')}.mp4`);
      const segOpts = seg.gl ? {gl: seg.gl} : {gl: process.env.REMOTION_GL_2D || null};
      const comp2 = await selectComposition({serveUrl, id: job.comp, inputProps, browserExecutable, chromiumOptions: segOpts, logLevel: 'error'});
      const t2 = Date.now();
      await renderMedia({
        composition: comp2,
        serveUrl,
        codec: 'h264',
        outputLocation: part,
        inputProps,
        browserExecutable,
        chromiumOptions: segOpts,
        concurrency,
        muted: true,
        crf: job.crf ?? 19,
        x264Preset: job.preset ?? 'veryfast',
        pixelFormat: 'yuv420p',
        imageFormat: 'jpeg',
        jpegQuality: 92,
        frameRange: seg.frames,
        timeoutInMilliseconds: 120000,
        logLevel: 'error',
      });
      const n = seg.frames[1] - seg.frames[0] + 1;
      const el = (Date.now() - t2) / 1000;
      console.log(`[render] ${job.comp} segment ${k + 1}/${job.segments.length} frames ${seg.frames[0]}-${seg.frames[1]} (${seg.gl ? '3D' : '2D'}) ${n} frames in ${el.toFixed(0)}s, ${(n / Math.max(1, el)).toFixed(2)} fps`);
      parts.push(part);
    }
    const list = out.replace(/\.mp4$/, '.parts.txt');
    fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
    const {execFileSync} = await import('node:child_process');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]);
    for (const p of parts) fs.unlinkSync(p);
    fs.unlinkSync(list);
    console.log(`[render] ${job.comp} -> ${out} in ${((Date.now() - t1) / 1000).toFixed(0)}s (${job.segments.length} segments)`);
    continue;
  }
  let last = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: out,
    inputProps,
    browserExecutable,
    chromiumOptions,
    concurrency,
    muted: true,
    crf: job.crf ?? 19,
    x264Preset: job.preset ?? 'veryfast',
    pixelFormat: 'yuv420p',
    imageFormat: 'jpeg',
    jpegQuality: 92,
    frameRange: job.frames ?? null,
    timeoutInMilliseconds: 120000,
    logLevel: 'error',
    onProgress: ({progress, renderedFrames}) => {
      const pct = Math.floor(progress * 100);
      if (pct >= last + 5) {
        last = pct;
        const el = (Date.now() - t1) / 1000;
        console.log(`[render] ${job.comp} ${pct}% (${renderedFrames} frames, ${el.toFixed(0)}s, ${(renderedFrames / Math.max(1, el)).toFixed(1)} fps)`);
      }
    },
  });
  console.log(`[render] ${job.comp} -> ${out} in ${((Date.now() - t1) / 1000).toFixed(0)}s`);
}
console.log(`[render] all done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
