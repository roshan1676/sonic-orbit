const mean = xs => xs.reduce((a,b)=>a+b,0)/xs.length;
const median = xs => { const sorted=[...xs].sort((a,b)=>a-b); return sorted[Math.floor(sorted.length/2)]; };
const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
export function analyzeTracking(samples) {
  const valid=samples.filter(s=>s.pose && s.quality>=0.45 && [s.pose.yaw,s.pose.pitch,s.inferenceMs].every(Number.isFinite));
  if (valid.length<15) return {ok:false,message:'Not enough clear face samples. Face the camera, improve lighting, and retry.'};
  const yaw0=valid[0].pose.yaw;
  const yaw=valid.map(s=>Math.atan2(Math.sin(s.pose.yaw-yaw0),Math.cos(s.pose.yaw-yaw0)));
  const pitch=valid.map(s=>s.pose.pitch), range=xs=>Math.max(...xs)-Math.min(...xs);
  if (Math.max(range(yaw),range(pitch))>0.12) return {ok:false,message:'Your head moved during the sample. Hold still and retry; movement is not camera jitter.'};
  const variance=xs=>{const m=mean(xs);return mean(xs.map(x=>(x-m)**2));};
  const jitter=Math.sqrt((variance(yaw)+variance(pitch))/2)*180/Math.PI;
  const costs=valid.map(s=>s.inferenceMs).sort((a,b)=>a-b), p95=costs[Math.floor((costs.length-1)*0.95)];
  const brightness=median(valid.map(s=>s.brightness??100));
  const settings={smoothing:Math.round(clamp(28+jitter*22,28,75)),deadzone:Math.round(clamp(jitter*0.65,0.1,1.2)*20)/20,prediction:p95>65?10:20,maxFps:p95>65?12:p95>35?24:30,sensitivity:1};
  return {ok:true,settings,jitterDegrees:jitter,inferenceP95:p95,brightness,message:`Tracking starting settings applied from ${valid.length} samples.${brightness<45?' More light may help more than extra smoothing.':''}`};
}

export function framingAdvice(frame) {
  if (!frame?.pose) return 'Move into the camera guide so your face is visible.';
  if (frame.brightness<40) return 'Your face looks dark in this frame. Try more light in front of you.';
  if (frame.brightness>225) return 'The face region looks overexposed. Reduce direct light.';
  if (frame.faceWidth<0.15) return 'Move a little closer to the camera.';
  if (frame.quality<0.5) return 'Keep your full face inside the frame, then Recenter.';
  return 'Framing looks usable. Face the screen and hold still to tune tracking.';
}
