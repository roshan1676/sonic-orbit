# SonicOrbit

Local spatial audio for headphones first, with speaker output, Unity and Unreal integration, and movie/media playback.

**Status: working local video-player prototype with optional local AI music separation, four spatial sources, and a camera/landmark overlay. Unity/Unreal plugins, the native C++ core and system-wide routing are still planned.**

A reusable **browser module** now powers the player. It accepts individual audio sources, 3D world positions, listener position/orientation, height and distance attenuation, with host-controlled audio routing. Run `npm run build:sdk` to produce `dist/sonic-orbit-web`; see the [module API and embedding examples](docs/web-sdk.md). This package is an ES module, not a native Unity/Unreal plugin. No camera or AI model is included in its render path.

There are also buildable **desktop Chromium extension** and **Android local-player APK** prototypes. Run `npm run build:extension` or `npm run build:android`; see [installation, permissions and compatibility limits](docs/extension-and-android.md). They use stereo processing without desktop AI separation or live head tracking. They are not installed/published automatically. See the [evidence-based Dolby Atmos comparison](docs/dolby-comparison.md) for demonstrated strengths and unproven claims.

## Run the video prototype

Requires Node.js 22+ and a current Chromium browser (Brave, Edge, or Chrome recommended). The portable Windows package includes Node. FFprobe is optional for input metadata; FFmpeg is needed for AI separation and the conversion helper.

```powershell
npm install
npm run setup:tracking
npm start
```

Open **http://127.0.0.1:3600**. On Windows, `Start-360-Sound.cmd` also starts the server and opens the player. Setup downloads the pinned face model once; media playback and tracking then use local files and do not require internet. No microphone is requested.

To preload a video:

```powershell
npm start -- --media "C:\path\to\video.mp4"
```

Choose a file, drag it onto the player, or use **Open by path**. The server binds to 127.0.0.1 and serves only the selected media and allowlisted application assets. Your source file is not overwritten or uploaded. No media history is saved.

### Listening test

1. Begin with earphones at a comfortable volume. Pause other audio applications.
2. Press **Play**, then compare **Original** and **Spatial** during the same scene. Keyboard shortcut **A** works when focus is outside an input/button.
3. Start with Bass around 2 dB and Voice presence around 1 dB if desired. Both default to zero; these are controls, not earphone-specific calibration.
4. Adjust Surround strength. This is stereo virtual-speaker rendering and inferred ambience, not recovered original surround objects.
5. For screen anchoring, click **Enable head tracking**, allow the camera, face the screen, and click **Recenter**. This sets Surround strength to 100% so a dry, head-locked signal does not undermine anchoring.
6. Turn gently left and right. If horizontal response is reversed on your setup, enable **Reverse turn direction** and Recenter. Camera preview is mirrored; inference input is not. Camera mode still needs a visible face. Use a compatible orientation source for measured full turns.
7. The video overlay and camera setup monitor show your mirrored camera, landmarks and direction guide. **Tune from a still-head sample** samples 3.2 seconds of pose variation, face-region lighting and inference time, then applies starting filter/rate settings and recentres. It rejects inadequate samples and large movements. This cannot measure absolute accuracy or distinguish all slow movement from jitter. Adjust manually after listening.
8. Click **Turn tracking off** to release the camera. Tracking also stops when the tab becomes hidden or closes. No frames are recorded or uploaded.

The direction-test button pauses the video and plays a quiet, generated 8-second HRTF source around the listener and above the screen. It uses the renderer directly; it is not a demonstration of positions recovered from the movie. The camera-free head-turn preview spans -180° to +180° and likewise demonstrates rendering rather than actual tracking.

### Implemented processing

