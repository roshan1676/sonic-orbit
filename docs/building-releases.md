# Building SonicOrbit releases

## Web packages

Use Node.js 22+ (release checks use 24): `npm ci`, `npm test`, then `npm run build:sdk` or `npm run build:extension`. The small SADIE II HRIR assets are committed with their Apache license/attribution, so clean builds need no camera/AI model download. Web Audio worklet/profile files resolve relative to the module package.

## Android

On Windows, install JDK 17+, SDK platform 35 and build tools 36.0.0. Set `ANDROID_HOME` or `ANDROID_SDK_ROOT` for a nonstandard SDK path. Run `npm run build:android`.

The helper uses AAPT2, javac, D8, zipalign and apksigner without Gradle. It packages the module and compiles/verifies the Java host. Its development key stays in ignored `.cache`; never commit it. The package ID is `io.github.roshan1676.sonicorbit`. Phone testing and a deliberately managed release signing identity are needed before a store release.

## Windows portable player

Run `npm run build:windows` on Windows x64 with its .NET Framework C# compiler available. The helper downloads official Node v24.22.3, verifies the archive against Node's official SHA-256 list, and bundles its unmodified runtime and license/provenance. It compiles `desktop/windows/Launcher.cs` to `SonicOrbit.exe` without a commercial certificate.

Runtime dependencies are included. The face model downloads/checksums on first camera enable; Python, FFmpeg and AI weights are optional setup. Personal media, caches, keys and Python environments must never enter an archive.

## Complete release

Run `npm run build:release`. It builds all platforms, stages distributable files, writes versioned ZIP/APK files into `dist/release`, and creates `SHA256SUMS.txt`. Staging excludes `.cache`, `.git`, `.venv-audio`, test screenshots, model task bundles and personal media. Documentation is a separate download.

Before publishing, run automated and browser checks, test a clean portable launch, inspect ZIP contents, verify APK permissions/signature and scan the staged Git tree. Verify asset links after upload. Simulated extension tests and APK build checks do not establish device compatibility or perceptual quality.

Version metadata is in `package.json`, `public/version.js`, extension `version_name` and Android flags/manifest. Preserve Chrome's numeric extension version format. Update types/tests when changing the API version. The CI template checks Node 24 tests and Web/extension builds on Windows/Ubuntu. It is supplied as `docs/ci-workflow.yml.example` because the initial publishing credential lacks GitHub's `workflow` scope. A maintainer with workflow permission can copy it to `.github/workflows/ci.yml` to enable Actions. No automatic CI result is claimed for the initial release. Rebuilding with another debug key cannot update an installed APK signed by the first key; manage production signing separately.
