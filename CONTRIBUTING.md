# Contributing to SonicOrbit

Use Node.js 22+; release checks use Node 24. Run `npm ci` and `npm test` before submitting a pull request. Include the problem, observable behavior, and relevant verification. Run the browser checks at `/self-test.html` for changes to the audio graph or module. A CI template is supplied in `docs/ci-workflow.yml.example`; automatic Actions checks are not enabled in this initial publication.

Keep AI work out of the render callback. Preserve Original comparison and shared headroom. Treat inferred music positions as creative placement; avoid claims of recovering original surround metadata. Do not change platform permissions or add remote media/camera upload paths casually. Document actual hardware/latency tests separately from synthetic tests.

Please open an issue before large native SDK, audio-routing, codec or model changes. Do not commit personal media, face frames, model caches, `.venv-audio`, signing keys or credentials. Preserve third-party attribution. Contributions are submitted under the project's MIT license.
