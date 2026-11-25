import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { resolve, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { TrackingBridge } from './tracking-bridge.mjs';
import { StemJobs, STEM_NAMES } from './stem-jobs.mjs';
import { VERSION, APP_NAME } from './public/version.js';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.mp4': 'video/mp4', '.webm': 'video/webm', '.m4v': 'video/mp4', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska' };
const PUBLIC = new Set(['sdk/spatial-audio.js','sdk/source-geometry.js','sdk/spatial-audio.d.ts','measured-hrtf.js', 'scene.css', 'scene-controls.js', 'scene-math.js', 'stem-player.js', 'camera-overlay.js', 'tracking-analysis.js', 'index.html', 'style.css', 'tracking.css', 'app.js', 'audio-engine.js', 'sound-settings.js', 'dsp-math.js', 'peak-guard.js', 'self-test.html', 'self-test.js', 'head-tracker.js', 'head-worker.js', 'head-pose.js', 'head-motion.js', 'orientation.js', 'tracking-hub.js', 'external-tracker.js']);

export function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new Error('Invalid range');
  let start, end;
  if (!match[1]) { const suffix = Number(match[2]); if (suffix <= 0) throw new Error('Invalid suffix'); start = Math.max(0, size - suffix); end = size - 1; }
  else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1; }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw new Error('Unsatisfiable range');
  return { start, end };
}

export async function inspectMedia(path) {
  const info = await stat(path);
  if (!info.isFile()) throw new Error('Choose a media file.');
  if (!MIME[extname(path).toLowerCase()]) throw new Error('Choose MP4, WebM, MKV, MOV, WAV, MP3, or OGG media.');
  let metadata = {};
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,channels,channel_layout,width,height', '-of', 'json', path], { timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 });
    const probe = JSON.parse(stdout), audio = probe.streams?.find(s => s.codec_type === 'audio');
    const video = probe.streams?.find(s => s.codec_type === 'video');
    metadata = { duration: Number(probe.format?.duration) || null, channels: audio?.channels || 0, layout: audio?.channel_layout || null, audioCodec: audio?.codec_name || null, videoCodec: video?.codec_name || null, width: video?.width, height: video?.height };
  } catch { metadata = { probeUnavailable: true }; }
  return { id: randomUUID(), path, name: basename(path), bytes: info.size, ...metadata };
}

