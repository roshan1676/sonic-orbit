"""Build-time only: convert Deezer's MIT-licensed pretrained model to ONNX.

The installed player uses ONNX Runtime; Python/TensorFlow are not shipped.
See docs/native-windows.md for the pinned export environment and attribution.
"""
import os, json, hashlib, tarfile, urllib.request
from pathlib import Path
os.environ['CUDA_VISIBLE_DEVICES']='-1'
os.environ['TF_CPP_MIN_LOG_LEVEL']='2'
os.environ['TF_ENABLE_ONEDNN_OPTS']='0'
ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'.cache'/'spleeter';CACHE.mkdir(parents=True,exist_ok=True)
URL='https://github.com/deezer/spleeter/releases/download/v1.4.0/4stems.tar.gz'
archive=CACHE/'4stems.tar.gz'
if not archive.exists():
    print('Downloading official Deezer 4-stem model for the offline installer.',flush=True)
    urllib.request.urlretrieve(URL,archive)
expected='3adb4a50ad4eb18c7c4d65fcf4cf2367a07d48408a5eb7d03cd20067429dfaa8'
if hashlib.sha256(archive.read_bytes()).hexdigest()!=expected:raise RuntimeError('Official model archive checksum mismatch')
checkpoint=CACHE/'checkpoint'
if not checkpoint.exists():
    checkpoint.mkdir()
    with tarfile.open(archive) as source:
        for item in source.getmembers():
            target=(checkpoint/item.name).resolve()
            if not target.is_relative_to(checkpoint.resolve()) or item.issym() or item.islnk():raise RuntimeError('Unsafe model archive member')
        source.extractall(checkpoint,filter='data')
import tensorflow as tf
tf.compat.v1.disable_eager_execution()
from spleeter.model.functions.unet import unet
import tf2onnx
import numpy as np
print('Building magnitude graph and restoring official checkpoint.',flush=True)
with tf.Graph().as_default() as graph:
    magnitude=tf.compat.v1.placeholder(tf.float32,[1,64,1024,2],name='magnitude')
    sources=unet(magnitude,['vocals','drums','bass','other'],{'conv_activation':'ELU','deconv_activation':'ELU'})
    outputs=[tf.identity(sources[name+"_spectrogram"],name=name+'_estimate') for name in ['vocals','drums','bass','other']]
    with tf.compat.v1.Session(graph=graph) as session:
        path=tf.train.latest_checkpoint(str(checkpoint))
        if not path:
            files=list(checkpoint.glob('*.index'))
            if not files:raise RuntimeError('No model checkpoint found')
            path=str(files[0])[:-6]
        tf.compat.v1.train.Saver().restore(session,path)
        probe=np.random.default_rng(1701).uniform(0,.1,(1,64,1024,2)).astype(np.float32)
        reference=session.run(outputs,{magnitude:probe})
        frozen=tf.compat.v1.graph_util.convert_variables_to_constants(session,graph.as_graph_def(),[output.op.name for output in outputs])
        out=CACHE/'spleeter-4stems.onnx'
        tf2onnx.convert.from_graph_def(frozen,input_names=[magnitude.name],output_names=[output.name for output in outputs],opset=17,output_path=str(out))
        np.savez(CACHE/'export-reference.npz',input=probe,**{name:value for name,value in zip(['vocals','drums','bass','other'],reference)})
import importlib.metadata
import onnxruntime as ort
reference_data=np.load(CACHE/'export-reference.npz')
ort_session=ort.InferenceSession(str(out),providers=['CPUExecutionProvider'])
ort_values=ort_session.run(None,{'magnitude:0':reference_data['input']})
errors={name:float(np.max(np.abs(value-reference_data[name]))) for name,value in zip(['vocals','drums','bass','other'],ort_values)}
if max(errors.values())>1e-4:raise RuntimeError('ONNX export differs from TensorFlow reference: '+str(errors))
print('ONNX parity maximum absolute error:',errors,flush=True)
license_bytes=Path(importlib.metadata.distribution('spleeter').locate_file('spleeter-2.4.2.dist-info/LICENSE')).read_bytes()
(CACHE/'LICENSE-SPLEETER.txt').write_bytes(license_bytes)
manifest={'model':'spleeter-4stems','source':URL,'sourceSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'license':'MIT','sampleRate':44100,'frameLength':4096,'hop':1024,'timeFrames':64,'bins':1024,'stems':['vocals','drums','bass','other'],'parityMaxAbsoluteError':errors,'conversion':'TensorFlow 2.12.1 / tf2onnx 1.16.1 / opset 17; float32 magnitude graph'}
(CACHE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('Export complete:',out,flush=True)