- Browser-decoded stereo signal, with explicit stereo downmix for multichannel inputs.
- Original/processed crossfade with shared 6 dB headroom and common listening volume. Perceived loudness may still differ.
- Low shelf with bass cut/boost, warmth/low-mid EQ, presence EQ, treble shelf, and adjustable rumble filtering.
- Neutral, Cinema, Dialogue, Music and Late night starting profiles; custom sound and tracking preferences persist locally. Restored listening volume is capped at 50%. Camera activation and media paths are never restored.
- Mid/side centre focus, adjustable virtual-speaker width and rear ambience, plus optional stereo dynamic-range compression on the processed path. Centre focus is not dialogue source separation.
- A dedicated screen-centre HRTF path for shared mid content, independently adjustable from centre focus. Enabling tracking selects full spatial blend, full screen anchoring and restrained rear ambience.
- Browser HRTF panners for virtual front speakers and restrained, band-limited L−R rear ambience.
- Two optional measured SADIE II headphone profiles (H3/H17) for the AI objects. Each uses 266 selected 256-tap HRIRs at 48 kHz, nearest measured direction, 25 ms filter crossfades and at most 25 direction updates/second per object. Browser HRTF remains the default and renders the room reflections. Audition profiles: these measurements are not of the current user's ears and do not guarantee improved localization. Direction quantization and transition delay remain prototype limitations.
- Stereo-linked sample-peak guard in an AudioWorklet, plus an output meter.
- Separate stereo-speaker mode with tone processing and no headphone virtualization.
- Optional camera-based yaw/pitch/tilt estimation through a pinned local MediaPipe model. One frame in flight, adaptive processing with 12/24/30 fps caps, a 384-pixel-wide inference input, and CPU inference in a worker. Actual rates depend on the camera/PC.
- Speed-adaptive motion filtering, bounded short prediction, adjustable sensitivity/dead zone, stable multi-frame neutral calibration, jump rejection and display-rate listener interpolation. Face-loss behavior can hold direction or gently return to centre. Model/frame quality is a heuristic, not a calibrated confidence score.
- A camera-free head-turn preview and a strict left/right tone test that bypasses spatial processing.
- Full-turn quaternion rendering and an on-demand, loopback-only OpenTrack UDP input for compatible external orientation bridges. This does not make face-only cameras capable of back-of-head tracking or add sensors to audio-only Bluetooth earphones.
- Optional offline Demucs separation into vocals, drums, bass and other instruments, with independent angle/level controls and front-stage or creative-surround arrangements. Separated stereo stems are collapsed to mono objects before binaural rendering; their original internal stereo width is not retained.
- Optional turn-away focus adds 0–6 dB source attenuation according to the listener/source angle. Four short, band-limited first reflections add room cues without a long feedback reverb tail. Original comparison bypasses the AI and room paths.
- AI playback follows play/pause/seek/buffering, uses one AudioContext timeline for all four tracks, checks drift every 250 ms and restarts with short fades when drift exceeds 80 ms. It currently requires 1× playback; this is not sample-accurate A/V synchronization.

### Local AI object scene

Use **Open by path**, then **Prepare local AI tracks**. Four music tracks are cached on this PC; **Load prepared AI tracks** reuses the cache. Loading activates the AI scene in Spatial mode but does not start video playback. Enable tracking and turn your head, or use the camera-free head-turn preview. Keep vocals at 0° for a screen-front singer; move percussion or other instruments independently. Press **A** to compare with the actual original mix.

The supplied 157-second test clip was separated on this PC using CPU inference in approximately 124 seconds after model loading/decoding. Subsequent playback uses the prepared tracks without live separation. This timing is one observation, not a performance guarantee.

The local Python environment is separate from npm. Recreate it if needed:

```powershell
py -3.11 -m venv .venv-audio
.\.venv-audio\Scripts\python.exe -m pip install "demucs==4.1.0" scipy
```

FFmpeg must be on PATH. This workspace already has the environment and model cache. The first preparation may download the model from its upstream registry; media is not uploaded. Setup dependencies require internet, while cached-model separation and playback run locally. Separation can be cancelled from the player. Only one preparation runs at a time. Cache files live in `.cache/stems`, keyed by source path, size, modification time and model version; caches persist across sessions even though the player does not restore media paths.

The measured headphone assets are already prepared in this workspace. To rebuild their ignored binary files, install `h5py` into the Python environment, then run `.\.venv-audio\Scripts\python.exe scripts/prepare-hrtf.py`. The script downloads two pinned SADIE II archives from Zenodo if missing, checks their SHA-256 values, selects directional measurements and preserves the Apache-2.0 license/attribution in `public/hrtf`. Browser loading also verifies binary checksums. A common front-energy scalar is applied to each subject; perceived loudness can still differ. At non-48-kHz context rates the short impulse responses use linear resampling with gain compensation.

