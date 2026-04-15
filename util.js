export const rand = (a,b)=>a+Math.random()*(b-a);
export const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
export const lerp  = (a,b,t)=>a+(b-a)*t;
export const roundTo = (v,step)=>Math.round(v/step)*step;

export function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  const rr = Math.min(r, w/2, h/2);
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}
