"""Build small directional HRIR assets from pinned SADIE II SOFA archives."""
from pathlib import Path
import io, json, zipfile, hashlib, shutil
import urllib.request
import h5py
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/hrtf'; OUT.mkdir(parents=True,exist_ok=True)
CACHE=ROOT/'.cache/hrtf';CACHE.mkdir(parents=True,exist_ok=True)
def download(name,expected):
    path=CACHE/name
    if not path.exists():
        print('Downloading SADIE II:',name,flush=True)
        urllib.request.urlretrieve('https://zenodo.org/records/12092466/files/'+name+'?download=1',path)
    if hashlib.sha256(path.read_bytes()).hexdigest()!=expected:raise RuntimeError('Checksum mismatch: '+name)
    return path
HASHES={'H3':'8f0b198245e872458313492879af77d0d3ef937eaedb141a9adbe1e69c26dbda','H17':'018e01ef8d11b59c56e0b0867131f1cc7b6c23cc950c51a65f091438f969da88'}
for subject,expected in HASHES.items():
    archive=download(f'{subject}_HRIR_SOFA.zip',expected)
    data=archive.read_bytes()
    if hashlib.sha256(data).hexdigest()!=expected: raise RuntimeError('Archive checksum mismatch')
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        name=next(n for n in z.namelist() if '_48K_24bit_256tap_' in n)
        with h5py.File(io.BytesIO(z.read(name)),'r') as f:
            positions=f['SourcePosition'][:]; impulses=f['Data.IR'][:]
            assert float(f['Data.SamplingRate'][0])==48000 and not np.any(f['Data.Delay'][:])
    radians=np.radians(positions[:,:2]);az,el=radians.T
    vectors=np.stack([np.cos(el)*np.cos(az),np.cos(el)*np.sin(az),np.sin(el)],axis=1)
    selected=[]
    for elevation in range(-90,91,15):
        for azimuth in range(0,360,15):
            a,e=np.radians([azimuth,elevation]);v=np.array([np.cos(e)*np.cos(a),np.cos(e)*np.sin(a),np.sin(e)])
            index=int(np.argmax(vectors@v))
            if index not in selected: selected.append(index)
    front=int(np.argmax(vectors@np.array([1,0,0])))
    # One common scalar per subject retains directional/ear level differences.
    scale=1/np.sqrt(np.mean(np.sum(impulses[front]**2,axis=-1)))
    packed=(impulses[selected]*scale).astype('<f4').tobytes()
    (OUT/f'{subject}.bin').write_bytes(packed)
    manifest=dict(version=1,subject=subject,sampleRate=48000,taps=256,positions=positions[selected,:2].round(3).tolist(),gain=float(scale),sha256=hashlib.sha256(packed).hexdigest(),source='https://zenodo.org/records/12092466',archiveSha256=expected,license='Apache-2.0')
    (OUT/f'{subject}.json').write_text(json.dumps(manifest),encoding='utf8')
    print(subject,len(selected),len(packed),'gain',round(scale,3))
shutil.copyfile(download('LICENSE.txt','49bbe9114e49214df2ccc324cb3ac8d1d1aa1c3a0947f94c286765e86647b32e'),OUT/'LICENSE.txt')
(OUT/'NOTICE.txt').write_text('SADIE II Database. Copyright 2018 University of York.\nMeasured by Cal Armstrong, Lewis Thresh and Gavin Kearney, Audio Lab, University of York.\nSource: https://zenodo.org/records/12092466\nReference: A Perceptual Evaluation of Individual and Non-Individual HRTFs: A Case Study of the SADIE II Database. DOI 10.3390/app8112029.\nThis prototype selects a subset of 48 kHz 256-tap HRIRs and applies one shared level scalar per subject. Directional filter transitions are crossfaded. These are not measurements of the current user.\n',encoding='utf8')
