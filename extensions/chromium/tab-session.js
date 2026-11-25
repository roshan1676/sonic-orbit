import { sanitize } from './settings.js';
export class TabAudioSession{
  constructor({getUserMedia,createContext,createSpatialAudio,onEnded=()=>{}}){Object.assign(this,{getUserMedia,createContext,createSpatialAudio,onEnded});this.generation=0;this.settings=sanitize();}
  status(){return {running:!!this.current,tabId:this.current?.tabId,settings:this.settings,sampleRate:this.current?.context.sampleRate};}
  async update(settings){
    this.settings=sanitize(settings);const current=this.current,sdk=current?.sdk;
    if(sdk){
      sdk.update({...this.settings,output:'headphones',preset:'custom',warmth:0,treble:0,tightness:0,focus:0,dynamics:0,height:0});
      sdk.setSceneOptions({theatre:this.settings.theatre});sdk.setHeadPose(this.settings.yaw*Math.PI/180,0);
      if(current.hrtf!==this.settings.hrtf){await sdk.setHrtfProfile(this.settings.hrtf);current.hrtf=this.settings.hrtf;}
    }return this.status();
  }
  async release(current){if(!current)return;current.source?.disconnect();current.stream?.getTracks().forEach(track=>track.stop());await current.sdk?.dispose();if(current.context&&current.context.state!=='closed')await current.context.close();}
  async stop(){this.generation++;const current=this.current;this.current=null;await this.release(current);return this.status();}
  async start({streamId,tabId,settings}){
    await this.stop();const generation=++this.generation,current={tabId};let timer,expired=false;
    try{
      const request=this.getUserMedia({audio:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:streamId}},video:false}).then(stream=>{if(expired||generation!==this.generation){stream.getTracks().forEach(track=>track.stop());throw new Error('Tab capture cancelled.');}return stream;});
      current.stream=await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('Tab capture timed out. Try this tab again.'));},15000);})]);clearTimeout(timer);
      current.context=this.createContext();current.sdk=await this.createSpatialAudio({context:current.context});
      if(generation!==this.generation)throw new Error('Tab capture cancelled.');
      current.source=current.context.createMediaStreamSource(current.stream);current.source.connect(current.sdk.input);await current.context.resume();
      if(generation!==this.generation)throw new Error('Tab capture cancelled.');
      this.current=current;await this.update(settings);
      if(generation!==this.generation)throw new Error('Tab capture cancelled.');
      for(const track of current.stream.getTracks())track.addEventListener('ended',()=>{if(this.current===current){this.stop().then(()=>this.onEnded(),()=>this.onEnded());}});
      return this.status();
    }catch(error){clearTimeout(timer);if(this.current===current)this.current=null;await this.release(current);throw error;}
  }
}
