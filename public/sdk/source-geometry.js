export function vector3(value, label='position') {
  const components = Array.isArray(value) || (ArrayBuffer.isView(value)&&typeof value[Symbol.iterator]==='function') ? [...value] : [value?.x,value?.y,value?.z];
  if(components.length!==3 || !components.every(Number.isFinite))throw new TypeError(`${label} must contain three finite coordinates.`);
  if(components.some(value=>Math.abs(value)>1e6))throw new RangeError(`${label} exceeds the prototype's coordinate range.`);
  return components;
}
export function relativeSource(source,listener) {
  const [x,y,z]=source.map((value,i)=>value-listener[i]),distance=Math.hypot(x,y,z);
  if(distance<1e-6)return {azimuth:0,elevation:0,distance:.05};
  return {azimuth:Math.atan2(x,-z)*180/Math.PI,elevation:Math.asin(Math.max(-1,Math.min(1,y/distance)))*180/Math.PI,distance};
}
