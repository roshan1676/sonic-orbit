export const DEFAULTS=Object.freeze({mode:'enhanced',bass:2,clarity:1,space:85,room:12,volume:50,theatre:15,yaw:0});
export function sanitize(value={}){
  const result={...DEFAULTS};
  for(const[key,min,max]of [['bass',-6,6],['clarity',-2,6],['space',0,100],['room',0,40],['volume',0,100],['theatre',0,60],['yaw',-180,180]])if(Number.isFinite(value[key]))result[key]=Math.max(min,Math.min(max,value[key]));
  result.mode=value.mode==='original'?'original':'enhanced';return result;
}
