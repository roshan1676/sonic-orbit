import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const url = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const expected = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
const target = resolve(dirname(fileURLToPath(import.meta.url)), '../public/models/face_landmarker.task');
let bytes;
try { bytes = await readFile(target); } catch {}
if (!bytes || createHash('sha256').update(bytes).digest('hex') !== expected) {
  console.log('Downloading the pinned face-pose model from Google. This setup step needs internet; playback and camera processing do not.');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Model download failed (${response.status}).`);
  bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Model checksum mismatch. No file was written.');
  await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes);
}
console.log(`Tracking model ready: ${(bytes.length / 1048576).toFixed(1)} MB. Camera starts only when you enable it.`);
