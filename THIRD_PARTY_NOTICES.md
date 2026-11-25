# Third-party notices

SonicOrbit's original source, documentation and original orbit illustrations are MIT-licensed; see [LICENSE](LICENSE). This grant does not replace third-party licenses.

| Component | Included where | Upstream terms and attribution |
| --- | --- | --- |
| SADIE II H3/H17 HRIR subset | Source, SDK, extension, Android, Windows | Apache-2.0. Copyright 2018 University of York. Cal Armstrong, Lewis Thresh, Gavin Kearney, Audio Lab, University of York. Full license and modification notice are in `public/hrtf` / packaged `hrtf`. [Database](https://zenodo.org/records/12092466), [paper](https://doi.org/10.3390/app8112029). Directional selection and a common level scalar are SonicOrbit modifications |
| MediaPipe Tasks Vision 1.2.3 | npm dependency; unmodified runtime in Windows package | Package declares Apache-2.0; upstream copyright/license headers are preserved. [MediaPipe](https://github.com/google-ai-edge/mediapipe). The Apache text is reproduced in `public/hrtf/LICENSE.txt`; package provenance in `docs/dependencies.md` |
| Face Landmarker model | Optional first-use download, not redistributed in release archives | Pinned Google model bundle, checksum verified. See `scripts/setup-tracking.mjs` and [official documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js). No user frames are uploaded |
| Node.js v24.22.3 | Unmodified Windows runtime only | Official Windows x64 archive, checked against official SHA-256. Full upstream license/third-party notices in `runtime/NODE-LICENSE.txt`, source/checksum in `runtime/PROVENANCE.txt`. [Node distribution](https://nodejs.org/dist/v24.22.3/) |
| Demucs 4.1.0, Torch, SciPy and related Python packages | Optional local installation; not bundled in downloads | Individual upstream licenses apply. Demucs code is MIT. AI weights download separately; verify their terms for your redistribution/use. [Demucs](https://github.com/adefossez/demucs) |
| FFmpeg / FFprobe | User-supplied, optional | Not bundled. The license depends on the build selected by the user. [FFmpeg legal page](https://ffmpeg.org/legal.html) |

The desktop motion filter is an independent implementation inspired by the [One Euro filter](https://gery.casiez.net/1euro/); no upstream filter source is bundled. Android platform APIs/WebView and the browser's Web Audio implementation are provided by the user's device/browser. SonicOrbit does not include a Dolby implementation, license, decoder or endorsement.
