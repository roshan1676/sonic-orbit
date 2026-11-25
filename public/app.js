import { DEFAULTS } from './audio-engine.js';
import { createSpatialAudio } from './sdk/spatial-audio.js';
import { TrackingHub } from './tracking-hub.js';
import { PRESETS, SOUND_RANGES, sanitizeSound } from './sound-settings.js';
import { TRACKING_DEFAULTS, trackingOptions } from './head-motion.js';
import { CameraOverlay } from './camera-overlay.js';
import { SceneControls } from './scene-controls.js';
import { VERSION } from './version.js';

const $ = id => document.getElementById(id);
const video = $('video');
$('app-version').textContent=`SonicOrbit ${VERSION} · Stereo output`;
$('help-button').onclick=()=>$('help-dialog').showModal();
$('help-close').onclick=()=>$('help-dialog').close();
let engine, context, source, audioPromise, token, objectUrl, demo, demoTimer, loadVersion = 0, manualYaw = 0;
let saved = {};
try { saved = JSON.parse(localStorage.getItem('sound360.preferences.v2') || '{}') || {}; } catch {}
let settings = sanitizeSound(saved.sound || {}), trackingPrefs = trackingOptions(saved.tracking || {}), mediaLoaded = false;
settings.volume = Math.min(settings.volume, 50);
let preferenceTimer;
const persist = () => { clearTimeout(preferenceTimer); preferenceTimer = setTimeout(() => { try { localStorage.setItem('sound360.preferences.v2', JSON.stringify({ sound: settings, tracking: trackingPrefs, reverse: tracker.reverse })); } catch {} }, 150); };
const formatTime = seconds => { seconds = Math.max(0, Math.floor(seconds || 0)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
const notify = (message, error = false) => { $('notice').textContent = message; $('notice').classList.toggle('error', error); };

function reflectSettings() {
  const enhanced = settings.mode === 'enhanced';
  const ai=!!scene.player?.enabled;
  $('original').classList.toggle('selected', !enhanced); $('enhanced').classList.toggle('selected', enhanced);
  $('original').setAttribute('aria-pressed', String(!enhanced)); $('enhanced').setAttribute('aria-pressed', String(enhanced));
  $('stage-label').textContent = enhanced ? 'SPATIAL AUDIO' : 'ORIGINAL AUDIO';
  $('processing-controls').classList.toggle('inactive', !enhanced);
  for (const name of Object.keys(SOUND_RANGES)) {
    $(name).value = settings[name]; $(name + '-value').textContent = `${settings[name]}${['bass', 'clarity', 'warmth', 'treble'].includes(name) ? ' dB' : '%'}`;
    $(name).disabled = name !== 'volume' && (!enhanced || (ai&&['space','height','width','room','focus','anchor'].includes(name)) || (['space', 'height', 'width', 'room'].includes(name) && settings.output === 'speakers') || (name === 'space' && tracker.active));
  }
  $('preset').value = settings.preset;
  $('head-preview').disabled = tracker.active || settings.output !== 'headphones';
  $('center-preview').disabled = tracker.active;
  $('output').value = settings.output;
  $('output-hint').textContent = settings.output === 'headphones' ? 'HRTF headphone rendering in Spatial mode.' : ai ? 'AI tracks mixed to conventional stereo. Stereo speakers do not give full 360° coverage.' : 'Tone processing only. Stereo speakers do not give full 360° coverage.';
  $('field-caption').textContent = !enhanced ? 'Original stereo' : ai ? settings.output==='headphones'?'AI sources · see the stage map':'AI stereo remix' : settings.output === 'speakers' ? 'Stereo tone processing' : 'Virtual speakers + inferred ambience';
  document.querySelector('.sound-field').classList.toggle('inactive', ai || !enhanced || settings.output === 'speakers');
  $('listener').style.transform = `translate(-50%, -50%) rotate(${tracker.active ? tracker.displayYaw : manualYaw}deg)`;
}
function update(patch, custom = false) {
  settings = sanitizeSound({ ...settings, ...patch, ...(custom ? { preset: 'custom' } : {}) });
  if (tracker.active && settings.output === 'headphones') settings.space = 100;
  engine?.update(settings); reflectSettings(); persist();
}

async function ensureAudio() {
  if (!audioPromise) {
    audioPromise = (async () => {
      context = new AudioContext({ latencyHint: 'interactive' });
      engine = await createSpatialAudio({ context, onMeter: ({ peak, gain }) => {
        $('output-meter').value = peak;
        $('peak-value').textContent = peak > 0.00001 ? `${(20 * Math.log10(peak)).toFixed(1)} dBFS` : 'Silent';
        $('guard-state').textContent = gain < 0.98 ? `Sample-peak guard reducing ${(20 * Math.log10(1 / gain)).toFixed(1)} dB` : 'Shared headroom · Sample-peak guard';
        $('dynamics-state').textContent = settings.mode === 'enhanced' && settings.dynamics > 0 ? `Dynamic compressor: ${Math.abs(engine?.dynamicsReduction || 0).toFixed(1)} dB reduction` : 'Dynamic control off';
      } });
      source = engine.attachMediaElement(video); engine.update(settings, true);
      const latency = ((context.baseLatency || 0) + (context.outputLatency || 0)) * 1000;
      $('audio-details').textContent = `${context.sampleRate / 1000} kHz · Stereo input/output · Browser-reported output delay: ${Math.round(latency)} ms. This excludes unreported device/Bluetooth delay. Check lip sync on your setup.`;
      context.onstatechange = () => { if (context.state === 'suspended' && !video.paused) notify('Audio was suspended. Press Pause, then Play to resume.'); };
      return engine;
    })().catch(async error => {
      await context?.close().catch(() => {}); context = null; engine = null; audioPromise = null;
      throw error;
    });
  }
  await audioPromise;
  if (context.state !== 'running') await context.resume();
  return engine;
}

function stopDemo() {
  clearInterval(demoTimer);
  if (demo) { demo.source.onended = null; try { demo.source.stop(); } catch {} demo.source.disconnect(); if (demo.panner) engine?.releaseTestPanner(demo.panner); demo = null; }
  $('test-sound').textContent = 'Test a moving sound';
  $('test-channels').textContent = 'Check left / right';
  $('test-status').textContent = 'Tests pause the video and play quiet, generated audio.';
}

async function togglePlay() {
  if (!mediaLoaded) return;
  if (!video.paused) { video.pause(); return; }
  try { stopDemo(); await ensureAudio(); await video.play(); notify(settings.mode === 'original' ? 'Original audio. Press A to compare with Spatial during the same scene.' : 'Spatial audio active. Adjust gently, then press A to compare with Original.'); }
  catch (error) { notify(`Playback could not start: ${error.message}`, true); }
}

function loadMedia(url, name, metadata = {}) {
  stopDemo(); video.pause(); loadVersion++; mediaLoaded = false;
  scene.reset(metadata);
  const oldUrl = objectUrl; objectUrl = url.startsWith('blob:') ? url : null;
  video.src = url; video.load(); if (oldUrl) URL.revokeObjectURL(oldUrl);
  $('file-name').textContent = name;
  $('empty-state').hidden = true; $('stage-label').hidden = false;
  $('play').disabled = true; $('seek').disabled = true; $('back').disabled = true; $('forward').disabled = true;
  $('elapsed').textContent = '0:00'; $('duration').textContent = '0:00'; $('seek').value = 0;
  $('file-format').textContent = metadata.channels ? `${metadata.channels}-channel ${metadata.layout || 'audio'} · ${metadata.audioCodec?.toUpperCase() || ''}` : 'Browser-decoded audio';
  const details = [metadata.width && metadata.height ? `${metadata.width} × ${metadata.height}` : null, metadata.channels ? metadata.channels > 2 ? `${metadata.channels} channels, downmixed to stereo in this prototype` : 'Stereo input' : 'Stereo processing', metadata.bytes ? `${(metadata.bytes / 1024 / 1024).toFixed(1)} MB` : null].filter(Boolean);
  $('media-info').textContent = details.join(' · ');
  notify('Video loaded locally. Press Play when you are ready; nothing plays automatically.');
}

function chooseFile(file) {
  if (!file) return;
  loadMedia(URL.createObjectURL(file), file.name, { bytes: file.size });
}
$('open-file').onclick = $('empty-open').onclick = () => $('file-input').click();
$('file-input').onchange = () => { chooseFile($('file-input').files[0]); $('file-input').value = ''; };
for (const event of ['dragenter', 'dragover']) $('drop-zone').addEventListener(event, e => { e.preventDefault(); $('drop-zone').classList.add('dragging'); });
$('drop-zone').addEventListener('dragleave', () => $('drop-zone').classList.remove('dragging'));
$('drop-zone').addEventListener('drop', e => { e.preventDefault(); $('drop-zone').classList.remove('dragging'); chooseFile(e.dataTransfer.files[0]); });
$('play').onclick = togglePlay;
video.addEventListener('click', togglePlay);
video.addEventListener('play', () => { $('play').textContent = 'Pause'; });
video.addEventListener('pause', () => { $('play').textContent = 'Play'; });
video.addEventListener('loadedmetadata', () => {
  mediaLoaded = true; for (const id of ['play', 'seek', 'back', 'forward']) $(id).disabled = false;
  $('duration').textContent = formatTime(video.duration); $('seek').max = Number.isFinite(video.duration) ? video.duration : 0;
});
video.addEventListener('error', () => {
  mediaLoaded = false; $('play').disabled = true;
  notify('This browser could not decode the file. Try an H.264/AAC MP4 or WebM. For other formats, use scripts/Convert-Video.ps1 to make a compatible local copy.', true);
});
video.addEventListener('timeupdate', () => { $('elapsed').textContent = formatTime(video.currentTime); $('seek').value = video.currentTime; });
video.addEventListener('ended', () => { $('play').textContent = 'Play'; });
$('seek').oninput = () => { video.currentTime = Number($('seek').value); };
$('back').onclick = () => { video.currentTime = Math.max(0, video.currentTime - 10); };
$('forward').onclick = () => { video.currentTime = Math.min(video.duration || 0, video.currentTime + 10); };
$('speed').onchange = () => { video.playbackRate = Number($('speed').value); };
$('fullscreen').onclick = async () => { try { await ensureAudio(); await $('drop-zone').requestFullscreen(); } catch (error) { notify(error.message, true); } };
document.addEventListener('fullscreenchange', () => { video.controls = Boolean(document.fullscreenElement); });
$('original').onclick = () => update({ mode: 'original' });
$('enhanced').onclick = () => update({ mode: 'enhanced' });
$('reset').onclick = () => {
  tracker.stop(); tracker.reverse = false; $('reverse-yaw').checked = false;
  trackingPrefs = { ...TRACKING_DEFAULTS }; tracker.configure(trackingPrefs); reflectTracking(); update({ ...DEFAULTS });
};
$('output').onchange = () => { const output = $('output').value; if (output === 'speakers') tracker.stop(); update({ output }); engine?.setHeadPose(0, 0); };
$('preset').onchange = () => { const key = $('preset').value; if (PRESETS[key]) update({ ...PRESETS[key], preset: key, mode: 'enhanced' }); else update({ preset: 'custom' }); };
for (const name of Object.keys(SOUND_RANGES)) $(name).oninput = () => update({ [name]: Number($(name).value) }, name !== 'volume');
document.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY'].includes(e.target.tagName) || $('path-dialog').open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  if (e.key.toLowerCase() === 'a') update({ mode: settings.mode === 'original' ? 'enhanced' : 'original' });
});

