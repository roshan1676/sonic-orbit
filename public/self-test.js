import { createAudioEngine } from './audio-engine.js';
import { paintCameraOverlay } from './camera-overlay.js';
import { createSpatialAudio } from './sdk/spatial-audio.js';

const assert = (condition, text) => { if (!condition) throw new Error(text); };
const rms = (samples, start = 5000) => Math.sqrt(samples.slice(start).reduce((sum, x) => sum + x * x, 0) / (samples.length - start));
async function render(patch = {}, { frequency = 440, amplitude = 0.2, direction, yaw = 0, guard = false, antiPhase = false, stepped = false, profile = 'browser' } = {}) {
  const context = new OfflineAudioContext(2, 24000, 48000);
  const engine = await createAudioEngine(context, { guard }); await engine.setHrtfProfile(profile); engine.update({ ...patch, volume: 100 }, true); engine.setHeadPose(yaw, 0, true);
  const buffer = context.createBuffer(2, 24000, 48000);
  for (let c = 0; c < 2; c++) { const samples = buffer.getChannelData(c); for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(2 * Math.PI * frequency * i / 48000) * amplitude * (antiPhase && c === 1 ? -1 : 1) * (stepped && i < 12000 ? 0.1 : 1); }
  const source = context.createBufferSource(); source.buffer = buffer;
  if (direction) { const p = engine.createTestPanner(); p.positionX.value = direction[0]; p.positionY.value = direction[1]; p.positionZ.value = direction[2]; source.connect(p); }
  else source.connect(engine.input);
  source.start(); const result = await context.startRendering(); engine.disconnect(); return result;
}

async function checkTrackingWorker() {
  const session=await(await fetch('/api/session')).json();
  const setup=await fetch('/api/tracking/model',{method:'POST',headers:{'X-360-Token':session.token}});
  if(!setup.ok)throw new Error((await setup.json()).error||'Camera model preparation failed.');
  const worker = new Worker('/head-worker.js');
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Local model test timed out.')), 30000);
      worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message || 'Worker failed.')); };
      worker.onmessage = async ({ data }) => {
        if (data.type === 'ready') {
          const canvas = new OffscreenCanvas(320, 240); const ctx = canvas.getContext('2d'); ctx.fillStyle = '#777'; ctx.fillRect(0, 0, 320, 240);
          const frame = await createImageBitmap(canvas); worker.postMessage({ type: 'frame', frame, timestamp: 1000 }, [frame]);
        } else if (data.type === 'pose') { clearTimeout(timeout); data.pose === null ? resolve() : reject(new Error('Blank image unexpectedly produced a face.')); }
        else if (data.type === 'error') { clearTimeout(timeout); reject(new Error(data.message)); }
      };
      worker.postMessage({ type: 'init' });
    });
  } finally { worker.terminate(); }
}

async function renderObject({yaw=0,focus=0,original=false,room=0,scene=true,profile='browser'}={}) {
  const context=new OfflineAudioContext(2,24000,48000),engine=await createAudioEngine(context,{guard:false});
  const object=engine.createSceneSource('vocals'),osc=context.createOscillator();osc.frequency.value=1000;osc.connect(object.input);
  await engine.setHrtfProfile(profile);
  engine.setSceneEnabled(scene);engine.setSceneOptions({turnAway:focus,theatre:room});engine.update({mode:original?'original':'enhanced',volume:100},true);engine.setHeadPose(yaw,0,true);
  osc.start();const rendered=await context.startRendering();engine.disconnect();return rendered;
}

async function renderSdk({position=[0,0,-2],listener=[0,0,0],route=true}={}){
  const context=new OfflineAudioContext(2,24000,48000),sdk=await createSpatialAudio({context,guard:false,destination:route?context.destination:null});
  const oscillator=context.createOscillator();oscillator.frequency.value=1000;
  sdk.addSource({id:'object',node:oscillator,position});sdk.setListenerPose({position:listener},true);sdk.update({volume:100},true);oscillator.start();
  const rendered=await context.startRendering();await sdk.dispose();return rendered;
}

