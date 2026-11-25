# Implementation milestones

The native SDK milestones below remain planned. A browser video-player prototype now implements local playback, HRTF virtual speakers, tone controls, Original/Spatial comparison, an AudioWorklet sample guard, camera pose/overlay and setup sampling, local four-stem music separation, independent spatial objects, short room reflections and two measured headphone profiles. Automated signal checks and local-model loading pass; perceptual quality, live camera accuracy and end-to-end latency still need user/hardware validation. See README.md for the implemented scope.

## 1. Headphone renderer proof

Build a small C++ host and reusable core with one moving mono source, listener rotation, and a tested HRTF backend. Use local test audio. Include a direct stereo reference and a repeatable front/back/elevation test. No driver or ML dependency is needed for this proof.

Deliver: runnable demo, documented coordinates and block ownership, captured timing/latency data, and an honest listening-test result. Verify that output changes with actual position and listener orientation, rather than only changing left/right gain.

## 2. Shared game SDK: Unity and Unreal

Stabilize the C ABI and integrate it in the chosen first engine. Build a room scene with moving sources, walls, listener motion, and at least one elevated source. Port the same scene to the second engine and compare coordinate conversions and output behavior.

Deliver: Unity package, Unreal plugin, example scenes, setup instructions, supported engine-version matrix, and lifecycle/performance checks. There must be only one final spatializer per source/output.

## 3. Movie and media proof

Build a reference local-file playback path with correct mono/stereo/5.1/7.1 channel mapping, media timestamps, seeks, and headphone output. Compare a basic DSP upmix against preserved surround playback. Add an optional offline AI separation experiment only after the baseline works.

Deliver: playable reference demo, format/channel test files, A/V sync checks, seeking/reset checks, original-track retention for export, and a tested media compatibility list. Desktop routing does not substitute for this synchronized player integration.

## 4. External speakers

Add a renderer for connected stereo and supported multichannel layouts. Verify every channel with a spoken channel-identification file and actual device capability checks. Define downmix and bass management. Evaluate Windows Spatial Sound as a separate optional output.

Deliver: tested layout list and device behavior. Height output is only enabled when the output route supports it.

## 5. Local intelligence

Add listening-based profile selection, optional AI media separation, and confidence-based spatial placement. Compare each learned feature to a simpler local algorithm. Keep inference off the render callback, with an explicit delay/resource budget and a working fallback.

Deliver: model/data provenance, local-only execution, repeatable before/after evaluation, and clear known failure cases. Do not describe estimated movie directions as recovered ground truth.

## 6. Windows companion and packaging

Prototype routing using a suitable existing virtual endpoint before developing a custom driver. Integrate the core, device selection, native-spatial bypass, and fail-safe recovery. Validate the endpoint's supported channel count and redistribution terms.

Deliver: installer/uninstaller, tested application list, device switching/recovery tests, and measured latency. A custom driver, if needed, is its own engineering and signing workstream.

## Definition of a meaningful first success

A person wearing ordinary wired stereo headphones can hear a controlled source move around and above them, rotate the listener without coordinate errors, and run the demo without audio dropouts on the selected test PC. The same core can then be integrated into Unity, Unreal, and media playback; its quality is assessed with multiple listeners before broad claims are made.
