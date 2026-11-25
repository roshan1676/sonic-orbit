import { analyzeTracking, framingAdvice } from './tracking-analysis.js';

const FACE=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];
const EYES=[[33,160,158,133,153,144,33],[362,385,387,263,373,380,362]];
export function paintCameraOverlay(canvas,video,frame,{mirror=true,detailed=true,pose}={}) {
  const width=384,height=Math.round(width*(video?.videoHeight||3)/(video?.videoWidth||4));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,width,height);
  if(video?.readyState>=2){ctx.save();if(mirror){ctx.translate(width,0);ctx.scale(-1,1);}ctx.drawImage(video,0,0,width,height);ctx.restore();}
  else {ctx.fillStyle='#10170f';ctx.fillRect(0,0,width,height);}
  ctx.strokeStyle='#bfdda288';ctx.lineWidth=1;ctx.setLineDash([5,5]);
  ctx.beginPath();ctx.ellipse(width/2,height*.47,width*.22,height*.36,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  const points=frame?.landmarks;
  const point=index=>[ (mirror?1-points[index*2]:points[index*2])*width,points[index*2+1]*height ];
  if(points?.length>=956){
    const line=indices=>{ctx.beginPath();indices.forEach((index,i)=>{const [x,y]=point(index);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();};
    ctx.strokeStyle=frame.quality>=.5?'#bfdda2':'#eed5aa';ctx.lineWidth=1.4;line(FACE);for(const eye of EYES)line(eye);line([61,13,291,14,61]);
    if(detailed){ctx.fillStyle='#bfdda2aa';for(let i=0;i<478;i+=5){const[x,y]=point(i);ctx.fillRect(x-1,y-1,2,2);}}
    const[x,y]=point(1),raw=frame.pose;
    const dx=-Math.sin(raw?.yaw||0)*width*.18,dy=-Math.sin(raw?.pitch||0)*height*.18;
    ctx.strokeStyle='#f5f7ed';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,y+dy);ctx.stroke();ctx.fillStyle='#f5f7ed';ctx.beginPath();ctx.arc(x+dx,y+dy,3,0,Math.PI*2);ctx.fill();
  }
  ctx.fillStyle='#071006cc';ctx.fillRect(0,height-32,width,32);ctx.fillStyle='#e4efda';ctx.font='12px system-ui';
  ctx.fillText(frame?.pose?`HEAD ${Math.round((pose?.yawDegrees??0))}°  ·  LOCAL CAMERA`:'Camera guide · no face measurement',10,height-12);
}

export class CameraOverlay {
  constructor({video,canvases,onTune}){
    Object.assign(this,{video,canvases,onTune});this.active=false;this.samples=null;this.lastPose={yawDegrees:0};
  }
  setActive(active){
    this.active=active;this.samples=null;clearTimeout(this.analysisTimer);
    document.getElementById('camera-monitor').hidden=!active;
    document.getElementById('tracking-hud').hidden=!active||!document.getElementById('show-camera-hud').checked;
    document.getElementById('auto-tune').disabled=!active;
    document.getElementById('tune-progress').hidden=true;
    if(!active){this.frame=null;this.canvases.forEach(c=>{const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);});document.getElementById('camera-guidance').textContent='Enable camera tracking to see live landmarks and setup guidance.';}
  }
  setPose(pose){this.lastPose=pose;}
  receive(frame){
    if(!frame){this.setActive(false);return;}this.frame=frame;
    if(!this.active)return;
    const detailed=document.getElementById('show-landmarks').checked;
    for(const canvas of this.canvases)if(canvas.offsetWidth>0)paintCameraOverlay(canvas,this.video,frame,{detailed,pose:this.lastPose});
    document.getElementById('camera-guidance').textContent=framingAdvice(frame);
    document.getElementById('camera-light').textContent=`Face light: ${Math.round(frame.brightness??0)}/255`;
    document.getElementById('camera-framing').textContent=frame.pose?`Face width: ${Math.round((frame.faceWidth||0)*100)}%`:'Face not found';
    if(this.samples){this.samples.push(frame);const progress=Math.min(1,(performance.now()-this.analysisStarted)/3200);document.getElementById('tune-progress').value=progress;}
  }
  analyze(){
    if(!this.active)return;this.samples=[];this.analysisStarted=performance.now();
    document.getElementById('tune-progress').hidden=false;document.getElementById('tune-progress').value=0;
    document.getElementById('tune-result').textContent='Hold still, facing the screen. Sampling tracking and lighting for 3 seconds…';
    document.getElementById('auto-tune').disabled=true;
    this.analysisTimer=setTimeout(()=>{
      const result=analyzeTracking(this.samples||[]);this.samples=null;document.getElementById('tune-progress').hidden=true;document.getElementById('auto-tune').disabled=!this.active;
      document.getElementById('tune-result').textContent=result.message;
      if(result.ok){this.onTune(result.settings);document.getElementById('tune-result').textContent+=` Still-head variation ${result.jitterDegrees.toFixed(2)}°; model p95 ${Math.round(result.inferenceP95)} ms. These are setup estimates, not absolute accuracy.`;}
    },3200);
  }
}
