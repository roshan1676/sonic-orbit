# Native renderer API · experimental

The Windows player uses `native/spatial.h`, a small C ABI exported by `sonicorbit_dsp.dll`. This is an engine-independent stereo renderer foundation. It is not yet an installable Unity package or Unreal plugin. The existing [Web SDK](web-sdk.md) is a different implementation.

## Audio and profile contract

- Audio is writable, interleaved **stereo float32 at 48,000 Hz**. A frame contains left and right samples. `so_process` modifies the buffer in place. Valid calls contain 1–480,000 frames; normal callbacks should be much smaller.
- Load one measured profile before enabling spatial rendering. The bundled `public/hrtf/H3.json` / `H17.json` describe the corresponding little-endian float32 `.bin` file. Validate its SHA-256, sample rate and 256-tap length before passing it to the library. See the player's `NativeRenderer.cs` for the complete loader.
- `angles` has `positions * 2` floats: azimuth/elevation in degrees, with dataset azimuth positive left. `impulses` has `positions * 2 * 256` floats in direction → ear (left, right) → tap order. The load call copies these arrays; the host can release them afterwards.
- `so_configure` takes spatial on/off, listener yaw in degrees, half-width in degrees (clamped 10–85), centre anchor (0–1), and volume (0–1). Host yaw is positive right. The renderer chooses the nearest measured direction and blends old/new filter coefficients across each block. It does not interpolate the measured angular grid or process elevation/pitch/roll.
- Both Original and Spatial use 0.5 shared gain headroom followed by a linked sample-peak guard at 0.94. This is not automatic loudness matching or a true-peak guarantee. Setting volume to 1 does not remove headroom.

## Host lifecycle

```cpp
#include "spatial.h"

void* renderer = so_create();
// Check renderer != nullptr; read and validate the profile in your host.
if (!so_load_hrtf(renderer, angles, impulses, positions, 256)) {
    so_destroy(renderer);
    // Report failure; do not start this renderer's callback.
    return;
}
so_configure(renderer, 1, 0.0f, 45.0f, 0.65f, 0.4f);

// In the host's single audio callback, using the negotiated format above:
so_process(renderer, stereoBuffer, frameCount);

// After stopping/joining that callback:
so_reset(renderer); // e.g. before restarting after a seek
so_destroy(renderer);
```

One audio thread owns `so_process`, `so_reset` and the handle's lifetime. Never reset or destroy a handle concurrently with processing. Configuration and profile loading may run on a control thread while processing: the audio callback tries to acquire the settings mutex and keeps its previous configuration if unavailable. Profile loading alone does not select new coefficients; call `so_configure` afterwards. The C# host defers resets to its audio thread with an atomic flag.

Creation/profile loading allocate; the C++ processing function does not allocate or wait. The desktop host's queue and prepared-track mixer have their own locks, so the complete desktop audio pipeline is not lock-free. The host must negotiate formats, resample other rates, schedule audio, manage devices, decode media and handle errors. Multiple independent handles can render independent sources.

## Build and engine adapters

Build with CMake and MSVC in a developer shell:

```powershell
cmake -S native -B .cache/native-build -G "NMake Makefiles" -DCMAKE_BUILD_TYPE=Release
cmake --build .cache/native-build
ctest --test-dir .cache/native-build --output-on-failure
```

The full Windows package includes the x64 DLL and its source. Unity could call this ABI from a native audio plugin or a carefully managed audio callback; Unreal could wrap it in a native audio effect. Those adapters must validate channel/rate negotiation, callback ownership, packaging, game-thread communication and competing spatializers. They have not been implemented or engine-tested in this release.

A final stereo game mix contains no reliable individual world positions. For source-aware game spatial audio, supply each sound's actual location/listener transform through a future source adapter. AI separation of the finished game mix cannot recover that metadata. The current desktop prepared stage assigns broad musical groups to fixed front angles.

[Windows player, tracking and build guide](native-windows.md) · [Header](../native/spatial.h) · [C# host](../desktop/native/NativeRenderer.cs)
