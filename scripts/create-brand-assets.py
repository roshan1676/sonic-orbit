"""Render SonicOrbit's code-authored orbit mark for app launchers. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/brand';OUT.mkdir(parents=True,exist_ok=True)
image=Image.new('RGBA',(1024,1024),'#11180f');draw=ImageDraw.Draw(image)
draw.ellipse((152,152,872,872),outline='#bfdda2',width=34)
draw.ellipse((76,310,948,714),outline='#5f7950',width=22)
draw.polygon([(512,302),(650,652),(512,580),(374,652)],fill='#f1f3e8')
draw.ellipse((770,241,866,337),fill='#d5e8bf')
for size in [16,32,48,128,256,512]:image.resize((size,size),Image.Resampling.LANCZOS).save(OUT/f'icon-{size}.png')
image.save(OUT/'sonic-orbit.ico',sizes=[(16,16),(32,32),(48,48),(128,128),(256,256)])
print('Rendered SonicOrbit launcher assets.')