$('test-sound').onclick = async () => {
  if (demo) { stopDemo(); return; }
  try {
    video.pause(); const audio = await ensureAudio();
    const length = context.sampleRate * 8, buffer = context.createBuffer(1, length, context.sampleRate), samples = buffer.getChannelData(0);
    let seed = 17, smooth = 0;
    for (let i = 0; i < length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; smooth = 0.85 * smooth + 0.15 * (seed / 4294967296 * 2 - 1); const envelope = Math.min(1, i / 2500, (length - i) / 2500); samples[i] = smooth * 0.14 * Math.max(0, envelope); }
    const panner = audio.createTestPanner(), testSource = context.createBufferSource(); testSource.buffer = buffer; testSource.connect(panner);
    const start = context.currentTime;
    for (let t = 0; t <= 8; t += 0.05) {
      const angle = Math.min(t, 6) / 6 * Math.PI * 2, height = t > 6 ? Math.sin((t - 6) / 2 * Math.PI) * 2 : 0;
      panner.positionX.linearRampToValueAtTime(Math.sin(angle) * 2, start + t);
      panner.positionY.linearRampToValueAtTime(height, start + t);
      panner.positionZ.linearRampToValueAtTime(-Math.cos(angle) * 2, start + t);
    }
    demo = { source: testSource, panner }; testSource.onended = stopDemo; testSource.start();
    $('test-sound').textContent = 'Stop direction test';
    demoTimer = setInterval(() => {
      const elapsed = context.currentTime - start;
      $('test-status').textContent = elapsed > 6 ? 'Test source: moving above the screen' : `Test source: ${['front', 'right', 'back', 'left'][Math.min(3, Math.floor(elapsed / 1.5))]} of you`;
    }, 150);
  } catch (error) { stopDemo(); notify(error.message, true); }
};

