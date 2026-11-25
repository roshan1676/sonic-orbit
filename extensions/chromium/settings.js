export const LISTENING_PROFILES=Object.freeze({
  clean:{bass:0,clarity:0,space:0,room:0,theatre:0,width:50,anchor:0},
  studio:{bass:0,clarity:0,space:100,room:0,theatre:0,width:45,anchor:65},
  cinema:{bass:1.5,clarity:.5,space:100,room:6,theatre:8,width:60,anchor:70}
});
export const DEFAULTS=Object.freeze({schema:2,mode:'enhanced',profile:'studio',hrtf:'browser',...LISTENING_PROFILES.studio,volume:50,yaw:0});
export function sanitize(value={}){
  const result={...DEFAULTS};
  for(const[key,min,max]of [['bass',-6,6],['clarity',-2,6],['space',0,100],['room',0,40],['width',0,100],['anchor',0,100],['volume',0,100],['theatre',0,60],['yaw',-180,180]])if(Number.isFinite(value[key]))result[key]=Math.max(min,Math.min(max,value[key]));
  result.profile=Object.hasOwn(LISTENING_PROFILES,value.profile)?value.profile:value.profile==='custom'?'custom':'studio';
  result.hrtf=['H3','H17'].includes(value.hrtf)?value.hrtf:'browser';
  result.mode=value.mode==='original'?'original':'enhanced';return result;
}
