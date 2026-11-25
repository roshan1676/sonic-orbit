import { createHash } from 'node:crypto';
import { stat, readFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

export const STEM_NAMES = ['vocals', 'drums', 'bass', 'other'];
export async function stemKey(path) {
  const info = await stat(path);
  return createHash('sha256').update(JSON.stringify([resolve(path), info.size, info.mtimeMs, 'htdemucs-4.1.0'])).digest('hex');
}
export class StemJobs {
  constructor(root) { this.root = root; this.jobs = new Map(); this.running = null; }
  async status(item) {
    if (this.jobs.has(item.id)) return this.jobs.get(item.id);
    const key = await stemKey(item.path), directory = join(this.root, '.cache', 'stems', key);
    let job = { state: 'idle', progress: 0, directory };
    try {
      const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
      if (manifest.model !== 'htdemucs' || !Number.isFinite(manifest.duration) || manifest.duration <= 0 || manifest.duration > 301 || !STEM_NAMES.every(name => manifest.stems?.some(s => s.name === name && s.file === name + '.wav'))) throw new Error('Invalid stem cache');
      await Promise.all(STEM_NAMES.map(name => stat(join(directory, name + '.wav'))));
      job = { state: 'ready', progress: 1, directory, duration: manifest.duration, model: manifest.model };
    } catch {}
    this.jobs.set(item.id, job); return job;
  }
  describe(job, id) {
    return { state: job.state, progress: job.progress, error: job.error, duration: job.duration, model: job.model,
      stems: job.state === 'ready' ? STEM_NAMES.map(name => ({ name, url: `/stems/${id}/${name}.wav` })) : undefined };
  }
  async prepare(item) {
    const job = await this.status(item);
    if (job.state === 'ready' || this.running?.job === job) return job;
    if (this.running) throw new Error('Another local separation is running. Wait for it or cancel it first.');
    const python = join(this.root, '.venv-audio', ...(process.platform==='win32'?['Scripts','python.exe']:['bin','python']));
    try { await stat(python); } catch { throw new Error('Local AI environment is missing. See the AI audio setup in README.md.'); }
    await mkdir(job.directory, { recursive: true });
    Object.assign(job, { state: 'starting', progress: 0, error: undefined });
    const child = spawn(python, [join(this.root, 'scripts', 'prepare-stems.py'), '--input', item.path, '--output', job.directory], { cwd: this.root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.running = { child, job }; let pending = '';
    child.stdout.on('data', chunk => {
      pending += chunk.toString(); const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) { try {
        const data = JSON.parse(line); if (data.state === 'ready') { job.state = 'saving'; job.progress = .99; }
        else Object.assign(job, { state: data.state, progress: data.progress, error: data.error });
      } catch {} }
    });
    child.stderr.on('data', () => {});
    child.on('error', error => { job.state = 'error'; job.error = error.message; if (this.running?.child === child) this.running = null; });
    child.on('close', async code => {
      if (this.running?.child === child) this.running = null;
      if (job.state === 'cancelled') return;
      if (code !== 0) { job.state = 'error'; job.error ||= 'Local separation failed. Check FFmpeg and the Python environment.'; return; }
      this.jobs.delete(item.id); const ready = await this.status(item);
      if (ready.state !== 'ready') { ready.state = 'error'; ready.error = 'Separation finished without a complete cache.'; }
    });
    return job;
  }
  cancel(item) { if (this.running?.job === this.jobs.get(item.id)) { this.running.job.state = 'cancelled'; this.running.child.kill(); } }
  close() { if (this.running) { this.running.job.state = 'cancelled'; this.running.child.kill(); } }
}
