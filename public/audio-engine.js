import { DEFAULTS, sanitizeSound } from './sound-settings.js';
import { eulerQuaternion, listenerBasis } from './orientation.js';
import { SCENE_DEFAULTS, sourcePosition, focusAttenuation, distanceAttenuation } from './scene-math.js';
import { loadHrtf, MeasuredPanner } from './measured-hrtf.js';

export { DEFAULTS } from './sound-settings.js';
const guardContexts = new WeakSet();

export async function createAudioEngine(context, { guard = true, onMeter = () => {}, destination = context.destination, assetBaseUrl = new URL('./', import.meta.url) } = {}) {
  if (guard) {
    if (!context.audioWorklet) throw new Error('AudioWorklet is unavailable. Open this player on localhost in a current Chromium browser.');
    if (!guardContexts.has(context)) {
      await context.audioWorklet.addModule(new URL('peak-guard.js', assetBaseUrl));
      guardContexts.add(context);
    }
  }
  const nodeList = [];
  const gain = (value = 1) => { const n = context.createGain(); n.gain.value = value; nodeList.push(n); return n; };
  const filter = (type, frequency, q = 0.707) => {
    const n = context.createBiquadFilter(); n.type = type; n.frequency.value = frequency; n.Q.value = q; nodeList.push(n); return n;
  };
  const move = (param, value, immediate = false) => {
    if (immediate) { param.cancelScheduledValues(context.currentTime); param.setValueAtTime(value, context.currentTime); }
    else param.setTargetAtTime(value, context.currentTime, 0.025);
  };
  const panner = (x, y, z) => {
    const n = context.createPanner(); n.panningModel = 'HRTF'; n.distanceModel = 'inverse';
    n.refDistance = 1; n.rolloffFactor = 0; n.channelCount = 1; n.channelCountMode = 'explicit';
    n.positionX.value = x; n.positionY.value = y; n.positionZ.value = z; nodeList.push(n); return n;
  };
  const input = gain(); input.channelCount = 2; input.channelCountMode = 'explicit'; input.channelInterpretation = 'speakers';
  const dry = gain(1), processed = gain(0), output = gain(0.5), headroom = gain(0.5);
  const mediaGate = gain(1), sceneGate = gain(0), sceneSum = gain(), reflectionFeed = gain(), reflectionWet = gain(0);
  const sceneObjects = new Set(); let sceneEnabled = false, turnAway = 0, theatre = 0, headForward = [0, 0, -1], headBasis = {forward:[0,0,-1],up:[0,1,0]}, hrtfData = null, profileVersion=0;
  const bass = filter('lowshelf', 95), mud = filter('peaking', 280, 0.85), presence = filter('peaking', 2400, 0.8);
  const air = filter('highshelf', 6500), rumble = filter('highpass', 12);
  const compressor = context.createDynamicsCompressor(); nodeList.push(compressor);
  compressor.attack.value = 0.008; compressor.release.value = 0.2; compressor.knee.value = 18;
  const uncompressed = gain(1), compressed = gain(0), tone = gain();
  const focusSplitter = context.createChannelSplitter(2), focusMerger = context.createChannelMerger(2); nodeList.push(focusSplitter, focusMerger);
  const mid = gain(), focusSide = gain(), midL = gain(0.5), midR = gain(0.5), sideInL = gain(0.5), sideInR = gain(-0.5);
  const focusLeft = gain(), focusRight = gain(), inverseSide = gain(-1);
  for (const n of [mid, focusSide, focusLeft, focusRight]) { n.channelCount = 1; n.channelCountMode = 'explicit'; }
  const clean = gain(), flat = gain(), spatial = gain(), frontL = panner(-1.2, 0, -1.7), frontR = panner(1.2, 0, -1.7);
  const frontLevelL = gain(0.75), frontLevelR = gain(0.75);
  const centrePanner = panner(0, 0, -2), centreLevel = gain(0), subtractMid = gain(0);
  const frontSignalL = gain(), frontSignalR = gain();
  for (const n of [frontSignalL, frontSignalR]) { n.channelCount = 1; n.channelCountMode = 'explicit'; }
  const splitter = context.createChannelSplitter(2); nodeList.push(splitter);
  const sideL = gain(0.5), sideR = gain(-0.5), side = gain();
  side.channelCount = 1; side.channelCountMode = 'explicit';
  const rearHigh = filter('highpass', 420), rearLow = filter('lowpass', 6500);
  const rearDelay = context.createDelay(0.05); rearDelay.delayTime.value = 0.012; nodeList.push(rearDelay);
  const rearL = panner(-1.4, 0.3, 1.8), rearR = panner(1.4, 0.3, 1.8), rearLevelL = gain(0.16), rearLevelR = gain(-0.16);

  input.connect(dry); input.connect(mediaGate); mediaGate.connect(bass); sceneSum.connect(sceneGate); sceneGate.connect(bass);
  bass.connect(mud); mud.connect(presence); presence.connect(air); air.connect(rumble);
  // Four short, band-limited first reflections. No long reverb tail or feedback.
  reflectionFeed.channelCount = 1; reflectionFeed.channelCountMode = 'explicit';
  const reflectionHigh = filter('highpass', 220), reflectionLow = filter('lowpass', 5500);
  reflectionFeed.connect(reflectionHigh); reflectionHigh.connect(reflectionLow);
  for (const [seconds, x, y, z, level] of [[.019,-3,1,-1,.35],[.027,3,.5,-1,.30],[.039,-2,1,3,.22],[.047,2,1,3,.18]]) {
    const delay = context.createDelay(.1); nodeList.push(delay); delay.delayTime.value = seconds;
    const direction = panner(x,y,z), reflectionLevel = gain(level);
    reflectionLow.connect(delay); delay.connect(direction); direction.connect(reflectionLevel); reflectionLevel.connect(reflectionWet);
  }
  // Keep reflections in the final binaural domain to avoid spatializing twice.
  reflectionWet.connect(processed); input.connect(reflectionFeed);
  rumble.connect(uncompressed); uncompressed.connect(tone); rumble.connect(compressor); compressor.connect(compressed); compressed.connect(tone);
  tone.connect(focusSplitter); focusSplitter.connect(midL, 0); focusSplitter.connect(midR, 1); midL.connect(mid); midR.connect(mid);
  focusSplitter.connect(sideInL, 0); focusSplitter.connect(sideInR, 1); sideInL.connect(focusSide); sideInR.connect(focusSide);
  mid.connect(focusLeft); mid.connect(focusRight); focusSide.connect(focusLeft); focusSide.connect(inverseSide); inverseSide.connect(focusRight);
  focusLeft.connect(focusMerger, 0, 0); focusRight.connect(focusMerger, 0, 1); focusMerger.connect(clean);
  clean.connect(flat); flat.connect(processed); clean.connect(splitter);
  splitter.connect(frontSignalL, 0); splitter.connect(frontSignalR, 1);
  mid.connect(subtractMid); subtractMid.connect(frontSignalL); subtractMid.connect(frontSignalR);
  frontSignalL.connect(frontL); frontSignalR.connect(frontR);
  mid.connect(centrePanner); centrePanner.connect(centreLevel); centreLevel.connect(spatial);
  frontL.connect(frontLevelL); frontR.connect(frontLevelR); frontLevelL.connect(spatial); frontLevelR.connect(spatial);
  splitter.connect(sideL, 0); splitter.connect(sideR, 1); sideL.connect(side); sideR.connect(side);
  side.connect(rearHigh); rearHigh.connect(rearLow); rearLow.connect(rearDelay);
  rearDelay.connect(rearL); rearDelay.connect(rearR); rearL.connect(rearLevelL); rearR.connect(rearLevelR);
  rearLevelL.connect(spatial); rearLevelR.connect(spatial); spatial.connect(processed);
  dry.connect(headroom); processed.connect(headroom); headroom.connect(output);
  const testInput = gain(); testInput.channelCount = 2; testInput.channelCountMode = 'explicit'; testInput.connect(headroom);

  let guardNode;
  const analyser = context.createAnalyser(); analyser.fftSize = 1024; nodeList.push(analyser);
  if (guard) {
    guardNode = new AudioWorkletNode(context, 'peak-guard', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
    guardNode.port.onmessage = ({ data }) => onMeter(data);
    output.connect(guardNode); guardNode.connect(analyser); nodeList.push(guardNode);
  } else output.connect(analyser);
  if (destination) analyser.connect(destination);
  let settings = { ...DEFAULTS };
  function update(patch, immediate = false) {
    settings = sanitizeSound({ ...settings, ...patch });
    const enhanced = settings.mode === 'enhanced';
    const amount = settings.output === 'headphones' && !sceneEnabled ? settings.space / 100 : 0;
    move(dry.gain, enhanced ? 0 : 1, immediate); move(processed.gain, enhanced ? 1 : 0, immediate);
    move(flat.gain, 1 - amount, immediate); move(spatial.gain, amount, immediate);
    move(bass.gain, settings.bass, immediate); move(mud.gain, settings.warmth - settings.clarity * 0.35, immediate);
    move(presence.gain, settings.clarity, immediate); move(air.gain, settings.treble, immediate);
    move(rumble.frequency, 12 + settings.tightness * 0.45, immediate);
    move(focusSide.gain, sceneEnabled ? 1 : 1 - settings.focus / 100 * 0.7, immediate);
    move(mediaGate.gain, sceneEnabled ? 0 : 1, immediate); move(sceneGate.gain, sceneEnabled ? 1 : 0, immediate);
    move(reflectionWet.gain, settings.output === 'headphones' ? theatre / 100 * .65 : 0, immediate);
    move(subtractMid.gain, -settings.anchor / 100, immediate); move(centreLevel.gain, settings.anchor / 100 * 1.2, immediate);
    const dynamics = settings.dynamics / 100;
    move(compressor.threshold, -12 - dynamics * 20, immediate); move(compressor.ratio, 1 + dynamics * 4, immediate);
    move(uncompressed.gain, dynamics > 0 ? 0 : 1, immediate); move(compressed.gain, dynamics > 0 ? 1 : 0, immediate);
    move(output.gain, settings.volume / 100, immediate);
    const angle = (20 + settings.width * 0.55) * Math.PI / 180;
    move(frontL.positionX, -Math.sin(angle) * 2, immediate); move(frontR.positionX, Math.sin(angle) * 2, immediate);
    move(frontL.positionZ, -Math.cos(angle) * 2, immediate); move(frontR.positionZ, -Math.cos(angle) * 2, immediate);
    move(rearLevelL.gain, settings.room / 100 * 0.9, immediate); move(rearLevelR.gain, -settings.room / 100 * 0.9, immediate);
    const elevation = settings.height / 100 * 1.8;
    move(rearL.positionY, elevation, immediate); move(rearR.positionY, elevation, immediate);
    for (const object of sceneObjects) object.refresh(immediate);
    return { ...settings };
  }
  update(settings, true);
  function setHeadOrientation(quaternion, immediate = false) {
    const basis = listenerBasis(quaternion); if (!basis) return false;
    headForward = basis.forward; headBasis=basis;
    for (const object of sceneObjects) object.refresh(immediate);
    const listener = context.listener;
    const poseMove = (param, value) => { if (immediate) move(param, value, true); else param.setTargetAtTime(value, context.currentTime, 0.008); };
    for (let i = 0; i < 3; i++) { const axis = ['X', 'Y', 'Z'][i]; poseMove(listener['forward' + axis], basis.forward[i]); poseMove(listener['up' + axis], basis.up[i]); }
    return true;
  }
  return {
    context, input, testInput, analyser, output: analyser, update, setHeadOrientation,
    async setHrtfProfile(name) {
      const version=++profileVersion,data=await loadHrtf(context,name,assetBaseUrl);if(version!==profileVersion)return;
      hrtfData=data;for(const object of sceneObjects){object.setProfile(data);object.refresh();}
    },
    setSceneEnabled(enabled) {
      sceneEnabled = !!enabled;
      try { input.disconnect(reflectionFeed); } catch {}
      try { sceneSum.disconnect(reflectionFeed); } catch {}
      (sceneEnabled ? sceneSum : input).connect(reflectionFeed);
      update(settings);
    },
    setSceneOptions({ turnAway: focus = turnAway, theatre: room = theatre } = {}) {
      if(Number.isFinite(focus))turnAway = Math.max(0, Math.min(1, focus));
      if(Number.isFinite(room))theatre = Math.max(0, Math.min(100, room));
      for (const object of sceneObjects) object.refresh(); update(settings);
    },
    createSceneSource(name) {
      const mono = gain(), level = gain(), facing = gain(), direction = panner(0,0,-2), speakerPan = context.createStereoPanner(); nodeList.push(speakerPan);
      const headphoneGate = gain(), speakerGate = gain(0), nativeProfileGate = gain(), measured = new MeasuredPanner(context);
      mono.channelCount = 1; mono.channelCountMode = 'explicit';
      mono.connect(level); level.connect(facing); facing.connect(direction); direction.connect(nativeProfileGate);nativeProfileGate.connect(headphoneGate);headphoneGate.connect(sceneSum);
      facing.connect(measured.input);measured.output.connect(headphoneGate);
      facing.connect(speakerPan); speakerPan.connect(speakerGate); speakerGate.connect(sceneSum);
      const object = { input: mono, options: { elevation:0, distance:2, referenceDistance:2, rolloff:1, ...(SCENE_DEFAULTS[name] || { azimuth: 0, level: 0 }) },
        update(patch) {
          for(const [key,min,max] of [['azimuth',-180,180],['elevation',-90,90],['distance',.05,1e6],['referenceDistance',.05,1000],['rolloff',0,4],['level',-60,6]])if(Number.isFinite(patch[key]))this.options[key]=Math.max(min,Math.min(max,patch[key]));
          this.refresh();
        },
        refresh(immediate = false) {
          const position = sourcePosition(this.options.azimuth,this.options.distance,this.options.elevation);
          for (let i=0;i<3;i++) move(direction['position'+['X','Y','Z'][i]],position[i],immediate);
          move(level.gain,10 ** (this.options.level/20)*distanceAttenuation(this.options.distance,this.options.referenceDistance,this.options.rolloff),immediate);
          move(facing.gain,settings.output === 'headphones' ? focusAttenuation(headForward,position,turnAway) : 1,immediate);
          measured.update(position,headBasis,immediate);
          move(speakerPan.pan,Math.sin(this.options.azimuth*Math.PI/180),immediate);
          move(headphoneGate.gain,settings.output === 'headphones'?1:0,immediate); move(speakerGate.gain,settings.output === 'speakers'?1:0,immediate);
        },
        setProfile(data){measured.setProfile(data);move(nativeProfileGate.gain,data?0:1);},
        disconnect() { measured.disconnect();for (const node of [mono,level,facing,direction,speakerPan,headphoneGate,speakerGate,nativeProfileGate]) { node.disconnect(); const index=nodeList.indexOf(node); if(index>=0)nodeList.splice(index,1); } sceneObjects.delete(this); }
      };
      sceneObjects.add(object); object.setProfile(hrtfData); object.refresh(true); return object;
    },
    get dynamicsReduction() { return compressor.reduction; },
    get settings() { return { ...settings }; },
    // The direction test uses the same HRTF implementation, independent of media upmix.
    createTestPanner() { const p = panner(0, 0, -2); p.connect(headroom); return p; },
    releaseTestPanner(p) { p.disconnect(); const index = nodeList.indexOf(p); if (index >= 0) nodeList.splice(index, 1); },
    setHeadPose(yaw = 0, pitch = 0, immediate = false, roll = 0) {
      return setHeadOrientation(eulerQuaternion(yaw, pitch, roll), immediate);
    },
    disconnect() { profileVersion++;for(const object of sceneObjects)object.disconnect();for (const n of nodeList) { if (n.port) { n.port.onmessage = null; n.port.close(); } n.disconnect(); } }
  };
}
