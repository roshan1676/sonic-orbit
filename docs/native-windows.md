# SonicOrbit Native · Windows alpha

This is a separate native Windows player. WPF supplies the desktop interface, LibVLC decodes local media, WASAPI plays audio, and an MIT-licensed C++ core performs measured-HRTF headphone rendering. It starts no web server or browser. A self-contained .NET runtime, native libraries, H3/H17 profiles and the Spleeter AI graph are included in the full installer and portable ZIP.

The pinned VLC 3 audio-memory callback supplies 16-bit PCM. This build explicitly converts that to float32 before the native DSP; the WASAPI path uses 48-kHz stereo float. It is not a bit-perfect high-resolution decoder path, and multichannel input is downmixed.

## Install and listen

1. Run the Windows x64 native setup, or extract the **complete** portable ZIP and open `SonicOrbit.Native.exe`. The installer uses the current user's Programs directory and verifies the playback engine, profile hashes and AI model locally. Installation and first playback need no internet connection, Python, FFmpeg installation or model download.
2. Choose **Open music or video**, or drop a local file into the player. Use Play/Pause, Stop and the seek bar. Space toggles playback; Ctrl+O opens a file. The app does not change Windows file associations.
3. Start at a comfortable listening volume. Compare Spatial on/off, H3/H17 and stage width. Spatial off preserves captured decoded stereo through the same headroom and output route. Perceived loudness is not automatically matched. The peak guard is a sample limiter, not a true-peak guarantee.
4. Choose an audio output. Connected Bluetooth headsets appear as ordinary Windows render endpoints. Refresh/reconnect handling follows endpoint notifications, with fallback to the default endpoint when a selected endpoint disappears. The lip-sync control is a manual correction; reported buffer sizes do not measure full Bluetooth latency. Real Bluetooth hardware still needs testing.
5. Optionally **Prepare local AI tracks**. The installed model runs on CPU in a background task and prepares up to five minutes of vocals, drums, bass and other instruments. Playback can continue, and Cancel remains available. Enable the prepared front stage when ready. Beyond its prepared duration, playback falls back to the stereo path. Files and AI results remain local.

The music model and native preprocessing differ from the browser prototype's Demucs path. Spleeter's original 11-kHz analysis band is used here; higher frequencies are retained in the "other" track, and normalized masks preserve mixture content in the saved stereo stems. The prepared listening stage averages each stem to mono and assigns it a front angle; this changes the source's stereo image and can cancel out-of-phase content. Compare against the ordinary stereo path. Short 64-frame inference segments reduce working memory but can introduce boundary artifacts. Conversion parity is not an audible-quality benchmark. Compare sparse music, dense music, speech and transients before presenting this as a quality improvement.

## Head tracking

The yaw slider is a manual preview. **Use OpenTrack orientation** opens a UDP receiver on loopback `127.0.0.1:4243`; configure OpenTrack's UDP-over-network output to the same address/port. The receiver accepts its 48-byte six-double pose format and consumes yaw only. Recenter while facing the screen. If packets stop, it holds the last heading and displays a waiting state. Another app using port 4243 prevents startup and produces an explanation.

Bluetooth connection or signal strength is never converted into invented head angles. A compatible tracker needs actual sensor data. Native camera tracking, pitch/roll rendering, personalized HRTFs, speaker arrays, system-wide capture, Unity/Unreal adapters and the native Android port are not implemented by this Windows milestone. The earlier browser/Android prototypes remain available separately.

## Files, performance and privacy

- Media is opened locally. The product does not expose a streaming URL field, record a microphone, upload media or request a camera.
- AI cache: `%LOCALAPPDATA%\SonicOrbit\cache\stems`. Five minutes of four float stereo tracks takes hundreds of megabytes; inference and track loading also need substantial RAM. Start with a short clip on a machine with at least 8 GB RAM. This is a development target, not a measured minimum requirement.
- Source media is never overwritten. Cancelled preparations can leave incomplete cache files; a complete marker is written last. Uninstall removes installed application files and leaves the user's generated cache intact.
- Native dependencies stay as replaceable DLLs. The app and original renderer code use MIT; included upstream libraries and model/profile data retain their own notices. See `THIRD-PARTY.txt` and the `licenses` directory.
- Startup, CPU, memory and A/V sync must be measured on more than this build machine. Fast UI startup does not make neural separation instantaneous. No superiority over an Atmos renderer has been demonstrated.

## Build

Prerequisites on the **build machine**: .NET 10 SDK, MSVC x64 tools, CMake, Inno Setup 6.7.4 and Python 3.11 for model conversion. These tools are not needed by the installed application. Packages are pinned in `desktop/native/SonicOrbit.Native.csproj` and `packages.lock.json`.

Create `.cache/venv-model-export` with Python 3.11. Install TensorFlow 2.12.1, tf2onnx 1.16.1, ONNX 1.17.0, ONNX Runtime 1.23.2 and pandas 1.5.3; install Spleeter 2.4.2 with `--no-deps`. Only its graph functions are used. Its pinned GCS filesystem dependency has no corresponding Windows/Python 3.11 wheel; the converter needs no GCS, CLI, FFmpeg adapter or Norbert package. The export environment is build-only and not a complete supported Spleeter CLI installation.

```powershell
& .cache/venv-model-export/Scripts/python.exe scripts/export-spleeter.py
./scripts/build-native.ps1
```

The exporter verifies the official model archive SHA-256 before extraction, restores its checkpoint, exports the magnitude graph and compares outputs numerically with TensorFlow. The native package verifies the converted graph's hash. Export intermediate files stay in ignored `.cache/spleeter`; generated model weights are release assets, not Git source files.

The build script compiles/runs C++ tests, publishes a self-contained x64 application, builds an offline installer and portable ZIP, and writes SHA256SUMS.txt under `dist/native-release`. `--verify-install` performs offline dependency/model verification without opening the player or playing sound. This is not proof of clean-machine compatibility; a clean Windows machine must still be tested independently.

Model licensing: the [Spleeter authors' paper](https://raw.githubusercontent.com/deezer/spleeter/master/paper.md) explicitly covers source and pretrained models under MIT. Official model: [Deezer release v1.4.0, 4 stems](https://github.com/deezer/spleeter/releases/tag/v1.4.0). The prototype's Demucs pretrained weights are not included in this native installer.
