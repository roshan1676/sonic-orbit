// Classic worker is deliberate: MediaPipe's non-module WASM loader publishes
// ModuleFactory through importScripts. A module worker changes that scope.
importScripts('/vendor/vision_bundle.js');

let landmarker;
let matrixToPose;
let lightCanvas, lightContext;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      ({ matrixToPose } = await import('./head-pose.js'));
      const files = { wasmLoaderPath: '/vendor/wasm/vision_wasm_internal.js', wasmBinaryPath: '/vendor/wasm/vision_wasm_internal.wasm' };
      landmarker = await Vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'CPU' },
        runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true, minFaceDetectionConfidence: 0.6,
        minFacePresenceConfidence: 0.6, minTrackingConfidence: 0.6
      });
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'frame') {
      const started = performance.now();
      try {
        const result = landmarker.detectForVideo(data.frame, data.timestamp);
        const pose = matrixToPose(result.facialTransformationMatrixes?.[0]);
        const landmarks = result.faceLandmarks?.[0];
        let quality = 0;
        let faceWidth=0, brightness=0, bounds=null;
        if (pose && landmarks?.length) {
          const xs = landmarks.map(p => p.x), ys = landmarks.map(p => p.y);
          const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
          faceWidth=width;bounds={x:Math.min(...xs),y:Math.min(...ys),width,height};
          const inFrame = landmarks.filter(p => p.x > 0.02 && p.x < 0.98 && p.y > 0.02 && p.y < 0.98).length / landmarks.length;
          // Heuristic frame quality, not a model-provided probability/confidence.
          quality = Math.min(1, width / 0.2, height / 0.25) * inFrame * Math.max(0.25, Math.cos(pose.yaw));
        }
        if(!lightCanvas){lightCanvas=new OffscreenCanvas(32,24);lightContext=lightCanvas.getContext('2d',{willReadFrequently:true});}
        if(bounds&&bounds.width>0&&bounds.height>0&&bounds.x<1&&bounds.y<1){const x=Math.max(0,bounds.x),y=Math.max(0,bounds.y),w=Math.min(1-x,bounds.width),h=Math.min(1-y,bounds.height);lightContext.drawImage(data.frame,x*data.frame.width,y*data.frame.height,w*data.frame.width,h*data.frame.height,0,0,32,24);}
        else lightContext.drawImage(data.frame,0,0,32,24);
        const pixels=lightContext.getImageData(0,0,32,24).data;for(let i=0;i<pixels.length;i+=4)brightness+=(pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722)/(pixels.length/4);
        const overlayPoints=landmarks?new Float32Array(landmarks.flatMap(p=>[p.x,p.y])):null;
        const message={ type: 'pose', pose, quality, faceWidth, brightness, landmarks:overlayPoints, timestamp: data.timestamp, inferenceMs: performance.now() - started };
        self.postMessage(message,overlayPoints?[overlayPoints.buffer]:[]);
      } finally { data.frame.close(); }
    }
  } catch (error) { self.postMessage({ type: 'error', message: error.message || 'Head tracking failed.' }); }
};
