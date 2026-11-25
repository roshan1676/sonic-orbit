const datasets=new WeakMap();
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
export function sofaDirection(position,basis){
  const f=basis.forward,u=basis.up,r=[f[1]*u[2]-f[2]*u[1],f[2]*u[0]-f[0]*u[2],f[0]*u[1]-f[1]*u[0]],distance=Math.hypot(...position)||1;
  // SOFA: X front, Y left, Z up. Web Audio: +X right, -Z front.
  return [dot(position,f)/distance,-dot(position,r)/distance,dot(position,u)/distance];
}
export function nearestDirection(vectors,direction){
  let best=-Infinity,index=0;
  vectors.forEach((v,i)=>{const score=dot(v,direction);if(score>best){best=score;index=i;}});return index;
}
export async function loadHrtf(context,name,assetBaseUrl=new URL('./',import.meta.url)){
  if(name==='browser')return null;
  if(!['H3','H17'].includes(name))throw new Error('Unknown headphone profile.');
  const base=new URL(assetBaseUrl),key=base.href+'|'+name;
  if(!datasets.has(context))datasets.set(context,new Map());const cache=datasets.get(context);if(cache.has(key))return cache.get(key);
  const loading=(async()=>{
    const [metaResponse,irResponse]=await Promise.all([fetch(new URL(`hrtf/${name}.json`,base)),fetch(new URL(`hrtf/${name}.bin`,base))]);
    if(!metaResponse.ok||!irResponse.ok)throw new Error('Measured headphone assets are missing. See README for setup.');
    const meta=await metaResponse.json(),bytes=await irResponse.arrayBuffer();
    if(meta.sampleRate!==48000||meta.taps!==256||!meta.positions?.length||bytes.byteLength!==meta.positions.length*2*256*4)throw new Error('Invalid headphone data.');
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(digest!==meta.sha256)throw new Error('Headphone asset checksum mismatch.');
    const data=new Float32Array(bytes);if(!data.every(Number.isFinite))throw new Error('Invalid headphone samples.');
    const buffers=meta.positions.map((_,index)=>{
      const ratio=context.sampleRate/meta.sampleRate,length=Math.ceil(meta.taps*ratio),buffer=context.createBuffer(2,length,context.sampleRate);
      for(let ear=0;ear<2;ear++){const out=buffer.getChannelData(ear),base=(index*2+ear)*meta.taps;
        for(let i=0;i<length;i++){const at=i/ratio,j=Math.floor(at),fraction=at-j;out[i]=((data[base+j]||0)*(1-fraction)+(j+1<meta.taps?data[base+j+1]:0)*fraction)/ratio;}
      }return buffer;
    });
    const vectors=meta.positions.map(([az,el])=>{az*=Math.PI/180;el*=Math.PI/180;return [Math.cos(el)*Math.cos(az),Math.cos(el)*Math.sin(az),Math.sin(el)];});
    return {name,buffers,vectors};
  })();cache.set(key,loading);try{return await loading;}catch(error){cache.delete(key);throw error;}
}
export class MeasuredPanner{
  constructor(context){this.context=context;this.input=context.createGain();this.output=context.createGain();this.output.gain.value=0;this.paths=new Set();this.index=-1;this.lastUpdate=-Infinity;}
  setProfile(data){if(this.data===data)return;clearTimeout(this.clearTimer);this.data=data;this.index=-1;this.lastUpdate=-Infinity;this.output.gain.setTargetAtTime(data?1:0,this.context.currentTime,.025);if(!data)this.clearTimer=setTimeout(()=>this.clear(),100);}
  update(position,basis,immediate=false){
    if(!this.data)return;const now=this.context.currentTime;
    if(!immediate&&now-this.lastUpdate<.04)return;
    const index=nearestDirection(this.data.vectors,sofaDirection(position,basis));if(index===this.index)return;
    this.index=index;this.lastUpdate=now;
    const convolver=this.context.createConvolver(),envelope=this.context.createGain();convolver.normalize=false;convolver.buffer=this.data.buffers[index];envelope.gain.value=immediate?1:0;
    this.input.connect(convolver);convolver.connect(envelope);envelope.connect(this.output);
    const path={convolver,envelope};
    for(const old of this.paths){old.envelope.gain.cancelScheduledValues(now);old.envelope.gain.setValueAtTime(old.envelope.gain.value,now);old.envelope.gain.linearRampToValueAtTime(0,now+.025);
      if(!old.timer)old.timer=setTimeout(()=>this.remove(old),60);
    }
    if(!immediate)envelope.gain.linearRampToValueAtTime(1,now+.025);this.paths.add(path);
  }
  remove(path){clearTimeout(path.timer);try{this.input.disconnect(path.convolver);}catch{}path.convolver.disconnect();path.envelope.disconnect();this.paths.delete(path);}
  clear(){for(const path of this.paths)this.remove(path);}
  disconnect(){clearTimeout(this.clearTimer);this.clear();this.input.disconnect();this.output.disconnect();}
}
