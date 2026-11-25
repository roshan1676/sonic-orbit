# Sound quality: the bar for SonicOrbit

The purpose is to keep voices, attacks and bass intelligible while giving sounds a believable place outside the head. An obvious effect is not proof of higher fidelity. Stereo material does not contain reliable object coordinates; more rear energy cannot recreate the original scene.

## What changed in alpha 2

The extension's old default combined +2 dB bass, presence EQ, a direct/spatial blend, difference-channel rear energy and short room reflections. That combination can sound softer or coloured. Mixing a direct signal with its HRTF-filtered version can also create frequency cancellations. This is a plausible contributor to the reported lo-fi impression, not a measured diagnosis of the user's headphones.

Studio now starts with neutral EQ, no dynamics, no synthetic rear feed, no room reflections, a full spatial path and a front centre anchor. Clean stereo removes spatialization; Cinema adds a modest room effect. Room and tone remain creative controls. No automatic EQ can compensate arbitrary headphones without measurement.

Browser, SADIE II H3 and H17 profiles can now render ordinary stereo virtual speakers and the centre anchor, as well as separated objects. These are measured ears from other listeners, not personalized models. Reflections and the optional difference-channel rear feed still use the browser HRTF. The stereo source positions are assigned virtual speaker positions; the renderer does not identify a singer or clap from mixed tab audio.

## Repeatable listening comparison

1. Use the same headphones, volume and 15–30 second excerpt. Disable another spatializer in the route. Start with a local lossless source when possible.
2. In the extension, choose **Check headphone directions**. This stops capture and opens a generated mono-object test. Compare Front/Left/Right/Behind across HRTFs. Listen for stable placement and comfort; front/back reversals are possible with generic ears.
3. Return to the media tab and enable the extension. Compare **Clean stereo**, **Studio**, and the Original checkbox. Match perceived vocal loudness by ear, then leave volume alone. Shared headroom is not perceptual loudness matching.
4. Score vocal clarity, bass definition, clap/transient sharpness, naturalness, externalization and fatigue separately, from 1–5. Record headphone model, OS/browser, profile, excerpt timestamps and any delay or crackle. Repeat with speech, a sparse acoustic recording and a dense mix.
5. Ask another listener to switch modes without telling you which is active. Prefer the version repeatedly chosen across excerpts, rather than the louder or most dramatic one. A controlled study would need calibrated loudness, randomization, more listeners and statistical analysis; this is a practical development comparison.

The direction check validates a known source and is not a spatial reconstruction benchmark. No claim of superiority over Dolby Atmos is supported by these checks.

## Engineering evidence and remaining work

- Node regression tests cover stream disposal, initialization failure, preference migration, job aliases, cancel races, aborted stem loading and Android bootstrap fallback.
- Browser OfflineAudioContext checks exercise sample preservation in Original, clipping protection, relative source position, listener rotation, distance, measured data verification, opposite-phase stereo survival and absence of an unrequested late room tail.
- These checks do not establish transparency across frequency, a true-peak limit, localization accuracy for an individual, CPU cost, end-to-end latency, or preference over another renderer.
- Before a stable release: real Android picker/playback/seek tests; real Chrome/Edge capture and restore tests; long-session underrun/memory/CPU measurements; recorded loopback lip-sync measurements; level-matched listening results with multiple headphones/listeners.

## Where the next substantial gain can come from

1. **Native game sources:** retain each engine emitter's coordinates and listener pose. This is much stronger input than a final stereo game mix. Unity/Unreal adapters still need implementation.
2. **Better ear matching:** evaluate more licensed HRTFs and a guided selection procedure. Add interpolation and measure artifacts during fast head turns before claiming improved motion quality.
3. **Reliable object preparation:** separate offline music with audible artifact checks and source/phase reconstruction measurements. Four musical groups remain a creative remix, not recovered scene truth.
4. **Real tracking and latency:** measure sensor-to-audio latency; support calibrated IMU poses for full turns. A normal Bluetooth audio connection does not expose a standard head tracker.
5. **Faithful multichannel:** preserve and validate channel layouts before headphone rendering. This alpha still downmixes multichannel input and does not decode Atmos metadata.

Technical foundations: [W3C Web Audio panning](https://www.w3.org/TR/webaudio/#panning), [Chrome tab capture](https://developer.chrome.com/docs/extensions/reference/api/tabCapture), and the bundled SADIE II data [notice](../public/hrtf/NOTICE.txt).
