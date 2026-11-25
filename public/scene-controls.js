import { StemPlayer } from './stem-player.js';
import { SCENE_DEFAULTS } from './scene-math.js';
const $ = id => document.getElementById(id);
export class SceneControls {
  constructor({ ensureAudio, getToken, onEnable, onState=()=>{} }) {
    Object.assign(this, { ensureAudio, getToken, onEnable, onState }); this.generation=0;
    for (const name of Object.keys(SCENE_DEFAULTS)) {
      const row=document.createElement('div'); row.className='scene-source';
      const title=document.createElement('strong'); title.textContent={vocals:'Singer / vocals',drums:'Drums / percussion',bass:'Bass',other:'Other instruments'}[name]; row.append(title);
      for(const [key,label,min,max,step,suffix] of [['azimuth','Position',-180,180,5,'°'],['level','Level',-12,6,.5,' dB']]) {
        const field=document.createElement('label'), input=document.createElement('input'), output=document.createElement('output');
        field.textContent=label+' ';input.type='range';input.min=min;input.max=max;input.step=step;input.value=SCENE_DEFAULTS[name][key];input.id=`scene-${name}-${key}`;input.setAttribute('aria-label',`${name} ${label.toLowerCase()}`);output.textContent=input.value+suffix;
        input.oninput=()=>{output.textContent=input.value+suffix;this.player?.objects.get(name).update({[key]:Number(input.value)});this.draw();};field.append(output,input);row.append(field);
      }
      $('scene-sources').append(row);
    }
    $('prepare-stems').onclick=()=>this.prepare().catch(error=>{$('stem-status').textContent=error.message;$('prepare-stems').disabled=false;});
    $('cancel-stems').onclick=async()=>{if(this.media?.id)await fetch(`/api/stems/${this.media.id}/cancel`,{method:'POST',headers:{'X-360-Token':this.getToken()}});};
    $('enable-scene').onchange=()=>{if($('enable-scene').checked)this.onEnable();this.player?.setEnabled($('enable-scene').checked);};
    $('turn-away').oninput=()=>{this.applyOptions();$('turn-away-value').textContent=$('turn-away').value+'%';};
    $('hrtf-profile').onchange=async()=>{
      const select=$('hrtf-profile');select.disabled=true;$('hrtf-status').textContent='Loading local headphone profile…';
      try{await this.engine?.setHrtfProfile(select.value);$('hrtf-status').textContent=select.value==='browser'?'Browser HRTF active for AI objects.':'Measured SADIE II profile active for AI objects. Ear anatomy varies; compare comfort and front/back placement. Room reflections use browser HRTF.';}
      catch(error){select.value='browser';await this.engine?.setHrtfProfile('browser');$('hrtf-status').textContent=error.message;}
      finally{select.disabled=false;}
    };
    $('theatre-room').oninput=()=>{this.applyOptions();$('theatre-room-value').textContent=$('theatre-room').value+'%';};
    $('scene-layout').onchange=()=>{
      const layout=$('scene-layout').value==='surround'?{vocals:0,drums:110,bass:-15,other:-100}:{vocals:0,drums:35,bass:-10,other:-40};
      for(const [name,angle]of Object.entries(layout)){const input=$(`scene-${name}-azimuth`);input.value=angle;input.oninput();}
    };
    this.draw();
  }
  async reset(media) {
    const generation=++this.generation;clearTimeout(this.poll);this.player?.dispose();this.player=null;this.media=media;
    $('enable-scene').checked=false;$('enable-scene').disabled=true;$('scene-controls').disabled=true;$('speed').disabled=false;
    $('prepare-stems').disabled=!media?.id||this.capabilities?.aiSeparation===false;$('cancel-stems').hidden=true;$('stem-progress').hidden=true;
    $('prepare-stems').textContent='Prepare local AI tracks';
    this.onState();
    $('stem-status').textContent=media?.id?'Separate vocals, drums, bass and other instruments on this PC. First 5 minutes; longer videos use stereo beyond that.':'Use Open by path for local AI separation. File-picker playback still supports the stereo spatializer.';
    if(!media?.id)return;
    if(this.capabilities?.aiSeparation===false){$('prepare-stems').textContent='AI setup required';$('stem-status').textContent='Optional AI separation needs the local Python environment and FFmpeg. See Help for setup. Ordinary spatial playback is ready.';}
    try { const data=await(await fetch(`/api/stems/${media.id}`)).json();if(generation===this.generation&&data.state==='ready'){$('prepare-stems').disabled=false;$('prepare-stems').textContent='Load prepared AI tracks';$('stem-status').textContent='Four AI tracks are already prepared locally for this video. Load them to place the singer and instruments.';} } catch {}
  }
  async prepare() {
    const media=this.media, generation=this.generation;if(!media?.id)return;
    $('prepare-stems').disabled=true; const response=await fetch(`/api/stems/${media.id}`,{method:'POST',headers:{'X-360-Token':this.getToken()}}),data=await response.json();
    if(!response.ok)throw new Error(data.error); if(generation!==this.generation)return;
    const poll=async state=>{
      if(generation!==this.generation)return;
      $('stem-progress').hidden=false;$('stem-progress').value=state.progress||0;
      if(state.state==='ready'){
        $('cancel-stems').hidden=true;
        const engine=await this.ensureAudio();if(generation!==this.generation)return;this.engine=engine;
        const player=new StemPlayer(document.getElementById('video'),engine,enabled=>{
          if(generation!==this.generation)return;$('enable-scene').checked=enabled;$('speed').disabled=enabled;
          if(enabled)$('speed').value='1';
          this.onState();
          $('stem-status').textContent=enabled?'AI object scene active · singer and instruments anchored to the screen. Press A for the original.':`AI tracks loaded · ${Math.round(player.duration)} seconds available. Enable the object scene to listen.`;
        });this.player=player;
        try { await player.load(state,text=>{if(generation===this.generation)$('stem-status').textContent=text;}); }
        catch(error){player.dispose();if(generation===this.generation)this.player=null;throw error;}
        if(generation!==this.generation){player.dispose();return;}
        $('stem-progress').hidden=true;$('enable-scene').disabled=false;$('scene-controls').disabled=false;$('prepare-stems').textContent='AI tracks loaded';
        for(const[name,object]of player.objects)object.update({azimuth:Number($(`scene-${name}-azimuth`).value),level:Number($(`scene-${name}-level`).value)});
        this.applyOptions();
        try{await engine.setHrtfProfile($('hrtf-profile').value);}catch(error){$('hrtf-profile').value='browser';await engine.setHrtfProfile('browser');$('hrtf-status').textContent=error.message;}
        if(generation!==this.generation)return;this.onEnable();player.setEnabled(true);return;
      }
      if(['error','cancelled'].includes(state.state)){ $('cancel-stems').hidden=true;$('stem-progress').hidden=true;$('prepare-stems').disabled=false;throw new Error(state.error||'Local separation cancelled.'); }
      $('cancel-stems').hidden=false;$('stem-status').textContent=`Local AI: ${state.state} · ${Math.round((state.progress||0)*100)}%. Your media stays on this PC.`;
      this.poll=setTimeout(async()=>{try{const result=await fetch(`/api/stems/${media.id}`);if(!result.ok)throw new Error('Cannot read the local AI job.');await poll(await result.json());}catch(error){if(generation===this.generation){$('stem-status').textContent=error.message;$('prepare-stems').disabled=false;$('cancel-stems').hidden=true;}}},1000);
    };await poll(data);
  }
  applyOptions() { this.engine?.setSceneOptions({turnAway:Number($('turn-away').value)/100,theatre:Number($('theatre-room').value)}); }
  setYaw(degrees) {this.yaw=degrees;this.draw();}
  draw() {
    const canvas=$('scene-map'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,cx=w/2,cy=h*.55,r=h*.34;
    ctx.clearRect(0,0,w,h);ctx.strokeStyle='#3e4b36';ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#a6b49b';ctx.font='11px Segoe UI';ctx.textAlign='center';ctx.fillText('SCREEN / FRONT',cx,16);
    for(const[name,defaults]of Object.entries(SCENE_DEFAULTS)){const angle=Number($(`scene-${name}-azimuth`)?.value??defaults.azimuth)*Math.PI/180;const x=cx+Math.sin(angle)*r,y=cy-Math.cos(angle)*r;ctx.fillStyle=name==='vocals'?'#f0deb0':'#bfdda2';ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();ctx.fillText(name,x,y+(y<cy?-12:18));}
    ctx.save();ctx.translate(cx,cy);ctx.rotate((this.yaw||0)*Math.PI/180);ctx.fillStyle='#f4f5ec';ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(8,8);ctx.lineTo(-8,8);ctx.closePath();ctx.fill();ctx.restore();
  }
}
