import { clamp, lerp, roundRect } from "./util.js";
import { probAt } from "./mts.js";

// Cache the rendered MTS canvas so we don't rebuild it every frame
let _mtsRef = null, _mtsCanvas = null;

export function createRenderer(){ return {}; }

export function renderFrame(ctx, game, renderer, dt, errors){
  const st = game.state;
  const cfg = game.cfg;
  const w = innerWidth, h = innerHeight;

  // background
  ctx.fillStyle="#05060a";
  ctx.fillRect(0,0,w,h);

  if (st.celestials) drawCelestials(ctx, st);

  // stars
  ctx.fillStyle="rgba(255,255,255,0.85)";
  for(const s of st.stars){
    ctx.globalAlpha = 0.35 + 0.65*(s.s/2.1);
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
  ctx.globalAlpha=1;
  drawDebrisAndTarget(ctx, game);
  if (st.exploding) drawExplosionFlash(ctx, st);
  drawParticles(ctx, st);

  ctx.globalAlpha=1;
  if (!st.exploding) drawSatellite(ctx, st);
  drawHUD(ctx, game, errors);
}

function drawCelestials(ctx, st){
  for (const c of st.celestials){
    ctx.save();

    if (c.type === 'nebula'){
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
      g.addColorStop(0,    `hsla(${c.hue},  70%, 65%, 0.35)`);
      g.addColorStop(0.5,  `hsla(${c.hue2}, 60%, 50%, 0.12)`);
      g.addColorStop(1,    `hsla(0,0%,0%,0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI*2);
      ctx.fill();

    } else if (c.type === 'planet' || c.type === 'ringed'){
      // Ring drawn first (behind planet body)
      if (c.type === 'ringed'){
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.r*1.9, c.r*0.42, c.tilt, 0, Math.PI*2);
        ctx.strokeStyle = `hsla(${c.hue}, 35%, 72%, 0.50)`;
        ctx.lineWidth = c.r*0.38;
        ctx.stroke();
      }
      // Sphere-like radial gradient
      const g = ctx.createRadialGradient(
        c.x - c.r*0.28, c.y - c.r*0.28, c.r*0.05,
        c.x, c.y, c.r
      );
      g.addColorStop(0, `hsla(${c.hue}, 55%, 78%, 0.95)`);
      g.addColorStop(1, `hsla(${c.hue}, 50%, 22%, 0.95)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI*2);
      ctx.fill();
      // Gas-giant banding
      if (c.banded){
        ctx.save();
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI*2);
        ctx.clip();
        const nb = 3 + Math.floor(c.r/11);
        for (let i=0; i<nb; i++){
          const by = c.y - c.r + (i/nb)*c.r*2;
          ctx.fillStyle = `hsla(${c.bandHue}, 40%, 55%, 0.28)`;
          ctx.fillRect(c.x - c.r, by, c.r*2, (c.r*2/nb)*0.6);
        }
        ctx.restore();
      }

    } else if (c.type === 'galaxy'){
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.tilt);
      ctx.scale(1, 0.36);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, c.r);
      g.addColorStop(0,    `hsla(${c.hue}, 40%, 88%, 0.80)`);
      g.addColorStop(0.4,  `hsla(${c.hue}, 35%, 65%, 0.25)`);
      g.addColorStop(1,    `hsla(0,0%,0%,0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, c.r, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }
}

function drawSatellite(ctx, st){
  const x = st.sat.x + st.offset, y = st.sat.y;

  ctx.save();
  ctx.translate(x, y);

  // Glow
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 48);
  glow.addColorStop(0, "rgba(140,190,255,0.10)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, 48, 0, Math.PI*2); ctx.fill();

  // --- Solar panels ---
  const drawPanel = (panelX) => {
    const pw = 58, ph = 20;
    ctx.fillStyle = "rgba(28,32,48,0.97)";
    ctx.strokeStyle = "rgba(70,90,140,0.75)";
    ctx.lineWidth = 1;
    roundRect(ctx, panelX, -10, pw, ph, 3); ctx.fill(); ctx.stroke();

    // 5×2 cell grid
    const cw = 9, ch = 7, gap = 2, marginX = 3, marginY = 3;
    for (let col = 0; col < 5; col++){
      for (let row = 0; row < 2; row++){
        const cx2 = panelX + marginX + col*(cw+gap);
        const cy2 = -10 + marginY + row*(ch+gap);
        ctx.fillStyle = (col+row)%2===0 ? "rgba(45,108,228,0.93)" : "rgba(28,85,205,0.88)";
        roundRect(ctx, cx2, cy2, cw, ch, 1); ctx.fill();
        ctx.fillStyle = "rgba(180,215,255,0.09)";
        ctx.fillRect(cx2, cy2, cw, 2);
      }
    }
    // Panel highlight
    ctx.fillStyle = "rgba(140,180,255,0.07)";
    roundRect(ctx, panelX+1, -9, pw-2, 5, 2); ctx.fill();
  };

  drawPanel(-82); // left
  drawPanel( 24); // right

  // Struts connecting panels to body
  ctx.strokeStyle = "rgba(175,185,210,0.65)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-24, -5); ctx.lineTo(-24, 5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo( 24, -5); ctx.lineTo( 24, 5); ctx.stroke();

  // --- Main body ---
  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  roundRect(ctx, -21, -12, 43, 27, 6); ctx.fill();

  // Thermal blanket (gold/silver gradient)
  const bodyG = ctx.createLinearGradient(-20, -11, 18, 14);
  bodyG.addColorStop(0,    "rgba(228,222,195,0.98)");
  bodyG.addColorStop(0.40, "rgba(210,204,175,0.97)");
  bodyG.addColorStop(0.75, "rgba(182,176,148,0.97)");
  bodyG.addColorStop(1,    "rgba(150,145,118,0.97)");
  ctx.fillStyle = bodyG;
  ctx.strokeStyle = "rgba(85,80,58,0.40)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, -20, -11, 42, 25, 5); ctx.fill(); ctx.stroke();

  // Blanket seam lines
  ctx.strokeStyle = "rgba(100,94,70,0.28)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-18, -3); ctx.lineTo(20, -3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-18,  4); ctx.lineTo(20,  4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(  4,-10); ctx.lineTo( 4, 13); ctx.stroke();

  // Star tracker (top-left quadrant)
  ctx.fillStyle = "rgba(55,75,118,0.70)";
  roundRect(ctx, -17, -9, 11, 8, 2); ctx.fill();
  ctx.fillStyle = "rgba(15,22,52,0.90)";
  ctx.beginPath(); ctx.arc(-11, -5, 2.5, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = "rgba(80,110,200,0.55)";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Thruster pods (bottom corners)
  [[- 17, 9],[11, 9]].forEach(([tx, ty]) => {
    ctx.fillStyle = "rgba(52,60,78,0.88)";
    roundRect(ctx, tx, ty, 8, 5, 2); ctx.fill();
    ctx.fillStyle = "rgba(18,22,32,0.95)";
    ctx.beginPath(); ctx.arc(tx+4, ty+5, 2, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "rgba(90,100,130,0.50)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  });

  // Body top highlight
  ctx.fillStyle = "rgba(255,255,255,0.13)";
  roundRect(ctx, -18, -10, 38, 5, 3); ctx.fill();

  // --- Dish antenna ---
  // Boom
  ctx.strokeStyle = "rgba(200,205,222,0.85)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(7, -11); ctx.lineTo(7, -21); ctx.stroke();
  // Dish bowl
  ctx.strokeStyle = "rgba(215,220,238,0.90)";
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(7, -19, 9, Math.PI*1.1, Math.PI*1.9); ctx.stroke();
  // Rim bar
  ctx.strokeStyle = "rgba(165,175,208,0.60)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-2, -19); ctx.lineTo(16, -19); ctx.stroke();
  // Feed horn
  ctx.fillStyle = "rgba(225,230,245,0.95)";
  ctx.beginPath(); ctx.arc(7, -28, 2.5, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = "rgba(125,135,168,0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

function drawDebrisAndTarget(ctx, game){
  const st = game.state;
  const w = innerWidth;
  const cx = w*0.5;
  const y = st.sat.y;
  const boxW = w*0.44;
  const boxH = 140;

  for(const d of st.debris){
    if (!d.visual){
      // path
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle="rgba(255,220,140,0.95)";
      ctx.lineWidth=2;
      ctx.setLineDash([8,10]);
      ctx.beginPath();
      ctx.moveTo(d.spawnX, d.spawnY);
      ctx.lineTo(d.targetX, d.targetY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // target marker
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle="rgba(255,200,90,0.9)";
      ctx.lineWidth=1.8;
      ctx.beginPath();
      ctx.moveTo(d.targetX-18, d.targetY); ctx.lineTo(d.targetX+18, d.targetY);
      ctx.moveTo(d.targetX, d.targetY-18); ctx.lineTo(d.targetX, d.targetY+18);
      ctx.stroke();
      ctx.restore();
    }

    // body
    const age = st.t - d.bornAt;
    const tt = clamp(age / d.tca, 0, 1);
    const r = (d.mode === "grow") ? lerp(d.baseR*0.55, d.baseR*1.35, tt)
                                  : lerp(d.baseR*1.35, d.baseR*0.55, tt);

    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);

    const pts = [];
    const n = d.nPts ?? 9;
    for(let i=0;i<n;i++){
      const a = (i/n)*Math.PI*2;
      const wob = 0.75 + 0.35*Math.sin(a*3 + d.seed*10) + 0.15*Math.sin(a*7 + d.seed*20) + 0.12*Math.sin(a*5 + d.seed*31);
      pts.push([Math.cos(a)*r*wob, Math.sin(a)*r*wob]);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();

    ctx.fillStyle=`hsla(${d.hue}, 45%, 52%, 0.92)`;
    ctx.strokeStyle=`hsla(${d.hue}, 30%, 25%, 0.6)`;
    ctx.lineWidth=2;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

function drawParticles(ctx, st){
  for(const p of st.particles){
    const k = p.t/p.life;
    const a = 1-k;
    if (p.color){
      // Explosion particle — use stored colour
      ctx.globalAlpha = a * 0.92;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size*(0.75+0.35*(1-k)), 0, Math.PI*2);
      ctx.fillStyle = p.color;
      ctx.fill();
    } else {
      // Thruster particle
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size*(0.7+0.6*(1-k)),0,Math.PI*2);
      ctx.fillStyle="rgba(255,255,255,0.9)"; ctx.fill();
      ctx.globalAlpha = a*0.55;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size*1.6,0,Math.PI*2);
      ctx.fillStyle="rgba(255,170,80,0.9)"; ctx.fill();
    }
    ctx.globalAlpha=1;
  }
}

function drawExplosionFlash(ctx, st){
  const age = st.explodeAge || 0;
  const alpha = Math.max(0, 0.88 - age * 3.2); // fades out in ~0.27s
  if (alpha <= 0) return;
  const cx = st.sat.x + st.offset;
  const cy = st.sat.y;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 220);
  g.addColorStop(0,    `rgba(255,252,200,${alpha})`);
  g.addColorStop(0.18, `rgba(255,180,50,${(alpha*0.75).toFixed(3)})`);
  g.addColorStop(0.55, `rgba(255,70,10,${(alpha*0.35).toFixed(3)})`);
  g.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.restore();
}

function probToColor(p){
  // Green (safe) → amber (caution) → red (danger)
  const t = clamp(p / 0.8, 0, 1);
  if (t < 0.5){
    const s = t * 2;
    return [
      Math.round(lerp(50,  255, s)),
      Math.round(lerp(190, 155, s)),
      Math.round(lerp(55,  0,   s)),
    ];
  } else {
    const s = (t - 0.5) * 2;
    return [
      Math.round(lerp(255, 210, s)),
      Math.round(lerp(155, 15,  s)),
      Math.round(lerp(0,   15,  s)),
    ];
  }
}
function riskColor(cfg, p){
  if (p < cfg.TH_BLUE)    return "rgba(0,130,30,0.95)";    // safe — dark green
  if (p < cfg.TH_YELLOW)  return "rgba(155,95,0,0.95)";    // caution — dark amber
  return "rgba(185,0,0,0.95)";                             // danger — dark red
}

function drawHUD(ctx, game, errors){
  const st = game.state;
  const cfg = game.cfg;

  const x = 28, y = 48;
  const w = Math.floor(innerWidth * cfg.HUD_WIDTH_FRAC);
  const h = 400;

  // HUD background panel
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(228, 234, 245, 0.90)";
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.restore();

  // --- TITLE ---
  const C_TEXT  = "rgba(15,25,55,0.95)";
  const C_MUTED = "rgba(15,25,55,0.65)";
  const C_DIV   = "rgba(15,25,55,0.15)";

  const FONT_SM  = "12px system-ui";
  const FONT_MD  = "14px system-ui";
  const FONT_LG  = "500 16px system-ui";
  const FONT_NUM = "700 16px system-ui";
  const FONT_TTL = "700 20px system-ui";

  const padX = 16;
  const titleH = 34;

  ctx.save();
  ctx.fillStyle = C_TEXT;
  ctx.font = FONT_TTL;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Control panel", x + padX, y + 10);


  // divider
  ctx.strokeStyle = C_DIV;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + padX, y + titleH);
  ctx.lineTo(x + w - padX, y + titleH);
  ctx.stroke();
  ctx.restore();

  // --- HUD TEXT ---
  const y0 = y + titleH + 24; // everything starts below the title
  const plannedCost = Math.abs(st.plannedDv) * cfg.DV_COST_PER_UNIT;
  const pPlan = (st.conj && st.mts)
    ? probAt(st.mts, st.plannedTBurn, st.plannedDv)
    : 0;

  // Fuel
  ctx.fillStyle = C_TEXT;
  ctx.font = FONT_MD;
  ctx.fillText(`Fuel remaining: ${st.fuel.toFixed(0)}/${cfg.FUEL_MAX}`, x + 12, y0);

  // Score
  ctx.font = FONT_MD;
  ctx.fillText(`Score: ${Math.floor(st.score)}`, x + 12, y0 + 24);

  // Planned cost
  ctx.fillStyle = C_TEXT;
  ctx.font = FONT_LG;
  ctx.fillText(`Planned fuel use: ${plannedCost.toFixed(1)}`, x + 12, y0 + 64);

  // Risk at plan (colored)
  ctx.font = FONT_LG;
  ctx.fillStyle = riskColor(cfg, pPlan ?? 0);
  ctx.fillText(
    `Risk of collision at plan: ${((pPlan ?? 0) * 100).toFixed(0)}%`,
    x + 12, y0 + 84
  );

  // Execute instruction
  const instrY = y0 + 104;

  // Instruction / countdown
  ctx.font = "700 16px system-ui";

  if (st.pauseRemainingMs && st.pauseRemainingMs > 0) {
    const secondsLeft = Math.ceil(st.pauseRemainingMs / 1000);
    ctx.fillStyle = "rgba(0,90,180,0.95)";
    ctx.fillText(`Starting in ${secondsLeft}...`, x + 12, instrY);
  }
  else if (!st.conj?.executed) {
    ctx.fillStyle = C_TEXT;
    ctx.fillText(`[ SPACE ] - lock in manouevre plan`, x + 12, instrY);
  }
  else {
    ctx.fillStyle = C_TEXT;
    if (st.conj?.burned) {
      ctx.fillText(`Manouevre carried out - wait for close approach`, x + 12, instrY);
    } else {
      ctx.fillText(`Manouevre plan locked in`, x + 12, instrY);
    }
  }
  // Plot
  if (st.conj && st.mts){
    drawMTS(ctx, game, x + 50, instrY + 28, Math.floor((w - 62) * 0.95), 185);
  }

  // error overlay
  if (errors && errors.length){
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    roundRect(ctx, x, y + h + 10, w, 18 + 14 * errors.length, 10);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,120,120,0.95)";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText("Runtime errors:", x + 12, y + h + 30);
    for (let i=0;i<errors.length;i++){
      ctx.fillText(errors[i], x + 12, y + h + 48 + i * 14);
    }
    ctx.restore();
  }

  drawOutcomeBanner(ctx, st);
  drawNoticeBanner(ctx, st);
  if (game.paused) drawPauseBanner(ctx);
}

function drawMTS(ctx, game, x, y, w, h){
  const st = game.state;
  const cfg = game.cfg;
  const mts = st.mts;
  const conj = st.conj;
  if (!mts || !conj) return;

  const {grid, nx, ny, tMax, dvMin, dvMax} = mts;

  // Build (or reuse) a smooth offscreen canvas of the heatmap
  if (_mtsRef !== mts){
    _mtsRef = mts;
    const tmp = document.createElement('canvas');
    tmp.width = nx; tmp.height = ny;
    const tCtx = tmp.getContext('2d');
    const imgData = tCtx.createImageData(nx, ny);
    const d = imgData.data;
    for (let ix = 0; ix < nx; ix++){
      for (let iy = 0; iy < ny; iy++){
        const p = grid[ix * ny + iy];
        const [r, g, b] = probToColor(p);
        const row = ny - 1 - iy; // iy=0 is dvMin (bottom of plot)
        const idx = (row * nx + ix) * 4;
        d[idx] = r; d[idx+1] = g; d[idx+2] = b; d[idx+3] = 255;
      }
    }
    tCtx.putImageData(imgData, 0, 0);
    _mtsCanvas = tmp;
  }

  // Draw the 90×41 canvas scaled up with no smoothing — sharp pixel grid
  ctx.save();
  roundRect(ctx, x, y, w, h, 8);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(_mtsCanvas, x, y, w, h);
  ctx.restore();

  // Border
  ctx.save();
  ctx.strokeStyle = "rgba(80,120,190,0.30)";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 8);
  ctx.stroke();
  ctx.restore();

  // NOW line
  const tNow = clamp(st.t - conj.createdAt, 0, tMax);
  const nowX = x + (tNow / tMax) * w;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(nowX, y); ctx.lineTo(nowX, y + h); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "10px system-ui";
  ctx.textBaseline = "top";
  ctx.fillText("NOW", nowX + 4, y + 4);
  ctx.restore();

  // Plan crosshair (dashed amber lines)
  const planX = x + (clamp(st.plannedTBurn, 0, tMax) / tMax) * w;
  const dvT   = (clamp(st.plannedDv, dvMin, dvMax) - dvMin) / (dvMax - dvMin);
  const planY = y + (1 - dvT) * h;
  ctx.save();
  ctx.strokeStyle = "rgba(255,215,60,0.85)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(planX, y); ctx.lineTo(planX, y + h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, planY); ctx.lineTo(x + w, planY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Plan dot (with snap pulse)
  ctx.save();
  const snappedRecently = (st.t - st.lastSnapAt) <= cfg.SNAP_VIS_TIME;
  if (snappedRecently){
    const pulse = 0.5 + 0.5 * Math.sin(st.t * 12);
    ctx.globalAlpha = 0.45 + 0.25 * pulse;
    ctx.fillStyle = "rgba(255,215,60,1)";
    ctx.beginPath();
    ctx.arc(planX, planY, 10 + 2 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath(); ctx.arc(planX, planY, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Axes & labels
  ctx.save();
  ctx.fillStyle = "rgba(30,45,75,0.82)";
  ctx.font = "12px system-ui";

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Time →", x + w / 2, y + h + 6);

  ctx.save();
  ctx.translate(x - 30, y + h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Fuel usage", 0, 10);
  ctx.restore();

  const max_fuel_use = (dvMax * cfg.DV_COST_PER_UNIT).toFixed(0);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(max_fuel_use, x - 6, y);
  ctx.fillText("0", x - 6, y + h / 2);
  ctx.fillText(max_fuel_use, x - 6, y + h);
  ctx.restore();
}

function drawPauseBanner(ctx) {
  const msg = "PAUSED  —  P to resume  |  Q to quit";
  const padX = 20;
  ctx.save();
  ctx.font = "700 16px system-ui";
  const textW = ctx.measureText(msg).width;
  const boxW = Math.min(innerWidth - 40, textW + padX * 2);
  const boxH = 52;
  const bx = (innerWidth  - boxW) / 2;
  const by = (innerHeight - boxH) / 2;

  ctx.globalAlpha = 0.96;
  ctx.fillStyle = "rgba(228, 234, 245, 0.92)";
  roundRect(ctx, bx, by, boxW, boxH, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(100, 140, 200, 0.25)";
  ctx.lineWidth = 1;
  roundRect(ctx, bx, by, boxW, boxH, 12);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(15, 25, 55, 0.95)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(msg, innerWidth / 2, by + boxH / 2);
  ctx.restore();
}

function drawOutcomeBanner(ctx, st) {
  if (!st.outcomeText || st.outcomeP == null) return;
  if (st.t > st.outcomeUntil) return;

  const pct = st.outcomeP * 100;
  const pctStr = pct < 0.1 ? "<0.1" : pct.toFixed(1).replace(/\.0$/, "");

  const line1 = `${st.outcomeText} — there was a ${pctStr}% chance of collision`;
  const line2 = (!st.over && st.fuel != null)
    ? `Fuel remaining: ${st.fuel.toFixed(0)}`
    : null;

  const padX = 16;
  ctx.save();
  ctx.font = "700 16px system-ui";

  const textW1 = ctx.measureText(line1).width;
  const textW2 = line2 ? ctx.measureText(line2).width : 0;
  const textW = Math.max(textW1, textW2);

  const boxW = Math.min(innerWidth - 40, textW + padX * 2);
  const boxH = line2 ? 68 : 46;

  const x = (innerWidth - boxW) / 2;
  const y = innerHeight * 0.16;

  ctx.globalAlpha = 0.92;
  ctx.fillStyle = "rgba(0,0,0,0.70)";
  roundRect(ctx, x, y, boxW, boxH, 12);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.fillStyle = (st.over)
    ? "rgba(255,120,120,0.95)"
    : "rgba(170,220,255,0.95)";

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (line2) {
    ctx.fillText(line1, innerWidth / 2, y + boxH / 2 - 12);
    ctx.fillText(line2, innerWidth / 2, y + boxH / 2 + 12);
  } else {
    ctx.fillText(line1, innerWidth / 2, y + boxH / 2);
  }

  ctx.restore();
}
function drawNoticeBanner(ctx, st) {
  if (!st.noticeText) return;
  if (st.t > st.noticeUntil) return;

  const msg = st.noticeText;

  const padX = 16;
  ctx.save();
  ctx.font = "700 16px system-ui";
  const textW = ctx.measureText(msg).width;
  const boxW = Math.min(innerWidth - 40, textW + padX * 2);
  const boxH = 46;

  const x = (innerWidth - boxW) / 2;
  const y = innerHeight * 0.16

  ctx.globalAlpha = 0.92;
  ctx.fillStyle = "rgba(0,0,0,0.70)";
  roundRect(ctx, x, y, boxW, boxH, 12);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.fillStyle = (st.noticeKind === "error")
    ? "rgba(255,120,120,0.95)"
    : "rgba(255,220,140,0.95)";

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(msg, innerWidth / 2, y + boxH / 2);

  ctx.restore();
}