# SonicOrbit and Dolby Atmos: defensible comparison

We currently have **more direct experimental control for our specific remix workflow**, not evidence of better overall sound than Dolby Atmos. Dolby Atmos is a content/authoring/rendering ecosystem; SonicOrbit is an experimental renderer/player with optional music separation. Compare a specific Dolby product, version and device route, rather than treating all Atmos implementations as identical.

## Strengths we can demonstrate in our prototype

| Strength for this project | Evidence in our system | Appropriate claim |
| --- | --- | --- |
| Editable musical stage from a stereo song | The desktop player separates vocals, drums, bass and other instruments, then exposes source angles and levels | “Place the singer and broad instrument groups yourself.” Separation may leak or produce artifacts; locations are creative choices |
| Visible tracking setup | Camera view, landmarks, framing/light guidance, filter controls and a still-head setup sample | “Inspect and tune the prototype's tracking.” Absolute accuracy and motion-to-sound performance are unmeasured |
| Headphone profile experimentation | Browser HRTF plus H3/H17 measured profiles for desktop AI objects | “Audition different ear profiles.” These are not personal measurements or a proven fit improvement |
| Reusable, editable implementation | The local Web module accepts AudioNodes, source/listener transforms, custom routing and lifecycle controls; source files and documentation are supplied | “Embed and modify this browser renderer.” Native Unity/Unreal adapters are not shipped |
| Flexible artistic focus | Independent stem gain/angle, optional turn-away reduction and short room reflections | “Control the listening presentation explicitly.” These effects alter the recording and do not recover its original mix |
| Local reference workflow | Desktop separation/playback/pose processing uses local files after dependency setup | “Your selected media is processed locally.” Offline processing is not an exclusive advantage over other renderers |

These are product capabilities we implemented. They do not establish that Dolby lacks similar authoring or platform features. Atmos authoring can position and move sound objects, including overhead; consumer controls depend on the application and device. See [Dolby's description of object placement](https://professional.dolby.com/siteassets/tv/home/dolby-atmos/dolby-atmos-for-sound-bar-applications.pdf).

## Where we cannot claim a win

- **Original artistic intent:** Properly authored Atmos carries source/object placement information. Our stereo music separation infers broad groups and adds a new stage. More audible movement is not proof of more faithful reproduction. Dolby describes object rendering for the actual speaker layout in its [home-theater overview](https://professional.dolby.com/siteassets/tv/home/dolby-atmos/dolby-atmos-for-home-theater.pdf).
- **Full Atmos playback:** We do not decode or encode Atmos metadata, preserve multichannel input directions, or drive a real 7.1.4 speaker layout. The current renderer outputs stereo; our speaker mode is a conventional stereo mix.
- **Sound quality/localization:** No controlled comparison establishes better clarity, bass accuracy, externalization, front/back distinction or elevation accuracy. Profile matching and source-separation artifacts may make our output worse for a listener.
- **Tracking:** Full quaternion rendering works, but a face camera cannot measure the back of a head. Other platforms can combine head tracking with spatial playback; “head tracking exists” is not a unique win.
- **Performance and reach:** Our browser extension and Android APK require real-world compatibility/latency/battery testing. Native game plugins, system-wide routing and broad protected-content support are not implemented. We cannot claim lower CPU, lower latency, longer battery life or wider compatibility.
- **Headphones:** Headphone playback is not a unique differentiator. Dolby documents conventional-headphone rendering in [its Atmos concept explanation](https://professionalsupport.dolby.com/s/article/Dolby-Atmos-Understanding-the-Concept?language=en_US). Nor is two-channel headphone output equivalent to a physical room full of speakers.

## Evidence needed before “better than Dolby Atmos”

Choose a defined Dolby setup and test the same device, output route and content. Separate two questions: localization with known source positions, and preference for creative upmixing of ordinary stereo. Use level-matched randomized listening comparisons with multiple listeners/headphones, covering front/back, azimuth, elevation, timbre, vocal clarity, separation artifacts and comfort. Record localization error and front/back confusion separately from preference.

Measure end-to-end motion-to-sound delay, lip sync, CPU/memory and Android battery cost under realistic loads. Test actual surround/object material separately from stereo songs; comparing a specially processed song against a different Atmos master cannot isolate renderer quality. Automated finite-output and geometry tests are engineering evidence, not perceptual superiority evidence.

**Current positioning:** “A customizable local spatial-audio lab for remixing ordinary media and developing reusable audio modules.” Our clearest advantage for this user is control and inspectability. Better overall sound remains a hypothesis to test, rather than a defensible advertising claim today.
