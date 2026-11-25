# Browser extension and Android APK · 0.1.0-alpha.1

These are prototypes built from the reusable browser audio core. They are not a universal audio driver. The desktop reference player remains the version with offline four-stem music separation and camera/OpenTrack tracking. The extension and APK currently render a stereo mix through virtual speakers, with tone controls and short room reflections.

## Desktop Chromium extension

Run `npm run build:extension`. The output folder is `dist/sonic-orbit-extension`. A packaged ZIP is also provided in this workspace for transfer; extract it before using Load unpacked.

1. Open the browser's extensions manager: `chrome://extensions`, `edge://extensions`, or `brave://extensions`.
2. Enable Developer mode and choose **Load unpacked**. Select the complete `sonic-orbit-extension` folder, including its manifest and `audio` directory.
3. Open a playing YouTube/video/music tab, click the SonicOrbit extension icon, then **Enable for this tab**.
4. Adjust bass, voice presence, surround blend, room reflections and listening volume. Compare the original captured stereo using the checkbox. Head turn is a manual preview in this version.
5. Choose **Restore tab audio** to stop capture and release the processor. Closing the source tab also stops processing. Disable/remove the extension in the browser's extension manager to uninstall it.

Chrome 116+ is required for the service-worker/offscreen capture architecture; other Chromium browsers must expose the same APIs. Safari, Firefox and Android Chrome are not implemented extension targets. The extension is not installed or published to an extension store by the build script. Loading it in a real browser, testing YouTube/protected content, and listening for lip sync are still required. Automated extension tests simulate extension APIs; they are not real tab-capture compatibility certification.

The extension uses `activeTab`, `tabCapture`, `offscreen` and local `storage`. It requests no broad website host access, injects no content script, reads no page DOM, requests no camera/microphone, and uses no recorder or upload endpoint. Capture contains all audio played by the selected tab, including embedded content, rather than one isolated video element. A source stream is connected to the local SDK and back to the audio destination, because tab capture suppresses the tab's normal local playback while active.

Saved data contains only audio preferences; restored volume is capped at 50%. No tab URLs/titles or audio files are stored. A failed initialization releases the stream so the browser can restore native audio. One tab is processed at a time. Browser settings and extension pages are excluded. Local-file tabs depend on browser capture/file-access rules and may fail without permission; use the desktop player for the downloaded-file workflow if necessary. Protected media, enterprise restrictions and browser differences may prevent capture or produce silence. Do not advertise “every video works” before testing the relevant routes.

The extension adds a tab-capture stage, so it may add more delay than the reference player. Bluetooth adds device-dependent delay. Original comparison still traverses capture and the shared output/headroom path; it is not a hardware bypass. AI music separation, measured-profile audition for separated objects, live camera/IMU tracking, multichannel/Atmos metadata decoding and per-site automatic activation are not included in this build.

Architecture references: [Chrome's capture guide](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture), [tabCapture behavior](https://developer.chrome.com/docs/extensions/reference/api/tabCapture), [offscreen documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen).

## Android APK

The built file is `dist/sonic-orbit-android-debug.apk`. It is a self-signed development APK for Android 8/API 26 and newer, targeting API 35. It is not a store release. Keep a recent Android System WebView installed; the app needs its Web Audio, AudioWorklet and supported media codecs. Signing/build verification succeeded on this PC, but the app has not been installed or played on a phone during this session.

Transfer the APK to a test Android phone and open it through the device's package installer. Android may require you to allow installation from the specific file-manager/browser you use; manage that on the device yourself. Open **SonicOrbit**, choose **Open music or video**, select a local audio/video file, then press Play in the media controls. No broad storage permission is requested. Test first with a known MP3/WAV song or H.264/AAC MP4. Installation does not replace your phone's existing audio system.

The app copies only the selected file to private cache to support seeking through a local HTTPS-origin resource interceptor. This preview limits selected files to 1 GB and needs enough free space for that copy. Selecting a new file removes the previous selection's cache file; closing normally also attempts cleanup. Interrupted sessions can leave temporary data until Android clears the app cache or you clear it in system settings. Source files are never overwritten. No media history is restored.

The APK declares no Internet, microphone, camera, notification or broad-storage permissions. App assets and selected media are served internally; navigation to outside pages is blocked. Audio processing uses the same SDK as the desktop player. It pauses when backgrounded or when it loses audio focus. Background playback, headset controls, playlists, streaming-service integration, on-phone source separation and real head sensors remain future features. The head-turn slider is a renderer preview, not phone-camera or headphone tracking.

This APK **processes files opened inside the app**. It does not modify Spotify, YouTube or every other app's audio. Android's [audio playback capture rules](https://developer.android.com/media/platform/av-capture) require user consent and eligible source usage/capture policies for cross-app capture; apps can prohibit capture. A future cross-app mode also needs careful handling of the original audible stream to avoid doubling it. System-wide replacement cannot be promised for an ordinary APK.

### Rebuild on this Windows PC

```powershell
npm run build:android
```

The helper uses the installed JDK (17+) and Android SDK platform 35/build tools 36.0.0: AAPT2, javac, D8, zipalign and apksigner. It includes the locally built audio module, uses no Gradle download, and creates its debug signing key only in ignored `.cache/android-debug.keystore`. Do not use this debug key for a production release. This project does not change device settings or install the APK automatically.

## What to test next

- Extension: YouTube and another normal media site, pause/resume, changing pages in the same tab, source-tab close, Stop restoring native audio, browser restart, error recovery, Bluetooth lip sync and long silent passages.
- Android: installation/launch, local song and MP4 playback, seeking, Original/Spatial comparison, bass/volume, focus interruption by a call/another player, app backgrounding and low-memory behavior.
- Both: comfortable volume, no second headphone spatializer in the output route, front/back localization and measured resource/latency costs. A successful build does not establish perceptual quality or device compatibility.
