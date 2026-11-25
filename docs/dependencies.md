# Prototype dependencies

## Browser audio

The video prototype uses the browser's Web Audio API. It does not currently include Steam Audio or ONNX Runtime. The native-core choices in architecture.md remain proposals.

- [PannerNode](https://developer.mozilla.org/en-US/docs/Web/API/PannerNode): browser HRTF spatialization.
- [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet): local sample-peak processing.

## Camera pose

The motion filter is an independent implementation of the [One Euro filter algorithm by Casiez, Roussel and Vogel](https://gery.casiez.net/1euro/). Its speed-adaptive cutoff balances stationary jitter and movement response. Our tuning, calibration, outlier handling and bounded prediction are prototype choices, validated against synthetic motion tests rather than a measured personal camera trajectory.

- npm package: `@mediapipe/tasks-vision` **1.2.3**, locked in package-lock.json.
- Package metadata declares Apache-2.0 licensing. Preserve upstream notices when distributing dependencies.
- [Official Face Landmarker documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js).
- Local model: Google's versioned float16 Face Landmarker bundle, fetched by scripts/setup-tracking.mjs.
- Model URL: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`
- Size: approximately 3.6 MiB. Runtime package includes larger WASM assets; this is a lightweight update loop, not a tiny dependency-free model.

The model is downloaded to public/models and excluded from Git. Version/checksum provenance does not itself establish model redistribution rights; check the model's applicable terms before distributing a packaged product. This workspace currently loads the downloaded local copy for prototype use.

All runtime scripts/model files are served by localhost. Content Security Policy restricts network connections to the same origin, disables framing, and grants no microphone access. The camera is requested only through the user's Enable head tracking action. Frames are sent as transient bitmaps to the local worker and closed after inference.

## Local music separation

The optional Python worker uses [Demucs](https://github.com/adefossez/demucs) **4.1.0**, `htdemucs`, running locally on CPU with four Torch threads, 5-second inference segments, no random shifts and 25% segment overlap. Model separation is offline preparation, not part of the live audio callback. This workspace uses a project `.venv-audio` with the system's existing CPU Torch 2.12.1; install versions appropriate to the target platform when packaging. SciPy writes float WAVs. Dependencies and model files are not bundled in Git.

Demucs upstream code is MIT-licensed; retain its notices and verify the chosen model-weight terms before distribution. `get_model` downloads weights into the project's `.cache/models` on first use. The server passes only the explicitly opened local media path to the local worker, never to an upload endpoint. A packaged product needs a pinned model artifact/hash and reproducible Python dependency lock; those are not provided by this prototype yet.

## FFmpeg

FFprobe inspects only media explicitly opened in the player. The conversion helper invokes the installed FFmpeg executable to create a new compatible file. Neither binary is bundled or downloaded by this project. A later packaged distribution must select builds and address their applicable license obligations.

## Measured headphone profiles

The AI scene can audition H3 and H17 from the [University of York SADIE II database, version 2-2](https://zenodo.org/records/12092466). Dataset attribution: Cal Armstrong, Lewis Thresh, Gavin Kearney, Audio Lab, University of York. Reference: [A Perceptual Evaluation of Individual and Non-Individual HRTFs: A Case Study of the SADIE II Database](https://doi.org/10.3390/app8112029).

`scripts/prepare-hrtf.py` pins and verifies the 48-kHz source archives: H3 `8f0b198245e872458313492879af77d0d3ef937eaedb141a9adbe1e69c26dbda`, H17 `018e01ef8d11b59c56e0b0867131f1cc7b6c23cc950c51a65f091438f969da88`. Their bundled `LICENSE.txt` is Apache-2.0, Copyright 2018 University of York. The prototype copies it and a modification/attribution notice into `public/hrtf`. This prototype selects a directional subset and applies one shared energy scalar per subject. It does not use SADIE BRIRs, headphone equalization responses, or personal measurements of the current user.