This preview separates at most the first **five minutes**. Float WAV files and decoded browser buffers use substantial disk/RAM (roughly 220 MB of WAVs for this clip and about 240 MB of decoded audio at 48 kHz). At the end of the prepared portion the player returns to stereo processing. Long movies need a later streaming/chunked implementation.

### Limits to test honestly

- This browser prototype is not the planned native C++ SDK and is not a Dolby Atmos encoder. Music separation is experimental: leakage/artifacts are expected, claps may share the drum track, and the “other” track groups multiple instruments. It is not movie dialogue/effects separation or recovery of original object locations.
- A webcam needs a visible face and adequate lighting. It cannot track a complete turn away, nor provide Apple headset sensor performance. Face loss holds briefly before returning to centre, or holds the last direction if selected. Only orientation is used; camera-estimated translation is ignored.
- Physical head-pose sign, tracking stability, CPU cost and motion-to-sound delay still need live user validation. Automated synthetic checks do not establish personal tracking accuracy.
- Browser HRTF and the alternative SADIE II subject profiles are not personalized to the current listener. Perception varies by listener and earphones; stronger room effects may reduce clarity.
- Browser codecs limit directly playable files. This prototype downmixes surround inputs rather than preserving their separate directions. Multitrack language selection, subtitles and export are not implemented.
- Browser-reported output delay is not an end-to-end measurement. Bluetooth and processing may affect lip sync. Manual video/audio sync compensation is not implemented yet.
- The sample guard bounds digital samples; it does not guarantee true-peak limits, hardware loudness, or clean output from a damaged recording/device.

For an unsupported local video, create a new H.264/AAC stereo MP4 with:

```powershell
.\scripts\Convert-Video.ps1 -InputPath "C:\path\to\video.mkv"
```

The helper refuses to overwrite an existing file. It creates a compatible copy with the first video/audio track and does not retain subtitles or other audio tracks.

### Verification

```powershell
npm test
```

This checks sample-guard behavior, pose arithmetic, filtering/calibration/loss recovery, late-camera cancellation, camera setup analysis, scene geometry/focus attenuation, stem-cache identity, preference bounds, media seeking/range responses, and server access boundaries. Open **http://127.0.0.1:3600/self-test.html** for offline browser renders of the production graph, including AI object direction, turn-away gain, Original isolation, room reflections, and the no-camera local-model smoke test. The offline checks play no audio and request no camera. They do not establish perceptual quality or live camera accuracy.

The player has been exercised with the user-selected 720×720 H.264/AAC stereo MP4, including playback, seeking and Original/Spatial switching. See [third-party dependencies](docs/dependencies.md) for model provenance.

The product is one reusable audio core delivered through three integrations:

1. **Game SDK:** Unity and Unreal supply individual sounds, listener transforms, and scene information.
2. **Media integration:** a reference player supplies decoded movie audio and channel metadata; other players can integrate the core or use the desktop audio route.
3. **Windows companion:** routes supported applications' mixed stereo or surround audio into the core through a virtual audio endpoint.

The current browser player tests the signal flow and user experience before building the native core or a system-wide driver.

See [the architecture](docs/architecture.md) and [the implementation milestones](docs/milestones.md).

For camera selection and compatible full-turn sensor input, see [tracking sources and setup](docs/tracking-inputs.md). Phone cameras must already be exposed as Windows webcams. The native phone companion and device-specific Bluetooth sensor readers remain planned.

## Product promises

- Run audio processing locally; downloaded models, if added, run locally too.
- Preserve exact positions supplied by a game; distinguish those from inferred media positions.
- Offer headphone rendering and a separate speaker rendering path.
- Measure localization, latency, sound quality, and resource use before claiming an advantage over existing products.
- Support Dolby Atmos through a compatible platform renderer where available; our own renderer remains a separate spatial-audio implementation.

Neither a stereo recording nor two ordinary speakers guarantees accurate sound from every direction. Compatibility and output quality must be verified for each supported route.