$('test-channels').onclick = async () => {
  if (demo) { stopDemo(); return; }
  try {
    video.pause(); const audio = await ensureAudio(), length = context.sampleRate * 6;
    const buffer = context.createBuffer(2, length, context.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c), begin = c === 0 ? 0.5 : 3, end = begin + 1.5;
      for (let i = 0; i < length; i++) { const t = i / context.sampleRate; if (t >= begin && t < end) data[i] = 0.08 * Math.min(1, (t - begin) / 0.04, (end - t) / 0.04) * Math.sin(2 * Math.PI * 440 * t); }
    }
    const testSource = context.createBufferSource(); testSource.buffer = buffer; testSource.connect(audio.testInput);
    demo = { source: testSource }; testSource.onended = stopDemo; testSource.start();
    $('test-channels').textContent = 'Stop channel check'; $('test-status').textContent = 'First tone: LEFT only. Second tone: RIGHT only. Bypasses spatial processing.';
  } catch (error) { stopDemo(); notify(error.message, true); }
};

$('path-button').onclick = () => { $('path-error').textContent = ''; $('path-dialog').showModal(); $('local-path').focus(); };
$('path-cancel').onclick = () => $('path-dialog').close();
$('path-form').onsubmit = async e => {
  e.preventDefault(); $('path-submit').disabled = true; $('path-error').textContent = '';
  try {
    const response = await fetch('/api/open', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-360-Token': token }, body: JSON.stringify({ path: $('local-path').value }) });
    const media = await response.json(); if (!response.ok) throw new Error(media.error);
    loadMedia(media.url, media.name, media); $('path-dialog').close();
  } catch (error) { $('path-error').textContent = error.message; }
  finally { $('path-submit').disabled = false; }
};

const scene = new SceneControls({ensureAudio,getToken:()=>token,onEnable:()=>update({mode:'enhanced',output:'headphones',space:100}),onState:()=>reflectSettings()});
const overlay = new CameraOverlay({video:$('camera-preview'),canvases:[$('camera-monitor-canvas'),$('camera-hud-canvas')],onTune:options=>{
  trackingPrefs=trackingOptions({...trackingPrefs,...options});tracker.configure(trackingPrefs);reflectTracking();tracker.recenter();persist();
}});
$('auto-tune').onclick=()=>overlay.analyze();
$('show-camera-hud').onchange=()=>overlay.setActive(tracker.active&&tracker.source==='camera');
const tracker = new TrackingHub({
  onPending:pending=>{if(pending){$('camera-toggle').disabled=false;$('camera-toggle').textContent='Cancel camera request';}},
  getToken: () => token,
  video: $('camera-preview'),
  onPose: ({ yaw, pitch, roll = 0, quaternion, yawDegrees }) => {
    overlay.setPose({yawDegrees});scene.setYaw(yawDegrees);
    if (settings.output === 'headphones') { if (quaternion) engine?.setHeadOrientation(quaternion); else engine?.setHeadPose(yaw, pitch, false, roll); }
    $('listener').style.transform = `translate(-50%, -50%) rotate(${yawDegrees}deg)`;
  },
  onOverlay:frame=>overlay.receive(frame),
  onMetrics: metrics => {
    const external = metrics.source === 'external';
    const labels = { off: external ? 'External input off' : 'Camera off', waiting: 'Waiting for a tracker', calibrating: metrics.quality < 0.3 ? 'Looking for a face' : `Calibrating ${Math.round(metrics.calibrationProgress * 100)}%`, tracking: external ? 'External orientation · 360°' : metrics.quality >= 0.6 ? 'Tracking · good frame' : 'Tracking · partial frame', holding: 'Holding direction', returning: 'Easing to centre' };
    $('tracking-quality').textContent = labels[metrics.state] || 'Starting';
    $('tracking-rate').textContent = metrics.state === 'off' ? 'Local processing' : external ? `${metrics.fps} fps · local feed` : `${metrics.fps} fps · ${Math.round(metrics.inferenceMs)} ms inference`;
    $('calibration-progress').hidden = metrics.state !== 'calibrating'; $('calibration-progress').value = metrics.calibrationProgress || 0;
    if (!['off', 'waiting'].includes(metrics.state)) $('head-angle').textContent = `${Math.round(metrics.yawDegrees)}° / ${Math.round(metrics.pitchDegrees)}°`;
  },
  onStatus: text => { $('tracking-status').textContent = text; },
  onState: active => {
    $('camera-toggle').textContent = active ? 'Turn tracking off' : 'Enable head tracking';
    $('camera-preview').hidden = !active || tracker.source !== 'camera'; $('recenter').disabled = !active;
    overlay.setActive(active&&tracker.source==='camera');
    $('camera-toggle').disabled = false;
    manualYaw = 0; scene.setYaw(0); $('head-preview').value = 0; $('head-preview-value').textContent = '0°'; engine?.setHeadPose(0, 0);
    if (!active) $('head-angle').textContent = 'Off';
    else { $('tracking-quality').textContent = tracker.source === 'camera' ? 'Starting camera' : 'External input ready'; $('tracking-rate').textContent = tracker.source === 'camera' ? 'Loading local model' : 'Waiting for packets'; update({ space: 100, anchor: 100, room: Math.min(settings.room, 12) }); if (tracker.source === 'camera') refreshCameras().catch(() => {}); }
    reflectSettings();
  }
});
$('camera-toggle').onclick = async () => {
  if (tracker.active || tracker.pending) { tracker.stop(); return; }
  $('camera-toggle').disabled = true;
  try {
    await ensureAudio(); update({ mode: 'enhanced', output: 'headphones', space: 100 });
    if($('tracking-source').value==='camera'){
      $('tracking-status').textContent='Preparing the camera model. First use may download a small model; camera frames remain local.';
      const response=await fetch('/api/tracking/model',{method:'POST',headers:{'X-360-Token':token}}),result=await response.json();if(!response.ok)throw new Error(result.error);
    }
    await tracker.start($('tracking-source').value);
  }
  catch (error) { tracker.stop(); $('tracking-status').textContent = error.message; }
  finally { $('camera-toggle').disabled = false; }
};
$('recenter').onclick = () => tracker.recenter();
$('reverse-yaw').onchange = () => { tracker.reverse = $('reverse-yaw').checked; tracker.recenter(); persist(); };
function reflectTracking() {
  for (const key of ['smoothing', 'sensitivity', 'deadzone', 'prediction']) {
    $('tracking-' + key).value = trackingPrefs[key];
    $('tracking-' + key + '-value').textContent = `${trackingPrefs[key]}${key === 'sensitivity' ? '×' : key === 'deadzone' ? '°' : key === 'prediction' ? ' ms' : '%'}`;
  }
  $('tracking-fps').value = String(trackingPrefs.maxFps); $('tracking-loss').value = trackingPrefs.lossMode; $('tracking-tilt').checked = trackingPrefs.followTilt;
}
for (const key of ['smoothing', 'sensitivity', 'deadzone', 'prediction']) $('tracking-' + key).oninput = () => {
  trackingPrefs = trackingOptions({ ...trackingPrefs, [key]: Number($('tracking-' + key).value) }); tracker.configure(trackingPrefs); reflectTracking(); persist();
};
for (const [id, key] of [['tracking-fps', 'maxFps'], ['tracking-loss', 'lossMode'], ['tracking-tilt', 'followTilt']]) $(id).onchange = () => {
  const value = key === 'maxFps' ? Number($(id).value) : key === 'followTilt' ? $(id).checked : $(id).value;
  trackingPrefs = trackingOptions({ ...trackingPrefs, [key]: value }); tracker.configure(trackingPrefs); persist();
};
const previewTurn = async degrees => {
  if (tracker.active) return;
  try {
    await ensureAudio(); update({ mode: 'enhanced', output: 'headphones', space: 100 });
    manualYaw = degrees; engine.setHeadPose(degrees * Math.PI / 180, 0); $('head-preview').value = degrees; $('head-preview-value').textContent = `${degrees}°`;
    scene.setYaw(degrees);
    $('head-angle').textContent = `${degrees}° preview`; $('listener').style.transform = `translate(-50%, -50%) rotate(${degrees}deg)`;
  } catch (error) { notify(error.message, true); }
};
$('head-preview').oninput = () => previewTurn(Number($('head-preview').value));
$('center-preview').onclick = () => previewTurn(0);
tracker.configure(trackingPrefs); tracker.reverse = saved.reverse === true; $('reverse-yaw').checked = tracker.reverse; reflectTracking();
async function refreshCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) throw new Error('Camera enumeration is not supported in this browser.');
  const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
  const selected = $('camera-device').value; $('camera-device').textContent = '';
  const automatic = document.createElement('option'); automatic.value = ''; automatic.textContent = 'Default camera'; $('camera-device').append(automatic);
  cameras.forEach((camera, index) => { const option = document.createElement('option'); option.value = camera.deviceId; option.textContent = camera.label || `Camera ${index + 1} (name available after permission)`; $('camera-device').append(option); });
  $('camera-device').value = cameras.some(camera => camera.deviceId === selected) ? selected : '';
  $('camera-list-status').textContent = cameras.length ? `${cameras.length} camera input(s) available. Phone cameras need to appear as a Windows webcam.` : 'No camera listed yet. Grant camera access or connect a Windows-compatible webcam.';
}
$('refresh-cameras').onclick = () => refreshCameras().catch(error => { $('camera-list-status').textContent = error.message; });
$('camera-device').onchange = () => { if (tracker.active) tracker.stop(); tracker.cameraId = $('camera-device').value; $('tracking-status').textContent = 'Camera selected. Enable head tracking to start it.'; };
$('tracking-source').onchange = () => {
  tracker.stop(); const external = $('tracking-source').value === 'external'; $('camera-source-options').hidden = external;
  $('source-hint').textContent = external ? 'OpenTrack-compatible UDP output → 127.0.0.1:4243. Requires an actual orientation source. This app listens on this PC only.' : 'PC / USB / virtual phone camera. Face must remain visible; ordinary Bluetooth audio supplies no pose data.';
};
document.addEventListener('visibilitychange', () => { if (document.hidden) tracker.stop(); });
window.addEventListener('pagehide', () => { tracker.stop(); stopDemo(); if (objectUrl) URL.revokeObjectURL(objectUrl); });

reflectSettings();
try {
  const response = await fetch('/api/session'); const session = await response.json(); token = session.token;
  scene.capabilities=session.features;
  if (session.initial && loadVersion === 0) loadMedia(session.initial.url, session.initial.name, session.initial);
} catch { notify('The local server is unavailable. Restart it with Start-360-Sound.cmd.', true); }