document.getElementById('run').onclick = async () => {
  const button = document.getElementById('run'); button.disabled = true; document.getElementById('results').textContent = '';
  const tests = [
    ['Original path preserves the signal at shared -6 dB headroom', async () => {
      const result = await render(); const samples = result.getChannelData(0); let error = 0;
      for (let i = 0; i < samples.length; i++) error = Math.max(error, Math.abs(samples[i] - Math.sin(2 * Math.PI * 440 * i / 48000) * 0.1));
      assert(error < 0.00001, `Original path error: ${error}`);
    }],
    ['Bass control increases low-frequency energy', async () => {
      const baseline = await render({ mode: 'enhanced', space: 0 }, { frequency: 60 });
      const boosted = await render({ mode: 'enhanced', space: 0, bass: 6 }, { frequency: 60 });
      assert(rms(boosted.getChannelData(0)) > rms(baseline.getChannelData(0)) * 1.5, 'Bass filter did not increase low-frequency energy.');
    }],
    ['HRTF rendering distinguishes left and right source positions', async () => {
      const left = await render({}, { direction: [-2, 0, -1], frequency: 1000 });
      const right = await render({}, { direction: [2, 0, -1], frequency: 1000 });
      assert(rms(left.getChannelData(0)) > rms(left.getChannelData(1)), 'Left source did not favor the left ear.');
      assert(rms(right.getChannelData(1)) > rms(right.getChannelData(0)), 'Right source did not favor the right ear.');
    }],
    ['Turning the listener right moves a screen-front source toward the left ear', async () => {
      const result = await render({}, { direction: [0, 0, -2], yaw: 0.9, frequency: 1000 });
      assert(rms(result.getChannelData(0)) > rms(result.getChannelData(1)), 'Listener rotation is reversed.');
    }],
    ['Spatial upmix produces finite, non-silent stereo', async () => {
      const result = await render({ mode: 'enhanced', space: 100, bass: 6, clarity: 4, height: 100 });
      for (let c = 0; c < 2; c++) { const samples = result.getChannelData(c); assert(samples.every(Number.isFinite), 'Invalid output samples.'); assert(rms(samples) > 0.001, 'Spatial output was silent.'); }
    }],
    ['AudioWorklet sample guard bounds overloaded audio', async () => {
      const result = await render({}, { guard: true, amplitude: 8 });
      for (let c = 0; c < 2; c++) assert(result.getChannelData(c).every(x => Number.isFinite(x) && Math.abs(x) <= 0.94001), 'Overload exceeded the sample guard.');
    }],
    ['Centre focus retains centred audio while reducing stereo-side content', async () => {
      const centre = await render({ mode: 'enhanced', space: 0, focus: 100 });
      const centreBase = await render({ mode: 'enhanced', space: 0, focus: 0 });
      assert(Math.abs(rms(centre.getChannelData(0)) / rms(centreBase.getChannelData(0)) - 1) < 0.01, 'Centre content changed unexpectedly.');
      const side = await render({ mode: 'enhanced', space: 0, focus: 100 }, { antiPhase: true });
      const sideBase = await render({ mode: 'enhanced', space: 0, focus: 0 }, { antiPhase: true });
      assert(rms(side.getChannelData(0)) < rms(sideBase.getChannelData(0)) * 0.4, 'Side content did not reduce.');
    }],
    ['Treble adjustment changes high-frequency energy', async () => {
      const base = await render({ mode: 'enhanced', space: 0 }, { frequency: 10000 });
      const bright = await render({ mode: 'enhanced', space: 0, treble: 4 }, { frequency: 10000 });
      assert(rms(bright.getChannelData(0)) > rms(base.getChannelData(0)) * 1.3, 'Treble control did not affect the signal.');
    }],
    ['Dynamic control reduces the loud/quiet ratio', async () => {
      const base = await render({ mode: 'enhanced', space: 0 }, { amplitude: 0.8, stepped: true });
      const compressed = await render({ mode: 'enhanced', space: 0, dynamics: 100 }, { amplitude: 0.8, stepped: true });
      const ratio = result => { const a = result.getChannelData(0); return rms(a.slice(18000, 23000), 0) / rms(a.slice(4000, 10000), 0); };
      assert(ratio(compressed) < ratio(base) * 0.75, `Compression ratio did not improve: ${ratio(compressed)}`);
    }],
    ['Listener orientation remains orthogonal when yaw, pitch, and tilt combine', async () => {
      const context = new OfflineAudioContext(2, 1000, 48000), engine = await createAudioEngine(context, { guard: false });
      engine.setHeadPose(0.8, 0.3, true, 0.4); const l = context.listener;
      const f = [l.forwardX.value, l.forwardY.value, l.forwardZ.value], u = [l.upX.value, l.upY.value, l.upZ.value];
      assert(Math.abs(f.reduce((sum, v, i) => sum + v * u[i], 0)) < 0.00001, 'Listener basis was not orthogonal.');
      assert(Math.abs(Math.hypot(...f) - 1) < 0.00001 && Math.abs(Math.hypot(...u) - 1) < 0.00001, 'Listener basis was not normalized.'); engine.disconnect();
    }],
    ['Full-turn renderer supports back-facing and 360-degree headings', async () => {
      for (const [yaw, expected] of [[Math.PI,1],[2*Math.PI,-1]]) {
        const context = new OfflineAudioContext(2,1000,48000), engine = await createAudioEngine(context,{guard:false});
        engine.setHeadPose(yaw,0,true); const source = context.createOscillator(); source.connect(engine.input); source.start();
        await context.startRendering();
        assert(Math.abs(context.listener.forwardZ.value-expected) < 0.0001,`Rendered heading ${yaw}: forward Z=${context.listener.forwardZ.value}`); engine.disconnect();
      }
    }],
    ['Dedicated screen-centre anchor follows a right head turn toward the left ear', async () => {
      const result = await render({mode:'enhanced',space:100,anchor:100,room:0},{frequency:1000,yaw:0.8});
      assert(rms(result.getChannelData(0)) > rms(result.getChannelData(1))*1.1,'Screen-centre cue was not directional.');
    }],
    ['AI scene keeps a front vocal anchored while the listener turns right', async()=>{
      const rendered=await renderObject({yaw:.9});assert(rms(rendered.getChannelData(0))>rms(rendered.getChannelData(1))*1.1,'Vocal object was not directional.');
    }],
    ['Turn-away focus adds the requested 6 dB reduction for a source behind the listener',async()=>{
      const plain=await renderObject({yaw:Math.PI}),focused=await renderObject({yaw:Math.PI,focus:1});
      const ratio=rms(focused.getChannelData(0))/rms(plain.getChannelData(0));assert(Math.abs(20*Math.log10(ratio)+6)<.15,`Focus reduction ${20*Math.log10(ratio)} dB`);
    }],
    ['Original comparison and disabled AI scene reject isolated stem input',async()=>{
      for(const patch of [{original:true},{scene:false}]){const rendered=await renderObject(patch);assert(rms(rendered.getChannelData(0))<1e-7,'Stems leaked into the media path.');}
    }],
    ['Short theatre reflections remain finite through combined head rotation',async()=>{
      const rendered=await renderObject({yaw:1.2,room:60});for(let c=0;c<2;c++)assert(rendered.getChannelData(c).every(Number.isFinite),'Invalid room samples.');
    }],
    ...['H3','H17'].map(profile=>[`Measured ${profile} assets verify and a front object shifts left after a right head turn`,async()=>{
      const rendered=await renderObject({yaw:.9,profile});for(let c=0;c<2;c++)assert(rendered.getChannelData(c).every(Number.isFinite),'Invalid measured samples.');
      const l=rms(rendered.getChannelData(0)),r=rms(rendered.getChannelData(1));assert(l>r*1.05,`${profile} left=${l}, right=${r}`);
    }]),
    ['Camera overlay draws mirrored landmarks and direction without requesting a camera',async()=>{
      const canvas=document.createElement('canvas'),landmarks=new Float32Array(956);for(let i=0;i<478;i++){landmarks[i*2]=.5+Math.cos(i)*.15;landmarks[i*2+1]=.45+Math.sin(i)*.2;}
      paintCameraOverlay(canvas,null,{pose:{yaw:.4,pitch:.1},quality:.9,landmarks},{pose:{yawDegrees:20}});
      assert(canvas.width===384&&canvas.height===288,'Unexpected overlay resolution.');
      const pixels=canvas.getContext('2d').getImageData(0,0,384,256).data;let bright=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>180&&pixels[i+1]>180)bright++;assert(bright>150,'Landmarks/guide did not draw.');
    }],
    ['Reusable SDK renders a raised world source left after moving the listener past it',async()=>{
      const result=await renderSdk({position:[2,1,-2],listener:[4,0,0]});assert(rms(result.getChannelData(0))>rms(result.getChannelData(1))*1.1,'World/listener translation was not directional.');
    }],
    ['Reusable SDK distance model reduces an eight-metre source by 12 dB relative to two metres',async()=>{
      const near=await renderSdk(),far=await renderSdk({position:[0,0,-8]});const ratio=rms(far.getChannelData(0))/rms(near.getChannelData(0));assert(Math.abs(20*Math.log10(ratio)+12.0412)<.15,`Distance gain: ${20*Math.log10(ratio)} dB`);
    }],
    ['SDK validates source lifecycle, capacity and listener pose while preserving a supplied context',async()=>{
      const context=new OfflineAudioContext(2,1000,48000),sdk=await createSpatialAudio({context,guard:false,maxSources:1});
      const source=sdk.addSource({id:'first'});let rejected=0;
      for(const run of [()=>sdk.addSource({id:'second'}),()=>sdk.addSource({id:'first'}),()=>sdk.setListenerPose({position:[NaN,0,0]}),()=>sdk.setListenerPose({orientation:{x:0,y:0,z:0,w:0}})]){try{run();}catch{rejected++;}}
      assert(rejected===4&&sdk.sourceCount===1,'Invalid source/pose changed the module.');
      source.dispose();source.dispose();assert(sdk.sourceCount===0,'Source was not released.');
      await sdk.dispose();await sdk.dispose();assert(context.state!=='closed','Module closed a host-owned context.');
      let stale=false;try{source.setPosition([1,0,0]);}catch{stale=true;}assert(stale,'Released handle accepted updates.');
      const next=await createSpatialAudio({context,guard:false});await next.dispose();
    }],
    ['SDK media attachment reuses a single node across detach and module recreation',async()=>{
      const context=new AudioContext(),video=document.createElement('video');let sdk;
      try{
        sdk=await createSpatialAudio({context,guard:false});const first=sdk.attachMediaElement(video);assert(first===sdk.attachMediaElement(video),'Repeated attach duplicated the handle.');
        first.detach();const second=sdk.attachMediaElement(video);assert(first.node===second.node,'Reattach tried to recreate the media source.');await sdk.dispose();
        sdk=await createSpatialAudio({context,guard:false});assert(sdk.attachMediaElement(video).node===first.node,'Module recreation lost the media-node association.');
      }finally{await sdk?.dispose();await context.close();}
    }],
    ['SDK custom-routing mode leaves the device output silent until the host connects it',async()=>{
      const result=await renderSdk({route:false});assert(rms(result.getChannelData(0))<1e-8&&rms(result.getChannelData(1))<1e-8,'SDK bypassed host routing.');
    }],
    ...['browser','H3','H17'].map(profile=>[`${profile}: ordinary stereo centre follows head turn without room effects`,async()=>{
      const result=await render({mode:'enhanced',space:100,anchor:100,room:0},{frequency:1000,yaw:.9,profile});
      assert(rms(result.getChannelData(0))>rms(result.getChannelData(1))*1.1,'Stereo centre lost its directional cue.');
    }]),
    ...['H3','H17'].map(profile=>[`${profile}: fully spatial stereo retains opposite-phase content`,async()=>{
      const result=await render({mode:'enhanced',space:100,anchor:65,room:0},{frequency:1500,antiPhase:true,profile});
      for(let c=0;c<2;c++)assert(rms(result.getChannelData(c))>.002,'Side information cancelled or became silent.');
    }]),
    ['Studio path does not create a synthetic delayed room tail',async()=>{
      const context=new OfflineAudioContext(2,12000,48000),engine=await createAudioEngine(context,{guard:false});
      engine.update({mode:'enhanced',space:100,room:0,anchor:65,volume:100},true);engine.setSceneOptions({theatre:0});
      const buffer=context.createBuffer(2,12000,48000);buffer.getChannelData(0)[1000]=.2;buffer.getChannelData(1)[1000]=.2;
      const source=context.createBufferSource();source.buffer=buffer;source.connect(engine.input);source.start();
      const result=await context.startRendering();engine.disconnect();
      for(let c=0;c<2;c++){const samples=result.getChannelData(c);assert(rms(samples.slice(7000),0)<1e-6,'Unrequested room tail.');}
    }],
    ['Local face model loads in a worker and handles no-face input without a camera', checkTrackingWorker]
  ];
  let passed = 0;
  for (const [name, run] of tests) {
    document.getElementById('summary').textContent = `Checking: ${name}`;
    const row = document.createElement('li');
    try { await run(); row.textContent = `PASS: ${name}`; row.className = 'pass'; passed++; }
    catch (error) { row.textContent = `FAIL: ${name}: ${error.message}`; row.className = 'fail'; }
    document.getElementById('results').append(row);
  }
  document.getElementById('summary').textContent = `${passed}/${tests.length} checks passed. These checks do not establish perceptual quality, live-camera accuracy, or full end-to-end latency.`;
  button.disabled = false;
};
