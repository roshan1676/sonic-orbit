import { ExtensionController } from './controller.js';
const controller=new ExtensionController(chrome);
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message?.target!=='background'||sender.id!==chrome.runtime.id)return;
  controller.handle(message).then(respond,error=>respond({error:error.message}));return true;
});
chrome.tabs.onRemoved.addListener(tabId=>controller.handle({type:'STOP_TAB',tabId}).catch(()=>{}));