export async function createApp({ initialPath, publicRoot = resolve(here, 'public'), trackingPort = Number(process.env.HEADTRACK_PORT || 4243) } = {}) {
  const tracking = new TrackingBridge(trackingPort), stems = new StemJobs(here);
  const pythonPath=resolve(here,'.venv-audio',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const pythonReady=await stat(pythonPath).then(info=>info.isFile()).catch(()=>false);
  const ffmpegReady=await run('ffmpeg',['-version'],{timeout:3000,windowsHide:true,maxBuffer:100000}).then(()=>true).catch(()=>false);
  let modelSetup;
  const token = randomBytes(24).toString('hex');
  const media = new Map();
  let initial = null;
  if (initialPath) { initial = await inspectMedia(resolve(initialPath)); media.set(initial.id, initial); }
  const describe = item => item ? { ...item, path: undefined, url: `/media/${item.id}` } : null;
  const json = (res, code, value) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || '';
      if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return json(res, 403, { error: 'Local access only.' });
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
      res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
      const url = new URL(req.url, `http://${host}`);
      if(req.method==='POST'&&['/api/tracking/model','/api/shutdown'].includes(url.pathname)){
        if(req.headers['x-360-token']!==token||req.headers.origin!==`http://${host}`)return json(res,403,{error:'Use this action from SonicOrbit only.'});
        if(url.pathname==='/api/shutdown'){
          json(res,200,{stopped:true});setImmediate(()=>{tracking.stop();stems.close();server.close();server.closeAllConnections();});return;
        }
        if(!modelSetup)modelSetup=run(process.execPath,[resolve(here,'scripts/setup-tracking.mjs')],{timeout:60000,windowsHide:true,maxBuffer:100000}).finally(()=>{modelSetup=null;});
        await modelSetup;return json(res,200,{ready:true});
      }
      const stemRoute = /^\/api\/stems\/([a-f0-9-]+)(\/cancel)?$/.exec(url.pathname);
      if (stemRoute) {
        const item = media.get(stemRoute[1]); if (!item) return json(res, 404, { error: 'Open this media in the player first.' });
        if (req.method === 'POST') {
          if (req.headers['x-360-token'] !== token || req.headers.origin !== `http://${host}`) return json(res, 403, { error: 'Prepare audio from this player only.' });
          if (stemRoute[2]) stems.cancel(item); else await stems.prepare(item);
        } else if (req.method !== 'GET' || stemRoute[2]) return json(res, 405, { error: 'Method not allowed.' });
        return json(res, 200, stems.describe(await stems.status(item), item.id));
      }
      if (req.method === 'POST' && ['/api/tracking/start', '/api/tracking/stop'].includes(url.pathname)) {
        if (req.headers['x-360-token'] !== token || req.headers.origin !== `http://${host}`) return json(res, 403, { error: 'Start tracker input from this player only.' });
        if (url.pathname.endsWith('/stop')) { tracking.stop(); return json(res, 200, tracking.status()); }
        return json(res, 200, await tracking.start());
      }
      if (req.method === 'GET' && url.pathname === '/api/tracking/events') return tracking.subscribe(req, res);
      if (req.method === 'GET' && url.pathname === '/api/session') return json(res, 200, { token, app:{name:APP_NAME,version:VERSION},features:{aiSeparation:pythonReady&&ffmpegReady},initial: describe(initial) });
      if (req.method === 'POST' && url.pathname === '/api/open') {
        if (req.headers['x-360-token'] !== token || req.headers.origin !== `http://${host}`) return json(res, 403, { error: 'Open media from this player only.' });
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 8192) return json(res, 413, { error: 'Request too large.' }); chunks.push(chunk); }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(res, 400, { error: 'Invalid media request.' }); }
        if (typeof body.path !== 'string' || !body.path.trim()) return json(res, 400, { error: 'Enter a local media path.' });
        const item = await inspectMedia(resolve(body.path.trim().replace(/^"|"$/g, ''))); media.set(item.id, item);
        return json(res, 200, describe(item));
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
      const stemAsset = /^\/stems\/([a-f0-9-]+)\/(vocals|drums|bass|other)\.wav$/.exec(url.pathname);
      if (url.pathname.startsWith('/media/') || stemAsset) {
        let item = media.get(stemAsset ? stemAsset[1] : url.pathname.slice(7));
        if (!item) return json(res, 404, { error: 'Media is not open in this session.' });
        if (stemAsset) {
          const job = await stems.status(item); if (job.state !== 'ready' || !STEM_NAMES.includes(stemAsset[2])) return json(res, 404, { error: 'Stems are not ready.' });
          item = { path: resolve(job.directory, stemAsset[2] + '.wav') };
        }
        const info = await stat(item.path);
        let range;
        try { range = parseRange(req.headers.range, info.size); } catch { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); return res.end(); }
        const headers = { 'Content-Type': MIME[extname(item.path).toLowerCase()], 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'Content-Length': range ? range.end - range.start + 1 : info.size };
        if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`;
        res.writeHead(range ? 206 : 200, headers);
        if (req.method === 'HEAD') return res.end();
        const stream = createReadStream(item.path, range || {});
        req.on('close', () => stream.destroy()); stream.on('error', () => res.destroy()); stream.pipe(res); return;
      }
      const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const vendor = {
        'vendor/vision_bundle.js': resolve(here, 'node_modules/@mediapipe/tasks-vision/vision_bundle.js'),
        'vendor/vision_bundle.mjs': resolve(here, 'node_modules/@mediapipe/tasks-vision/vision_bundle.mjs'),
        'vendor/wasm/vision_wasm_internal.js': resolve(here, 'node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js'),
        'vendor/wasm/vision_wasm_internal.wasm': resolve(here, 'node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm'),
        'vendor/wasm/vision_wasm_module_internal.js': resolve(here, 'node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.js'),
        'vendor/wasm/vision_wasm_module_internal.wasm': resolve(here, 'node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.wasm')
      };
      const hrtfAssets = ['hrtf/H3.json','hrtf/H17.json','hrtf/H3.bin','hrtf/H17.bin','hrtf/LICENSE.txt','hrtf/NOTICE.txt'];
      const brandAsset=/^brand\/(mark\.svg|icon-(16|32|48|128|256|512)\.png|sonic-orbit\.ico)$/.test(name);
      if (!PUBLIC.has(name) && name!=='version.js' && !brandAsset && !Object.hasOwn(vendor, name) && name !== 'models/face_landmarker.task' && !hrtfAssets.includes(name)) return json(res, 404, { error: 'Not found.' });
      const content = await readFile(vendor[name] || resolve(publicRoot, name));
      res.writeHead(200, { 'Content-Type': MIME[extname(name)] || ({'.json':'application/json','.bin':'application/octet-stream','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.ts':'text/plain; charset=utf-8'}[extname(name)]), 'Content-Length': content.length, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      json(res, error.code === 'ENOENT' ? 404 : 400, { error: error.code === 'ENOENT' ? 'File not found. Check the path.' : error.message || 'Unable to open media.' });
    }
  });
  server.requestTimeout = 30000;
  server.on('close', () => { tracking.stop(); stems.close(); });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mediaIndex = process.argv.indexOf('--media');
  const port = Number(process.env.PORT || 3600);
  const server = await createApp({ initialPath: mediaIndex >= 0 ? process.argv[mediaIndex + 1] : undefined });
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Open http://127.0.0.1:${port} or set PORT to another port.` : error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`SonicOrbit video lab: ${url}\nLocal playback only. Press Ctrl+C to stop.`);
    if (process.argv.includes('--open')) {
      if (process.platform === 'win32') spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      else console.log(`Open ${url} in your browser.`);
    }
  });
}
