import { createAudioEngine } from '../audio-engine.js';
import { normalizeQuaternion } from '../orientation.js';
import { vector3, relativeSource } from './source-geometry.js';

export { VERSION } from '../version.js';
import { VERSION } from '../version.js';
const mediaNodes=new WeakMap();
const activeContexts=new WeakSet();

/** Browser SDK. The caller owns playback and tracking; no DOM or camera startup. */
export async function createSpatialAudio(options={}) {
  const maxSources=options.maxSources??32;
  if(!Number.isInteger(maxSources)||maxSources<1||maxSources>128)throw new RangeError('maxSources must be an integer from 1 to 128.');
  const assetBaseUrl=new URL(options.assetBaseUrl || '../',import.meta.url);
  if(!assetBaseUrl.pathname.endsWith('/'))assetBaseUrl.pathname+='/';
  const ownsContext=!options.context;
  const context=options.context || new AudioContext({latencyHint:'interactive'});
  if(activeContexts.has(context))throw new Error('Use one spatial audio module per AudioContext.');
  activeContexts.add(context);
  let engine;
  try{engine=await createAudioEngine(context,{guard:options.guard??true,onMeter:options.onMeter,destination:options.destination===undefined?context.destination:options.destination,assetBaseUrl});}
  catch(error){activeContexts.delete(context);if(ownsContext)await context.close();throw error;}
  const sources=new Map(),attachments=new Set(),mediaAttachments=new WeakMap();let listenerPosition=[0,0,0],disposed=false,disposePromise;
  const alive=()=>{if(disposed)throw new Error('Spatial audio module has been disposed.');};
  const disconnectGraph=engine.disconnect;
  engine.update({mode:'enhanced',space:100,...options.settings},true);

  const sdk=Object.assign(engine,{
    version:VERSION,
    async resume(){alive();if(typeof context.resume==='function'&&context.state==='suspended')await context.resume();},
    addSource({id,node,position=[0,0,-2],level=0,referenceDistance=2,rolloff=1}={}){
      alive();if(typeof id!=='string'||!id.trim())throw new TypeError('A nonempty source id is required.');
      if(sources.has(id))throw new Error(`Source already exists: ${id}`);
      if(sources.size>=maxSources)throw new Error(`Source limit reached (${maxSources}). Remove a source before adding another.`);
      const location=vector3(position);
      if(![level,referenceDistance,rolloff].every(Number.isFinite))throw new TypeError('Source level and distance settings must be finite.');
      const object=engine.createSceneSource(id);let released=false,world=location;
      const check=()=>{alive();if(released)throw new Error(`Source has been removed: ${id}`);};
      const refresh=()=>object.update(relativeSource(world,listenerPosition));
      const source={id,input:object.input,
        get position(){return [...world];},
        setPosition(value){check();world=vector3(value);refresh();return source;},
        setLevel(value){check();if(!Number.isFinite(value))throw new TypeError('Source level must be finite.');object.update({level:value});return source;},
        setDistanceModel({referenceDistance=object.options.referenceDistance,rolloff=object.options.rolloff}={}){check();if(![referenceDistance,rolloff].every(Number.isFinite))throw new TypeError('Distance settings must be finite.');object.update({referenceDistance,rolloff});return source;},
        dispose(){if(released)return;released=true;if(node){try{node.disconnect(object.input);}catch{}}object.disconnect();sources.delete(id);if(!sources.size&&!disposed)engine.setSceneEnabled(false);},
        refresh
      };
      object.update({...relativeSource(world,listenerPosition),level,referenceDistance,rolloff});
      try{if(node)node.connect(object.input);}catch(error){object.disconnect();throw error;}
      sources.set(id,source);engine.setSceneEnabled(true);return source;
    },
    removeSource(id){alive();const source=sources.get(id);if(!source)return false;source.dispose();return true;},
    setListenerPose({position,orientation}={},immediate=false){
      alive();const nextPosition=position===undefined?listenerPosition:vector3(position,'listener position');
      const quaternion=orientation===undefined?null:normalizeQuaternion(orientation);if(orientation!==undefined&&!quaternion)throw new TypeError('Listener orientation must be a finite, nonzero quaternion.');
      listenerPosition=nextPosition;for(const source of sources.values())source.refresh();if(quaternion)engine.setHeadOrientation(quaternion,immediate);
    },
    attachMediaElement(element){
      alive();if(!mediaNodes.has(context))mediaNodes.set(context,new WeakMap());const cache=mediaNodes.get(context);
      if(mediaAttachments.has(element))return mediaAttachments.get(element);
      let node=cache.get(element);if(!node){node=context.createMediaElementSource(element);cache.set(element,node);}
      node.connect(engine.input);let detached=false;
      const attachment={node,detach(){if(detached)return;detached=true;try{node.disconnect(engine.input);}catch{}attachments.delete(attachment);mediaAttachments.delete(element);}};
      attachments.add(attachment);mediaAttachments.set(element,attachment);return attachment;
    },
    dispose(){
      if(disposePromise)return disposePromise;disposed=true;
      for(const source of sources.values())source.dispose();for(const attachment of attachments)attachment.detach();disconnectGraph();
      activeContexts.delete(context);disposePromise=Promise.resolve().then(()=>ownsContext&&context.state!=='closed'?context.close():undefined);return disposePromise;
    },
    disconnect(){return sdk.dispose();}
  });
  Object.defineProperties(sdk,{sourceCount:{get:()=>sources.size},listenerPosition:{get:()=>[...listenerPosition]}});
  return sdk;
}
