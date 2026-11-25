# SonicOrbit Web module · 0.1.0-alpha.1

This is a working browser ES module used by the local video player. It has no UI framework dependency, starts no camera, and performs no AI inference or model downloads in the audio render path. It is not a native Unity or Unreal plugin.

## Package

Run `npm run build:sdk` in the project. Copy the generated `dist/sonic-orbit-web` folder into your host application's static assets, keeping its files together. Serve it through localhost or HTTPS. Import `sdk/spatial-audio.js`; TypeScript declarations are alongside it. The host must permit same-origin script/worklet/data loads in its CSP. A plain `file://` page is not supported. No package is published remotely.

The bundle contains the audio graph, short HRIR assets, peak-guard worklet, geometry helpers, declarations and SADIE II license/notice. It excludes the video, AI weights, Python environment, camera model and tracking UI. H3/H17 assets must have been built with `scripts/prepare-hrtf.py` before packaging. See the project's dependency documentation for provenance and limits.

## One-function initialization

```js
import { createSpatialAudio } from '/sound360/sdk/spatial-audio.js';

// Create/resume inside the application's Play button handler.
const spatial = await createSpatialAudio();
await spatial.resume();

// For ordinary media: leave the module in media mode and attach the element.
const media = spatial.attachMediaElement(document.querySelector('video'));
spatial.update({ bass: 2, clarity: 1, space: 100 });
```

`attachMediaElement` connects the element to the module without calling play/pause. Repeated attachment within the same module returns the same handle. Detach to disconnect its route. The module reuses its MediaElementAudioSourceNode when reattached on the same context. A media element cannot be moved freely between different AudioContexts after creation; the host must manage that lifecycle.

## Object sources: web games or pre-separated tracks

```js
const spatial = await createSpatialAudio({ maxSources: 32 });
await spatial.resume();

const sound = spatial.context.createBufferSource();
sound.buffer = decodedFootstep; // AudioBuffer loaded by the host
const footstep = spatial.addSource({
  id: 'footstep-1', node: sound,
  position: [2, 1, -4], // metres: right, above, in front
  level: -3, referenceDistance: 2, rolloff: 1
});
sound.start();

footstep.setPosition([-2, 1, -4]);
spatial.setListenerPose({
  position: [0, 0, 1],
  orientation: { x: 0, y: 0, z: 0, w: 1 }
});
// Camera/IMU adapters may instead call setHeadOrientation(q).

sound.onended = () => footstep.dispose();
```

The host owns source playback/decoding and sensor capture. You may omit `node` and connect a host AudioNode to `source.input` yourself. Sources are mono point emitters; stereo input is downmixed at that input. Adding the first managed source selects the object scene, which replaces enhanced media processing. Removing the last restores media processing. Media and object inputs are exclusive enhanced routes in this prototype. Do not combine these managed sources with the player's separate advanced stem-source lifecycle in one module. Original mode bypasses objects and requires an attached original media mix to be audible.

Coordinates are right-handed: +X right, +Y up, -Z front; units are metres. Quaternion fields are x/y/z/w; identity faces -Z. Euler convenience calls take radians; positive yaw looks right. Keep a single SDK instance per AudioContext. The module controls that context's AudioListener orientation; other native Web Audio spatializers on the same context share it. Game-engine axis/scale conversion belongs in the future engine adapters.

World source positions are converted relative to the listener's position before rendering. Distance uses a simple inverse gain curve: unity within the reference distance, then `reference / (reference + rolloff * (distance - reference))`. This is amplitude attenuation, not propagation delay, air absorption, occlusion, Doppler or near-field HRTF measurement. Height/distance default to zero degrees/two metres for the existing music scene, retaining its previous rendering levels.

Source level clamps to -60…+6 dB, reference distance to .05…1000 m, rolloff to 0…4, and render distance to .05…1,000,000 m. Coordinates must be finite and within ±1,000,000 m per axis. Coincident positions use a front-facing direction and minimum distance; direction at exactly zero distance has no physical definition. Default source capacity is 32, configurable to 1…128; exceeding it throws instead of silently stealing a voice. This is a resource limit, not a benchmarked source-count guarantee.

## Output and ownership

Pass `context` to use a host-owned context. Pass `destination` to route into a host mixer, or `destination: null` to connect `spatial.output` manually. The output includes shared headroom and the stereo sample guard when enabled. It does not spatialize an already binaural host mix again if you use object inputs correctly; avoid applying a second headphone spatializer downstream.

```js
const spatial = await createSpatialAudio({ context, destination: masterGain });
await spatial.setHrtfProfile('H3'); // browser, H3 or H17
spatial.setSceneOptions({ theatre: 15, turnAway: 0.6 });
// Turn-away focus is an optional artistic effect, not required for normal HRTF.
await spatial.dispose();
// A supplied context and supplied source playback remain owned by the host.
```

An optional `assetBaseUrl` changes where the worklet and `hrtf/` files load; by default they resolve relative to the module's parent folder, so subpath deployments work. Preserve module-relative imports when copying. `dispose` is idempotent and disconnects owned graph nodes and supplied source-to-module edges. It closes a context only if the factory created it. Stop and dispose the host's own source nodes separately. Released source handles reject further position/level updates.

The underlying audio-engine compatibility methods are retained for the existing player; the documented module API above is the intended embedding surface. Version 0.1.0-alpha.1 is an experimental API, not a stable ABI.

## Highest-value next improvements

1. A controlled listening setup to choose a headphone profile and compare front/back/elevation at matched perceived volume.
2. Chunked separation/streaming for full films, native multichannel input and measured A/V synchronization.
3. Timestamped camera/IMU fusion and measured motion-to-sound delay using real devices.
4. A native renderer with source/listener transforms, geometry-based occlusion/reflections and Unity/Unreal adapters. Steam Audio is a candidate backend; see the architecture references. Engine integration should receive original game sources, positions and room geometry instead of separating the final game mix.

None of these future items is implemented by packaging the browser module. Existing generic/measured HRTFs are not personal ear calibration, and no claim of superiority over Dolby Atmos follows from the prototype tests.
