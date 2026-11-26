#pragma once
#ifdef _WIN32
#define SO_API extern "C" __declspec(dllexport)
#else
#define SO_API extern "C" __attribute__((visibility("default")))
#endif
// All audio uses interleaved stereo float32 at 48 kHz. The host owns device I/O.
SO_API void* so_create();
SO_API void so_destroy(void* handle);
SO_API int so_load_hrtf(void* handle, const float* angles, const float* impulses, int positions, int taps);
SO_API void so_configure(void* handle, int spatial, float yawDegrees, float widthDegrees, float anchor, float volume);
SO_API void so_reset(void* handle);
SO_API void so_process(void* handle, float* interleaved, int frames);
