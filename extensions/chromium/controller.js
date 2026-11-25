import { sanitize } from './settings.js';
export class ExtensionController{
  constructor(api){this.api=api;this.queue=Promise.resolve();}
  handle(message){const work=this.queue.catch(()=>{}).then(()=>this.dispatch(message));this.queue=work;return work;}
  async exists(){return (await this.api.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[this.api.runtime.getURL('offscreen.html')]})).length>0;}
  async preferences(){
    const saved=(await this.api.storage.local.get('settings')).settings;
    // Reset the old coloured default once when upgrading; preserve the volume cap.
    const value=sanitize(saved?.schema===2?saved:{volume:saved?.volume});value.volume=Math.min(50,value.volume);return value;
  }
  async forward(type,data={}){return this.api.runtime.sendMessage({target:'offscreen',type,...data});}
  async stop(){try{if(await this.exists()){try{await this.forward('STOP');}catch{}await this.api.offscreen.closeDocument();}}finally{await this.api.action.setBadgeText({text:''});}return {running:false};}
  async dispatch(message){
    if(message.type==='STATUS')return await this.exists()?this.forward('STATUS'):{running:false,settings:await this.preferences()};
    if(message.type==='STOP')return this.stop();
    if(message.type==='ENDED'){await this.api.action.setBadgeText({text:''});return {running:false};}
    if(message.type==='STOP_TAB'){if(await this.exists()){const state=await this.forward('STATUS');if(state.tabId===message.tabId)return this.stop();}return {running:false};}
    if(message.type==='UPDATE'){
      const settings=sanitize(message.settings);await this.api.storage.local.set({settings});
      return await this.exists()?this.forward('UPDATE',{settings}):{running:false,settings};
    }
    if(message.type!=='START')throw new Error('Unsupported extension action.');
    const [tab]=await this.api.tabs.query({active:true,currentWindow:true});
    if(!Number.isInteger(tab?.id)||!/^(https?:\/\/|file:\/\/)/i.test(tab.url||''))throw new Error('Open a media web page or permitted local-file tab first. Browser settings and extension pages cannot be processed.');
    await this.stop();
    try{
      await this.api.offscreen.createDocument({url:'offscreen.html',reasons:['USER_MEDIA'],justification:'Process and play only the tab audio explicitly selected by the user. No recording or uploading.'});
      const streamId=await this.api.tabCapture.getMediaStreamId({targetTabId:tab.id});
      const result=await this.forward('START',{streamId,tabId:tab.id,settings:await this.preferences()});
      if(result.error)throw new Error(result.error);
      await this.api.action.setBadgeText({text:'ON'});await this.api.action.setBadgeBackgroundColor({color:'#446035'});return result;
    }catch(error){await this.stop().catch(()=>{});throw error;}
  }
}
