"""Local offline music separation. Does not upload the selected video/audio."""
import argparse, json, os, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault('HF_HOME', str(ROOT / '.cache/models/huggingface'))
os.environ.setdefault('TORCH_HOME', str(ROOT / '.cache/models/torch'))
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ.setdefault('OMP_NUM_THREADS', '4')

def report(state, progress, **extra):
    print(json.dumps(dict(state=state, progress=progress, **extra)), flush=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--limit', type=float, default=300)
    args = parser.parse_args()
    output = Path(args.output).resolve(); output.mkdir(parents=True, exist_ok=True)
    import numpy as np
    import torch
    from scipy.io import wavfile
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    torch.set_num_threads(min(4, os.cpu_count() or 2))
    report('loading-model', 0.02)
    model = get_model('htdemucs'); model.eval()
    rate = model.samplerate
    report('decoding', 0.05)
    result = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(Path(args.input).resolve()), '-t', str(min(300, max(1, args.limit))), '-map', '0:a:0', '-ac', '2', '-ar', str(rate), '-f', 'f32le', 'pipe:1'], capture_output=True, check=True)
    samples = np.frombuffer(result.stdout, dtype='<f4').reshape(-1, 2).T.copy()
    if samples.shape[1] < rate // 10: raise RuntimeError('No usable audio was decoded.')
    mix = torch.from_numpy(samples)
    reference = mix.mean(0); mean = reference.mean(); std = reference.std().clamp(min=1e-6)
    normalized = (mix - mean) / std
    started = time.monotonic()
    def progress(event):
        if event.get('state') == 'end':
            offset = event.get('segment_offset', 0)
            report('separating', min(0.91, 0.08 + 0.82 * (offset + rate * 5) / samples.shape[1]), elapsed=round(time.monotonic()-started, 1))
    with torch.inference_mode():
        separated = apply_model(model, normalized[None], device='cpu', shifts=0, split=True, segment=5, overlap=0.25, num_workers=0, progress=False, callback=progress)[0]
        separated = separated * std + mean
    stems = []
    for index, name in enumerate(model.sources):
        wave = separated[index].detach().cpu().numpy().T.astype(np.float32)
        if not np.isfinite(wave).all(): raise RuntimeError('The separator produced invalid audio.')
        wavfile.write(output / (name + '.wav'), rate, wave)
        stems.append(dict(name=name, file=name+'.wav', peak=float(np.abs(wave).max())))
        report('saving', 0.92 + index * 0.015)
    duration = samples.shape[1] / rate
    manifest = dict(version=1, model='htdemucs', package='demucs==4.1.0', sampleRate=rate, duration=duration, maxDuration=300, stems=stems, elapsed=round(time.monotonic()-started, 1), sourceName=Path(args.input).name)
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf8')
    report('ready', 1, duration=duration, elapsed=manifest['elapsed'])

if __name__ == '__main__':
    try: main()
    except Exception as error:
        report('error', 0, error=str(error)); raise
