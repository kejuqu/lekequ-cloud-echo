"""Generate the game score with the same MLX backend as musicgen-mlx.
Run: python scripts/generate-music.py [track-id ...]
Requires mlx-audiocraft, numpy, soundfile and ffmpeg; uses Apple Metal.
"""
import json
import subprocess
import sys
from pathlib import Path
import mlx.core as mx
import numpy as np
import soundfile as sf
from mlx_audiocraft.models import MusicGen

root = Path(__file__).resolve().parents[1]
config = json.loads((root / 'scripts/music-prompts.json').read_text())
out = root / 'public/music'
out.mkdir(parents=True, exist_ok=True)
model = MusicGen.get_pretrained(config['model'])
model.set_generation_params(duration=config['duration'], top_k=250, temperature=1.0, cfg_coef=3.0)
def progress(done, total):
    if done % 100 == 0 or done == total:
        print(f'  {done}/{total} tokens', flush=True)
model.set_custom_progress_callback(progress)
for track in config['tracks']:
    if len(sys.argv) > 1 and track['id'] not in sys.argv[1:]:
        continue
    dest = out / (track['id'] + '.mp3')
    if dest.exists():
        continue
    print('Generating ' + track['id'], flush=True)
    mx.random.seed(track['seed'])
    wav = np.array(model.generate([track['prompt']], progress=True)[0]).T
    # Overlap the tail and head to produce a continuous wrap without a silent gap.
    if not np.isfinite(wav).all() or np.max(np.abs(wav)) < 1e-5:
        raise RuntimeError(f"Invalid or silent audio: {track['id']}")
    overlap = int(model.sample_rate * 1.5)
    fade = np.linspace(0, 1, overlap)[:, None]
    seam = wav[-overlap:] * (1 - fade) + wav[:overlap] * fade
    loop = np.concatenate([seam, wav[overlap:-overlap]])
    raw = out / (track['id'] + '.wav')
    sf.write(raw, loop, model.sample_rate)
    encoded = out / (track['id'] + '.tmp.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw), '-af',
                    'loudnorm=I=-20:TP=-2:LRA=9', '-codec:a', 'libmp3lame', '-b:a', '128k', str(encoded)], check=True)
    encoded.replace(dest)
    raw.unlink()
    print('Saved ' + str(dest), flush=True)
