// File selection must work even if the spatial renderer cannot initialize.
const element=id=>document.getElementById(id),video=element('media');
element('open').onclick=()=>{
  video.pause();
  try{if(!window.Sound360Android)throw new Error('Open the installed Android app to select a local file.');window.Sound360Android.chooseMedia();}
  catch(error){element('status').textContent=error.message;}
};
window.pauseSound360=()=>video.pause();
window.mobileMediaLoading=()=>{video.pause();element('open').disabled=true;element('status').textContent='Opening your file in private app cache…';};
window.mobileMediaReady=item=>{video.pause();video.src=item.url;video.load();element('file').textContent=`${item.name} · ${(item.bytes/1048576).toFixed(1)} MB`;element('open').disabled=false;element('status').textContent='Ready. Press Play in the media controls.';};
window.mobileMediaError=message=>{element('open').disabled=false;element('status').textContent=message;};
import('./player.js').catch(error=>{
  element('status').textContent='Spatial renderer could not load. File selection and original playback remain available. Update Android System WebView, then reopen SonicOrbit.';
  element('engine-info').textContent=`Renderer: ${error.message}`;
  element('original').checked=true;element('original').disabled=true;
});
