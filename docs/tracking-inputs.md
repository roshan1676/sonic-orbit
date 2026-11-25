# Tracking sources and real capabilities

Audio output and motion input are separate. Basic Bluetooth/wired earphones play binaural audio. An audio-only connection does not provide head orientation.

| Input | Implemented route | Limits |
| --- | --- | --- |
| PC / USB webcam | Camera selector and local face model | Face must remain visible. Cannot measure a complete turn away. |
| Phone camera | Select its Windows-exposed virtual webcam | Requires an existing phone/OS/webcam bridge. Same visible-face limit. This project does not install that bridge. |
| Phone motion sensor | OpenTrack-compatible PC-side orientation bridge | Phone must move with the head and an actual phone app/bridge must export orientation. No native phone companion is implemented here. |
| Sensor-equipped headset / IMU | OpenTrack-compatible orientation bridge | Requires real sensors, an accessible protocol and a compatible bridge. Generic Bluetooth audio alone is insufficient. |
| Manual full-circle preview | -180° through +180° slider | Demonstrates rendering, not measured head motion. |

## Camera setup

Choose Camera under Tracking input. Use Choose a camera → Refresh camera list if necessary. Names may be hidden until camera permission is granted. Enable tracking, look at the screen and hold still for calibration. Device IDs are not saved. Camera mode has adjustable filtering, sensitivity, dead zone, prediction, tilt and 12/24/30 fps caps. One frame is in flight; listener interpolation runs at display rate. Inference time is not end-to-end latency.

Holding the last direction when a face disappears is a fallback, not full-turn measurement. More sensitivity cannot recover missing back-of-head information. Full-turn camera tracking would require suitable markers/multiple views or other measurements.

## Full-turn external input

1. Configure a compatible source/bridge's OpenTrack UDP output to **127.0.0.1:4243** on this PC. Select its actual sensor input and configure axes in that application.
2. In the player select **External orientation · OpenTrack UDP**, then Enable head tracking.
3. The player shows Waiting for a tracker until valid recent packets arrive. Face the screen and Recenter once data is flowing.
4. Turn tracking off to close the receiver. Choose Camera to return to face mode. External mode does not load camera AI.

The renderer accepts normalized quaternions and uses shortest-path interpolation, so 180°/360° poses are not clamped by the face camera's limits. Accuracy, drift and full-turn coverage still depend on the source sensor and calibration. Reverse yaw if needed; other axis conversions belong in the bridge.

The receiver binds only to loopback, opens on demand and assumes one actively controlled player session. It does not expose a LAN receiver, pair a headset, read Bluetooth firmware, or connect a phone automatically. A phone needs a compatible PC-side bridge. Set HEADTRACK_PORT before starting the server to override port 4243 and configure the sender to match.

The [OpenTrack protocol](https://github.com/opentrack/opentrack/wiki/UDP-Protocol) uses exactly 48 bytes: six little-endian doubles, XYZ centimetres then yaw/pitch/roll degrees. Translation is ignored; malformed/nonfinite packets are rejected.

## Synthetic diagnostic

With external tracking enabled, run `npm run demo:tracker`. It sends a generated stationary interval followed by a full rotation to localhost for 12 seconds. This tests transport/rendering, not personal tracking accuracy. It opens no camera/microphone and plays no audio. Stop external tracking afterward.

Automated checks cover quaternion quadrants/wrap/recentering, UDP decoding/socket cleanup, renderer orientation, synthetic camera filtering and cancellation cleanup. Hardware precision, drift, personal HRTF accuracy, Bluetooth latency and motion-to-sound delay still require measurements. Native phone apps and vendor-specific headset adapters remain future work.
