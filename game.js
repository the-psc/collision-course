import { rand, clamp, lerp } from "./util.js";
import { buildMTS, computeRecAtNow, probAt } from "./mts.js";

export function createGame(getViewport){

//
// Configure options 
//
  const cfg = {
    FUEL_MAX: 60.0, // Toggle how much fuel the user starts with. Increasing this will make the game last longer
    DV_MAX: 5.0,
    DV_STEP: 0.5, // Increasing will increase size of movement caused by up/down arrows
    TIME_STEP_FRAC: 1/20, // Increasing will increase size of movement caused by up/down arrows

    DV_COST_PER_UNIT: 2,

    K_ALONGTRACK: 120,
    P0: 1e-4,
    SIGMA: 45,

    // Thresholds for colouring different probabilities on the MTP
    TH_BLUE: 0.10,
    TH_YELLOW: 0.40,

    GRID_X: 90,
    GRID_Y: 41,

    TCA_RANGE: [10.0, 14.0], // Range of times that each "round" will last
    GAP_BETWEEN_EVENTS: 4,
    EXEC_WINDOW_SEC: 0.25,
    START_PAUSE_SEC: 6.0, // Length of time that game pauses after start screen

    SNAP_ENABLED: false,
    SNAP_EPS: 0.12,
    SNAP_VIS_TIME: 0.6,

    SAT_IMPULSE_PX_PER_SEC_PER_DV: 200,
    SAT_DRAG: 1.5, // adjusts how far satellite animation moves satellite when maneouevre occurs. Higher better

    HUD_WIDTH_FRAC: 1/3,
    SAT_X_FRAC: 0.75,
    FAST_FORWARD_MULT: 2.4,
    EXPLODE_DURATION: 2.4,
    
  };

  const game = {
    cfg,
    state: null,
    noticeText: null,
    noticeUntil: 0,
    noticeKind: null, // "warn" | "error"
    getViewport,

    reset(){ reset(game); },
    startNewEvent(){ startNewEvent(game); },
    tryExecute(){ tryExecute(game); },
  };

  reset(game);
  return game;
}

function generateCelestials(w, h){
  const specs = [
    { type:'nebula'  },
    { type:'nebula'  },
    { type:'planet'  },
    { type:'planet'  },
    { type:'ringed'  },
    { type:'galaxy'  },
  ];
  return specs.map(({ type }) => ({
    type,
    x:       Math.random() * w,
    y:       rand(0.08, 0.92) * h,
    r:       type === 'nebula' ? rand(50, 110)
           : type === 'galaxy' ? rand(10, 22)
           : rand(16, 42),
    v:       type === 'nebula' ? rand(1.5, 4) : rand(3, 10),
    hue:     Math.floor(Math.random() * 360),
    hue2:    Math.floor(Math.random() * 360),
    tilt:    rand(-Math.PI / 3, Math.PI / 3),
    banded:  type === 'planet' && Math.random() < 0.55,
    bandHue: Math.floor(Math.random() * 360),
  }));
}

function reset(game){
  const {w,h} = game.getViewport();
  const cx = w * game.cfg.SAT_X_FRAC;
  const cy = h*0.5;

  game.state = {
    t: 0,
    score: 0,
    over: false,
    exploding: false,
    explodeAge: 0,
    explodeTimer: 0,
    fuel: game.cfg.FUEL_MAX,

    sat: { x: cx, y: cy, r: 16 },
    vel: 0,
    offset: 0,
    drag: game.cfg.SAT_DRAG,

    plannedDv: 0,
    plannedTBurn: 0,

    conj: null,
    mts: null,
    recommended: null,
    lastSnapAt: -999,

    debris: [],
    particles: [],

    eventEndAt: null,
    nextEventAt: null,

    stars: Array.from({length:260}, ()=>({
      x: Math.random()*w, y: Math.random()*h,
      s: rand(0.6, 2.1), v: rand(10, 55)
    })),
    celestials: generateCelestials(w, h),
    debrisId: 0,

    // Outcome banner (shown after TCA resolution)
    outcomeText: null,   // "HIT" or "MISSED"
    outcomeP: null,      // probability used for the roll
    outcomeUntil: 0,     // st.t time until which banner is shown
    conjResolved: false, // ensure we resolve only once per conjunction
  };

  startNewEvent(game);
}

function startNewEvent(game){
  const st = game.state;
  const {w,h} = game.getViewport();
  const cx = w * game.cfg.SAT_X_FRAC;
  const cy = h*0.5;

  // Always aim at the satellite's nominal position (center)
  const targetX = cx;
  const targetY = cy;

  // Random TCA in the configured range
  const tca = game.cfg.TCA_RANGE[0] + Math.random() * (game.cfg.TCA_RANGE[1] - game.cfg.TCA_RANGE[0]);

  st.conj = {
    createdAt: st.t,
    tca,
    targetX,
    targetY,
    baselineMiss: targetX - cx,
    hazardRadius: 36,
    seed: Math.random(),
    executed: false,      // plan locked-in
    executedDv: 0,        // locked-in dv (applied later)
    executedTBurn: null,  // locked-in burn time (relative to createdAt)
    burned: false,        // whether the impulse has been applied yet
  };

  st.eventEndAt = st.conj.createdAt + st.conj.tca;
  st.nextEventAt = null;

  st.plannedDv = 0;
  st.plannedTBurn = tca * 0.4;

  st.offset = 0;
  st.vel = 0;

  st.debris.length = 0;
  spawnDebrisToTarget(game);

  st.mts = buildMTS(game.cfg, st.conj, {
    dt: 0.05,
    drag: st.drag,
    impulse: game.cfg.SAT_IMPULSE_PX_PER_SEC_PER_DV,
    maxOff: w * 0.24,
    bounce: 0.15
  });

  // reset per-event outcome UI + resolution flag
  st.outcomeText = null;
  st.outcomeP = null;
  st.outcomeUntil = 0;
  st.noticeText = null;
  st.noticeUntil = 0;
  st.noticeKind = null;
  st.conjResolved = false;
  st.visualDebrisTimer = 0;
  st.recommended = computeRecAtNow(game.cfg, st.mts, 0);
}

function spawnDebrisToTarget(game){
  const st = game.state;
  const {h} = game.getViewport();
  const conj = st.conj;

  const margin = 240;

  // Random: above or below
  const fromAbove = Math.random() < 0.5;

  // Random: angle offset between -45 and +45 degrees.
  // Interpret as offset from straight toward the target along the vertical axis.
  const angleDeg = rand(-45, 45);
  const angleRad = angleDeg * Math.PI / 180;

  const tx = conj.targetX, ty = conj.targetY;

  // Spawn y above or below the screen
  const sy = fromAbove ? -margin : (h + margin);

  // dy from spawn to target (can be positive or negative)
  const dy = ty - sy;

  // For a given angle relative to vertical direction, dx = dy * tan(angle)
  const dx = dy * Math.tan(angleRad);

  // Choose spawn x so the line passes through the target at the chosen angle
  const sx = tx - dx;

  const dist = Math.max(1, Math.hypot(dx, dy));
  const speed = dist / conj.tca;

  const vx = (dx / dist) * speed;
  const vy = (dy / dist) * speed;

  // Deterministic debris visuals (no randomness)
  st.debris.push({
    id: ++st.debrisId,
    spawnX: sx, spawnY: sy,
    targetX: tx, targetY: ty,
    x: sx, y: sy,
    vx, vy,
    baseR: 18,
    rot: Math.random() * Math.PI * 2,
    vr: rand(-1.2, 1.2),
    bornAt: st.t,
    tca: conj.tca,
    mode: "grow",
    seed: Math.random(),
    nPts: Math.floor(rand(5, 13)),
    hue: Math.floor(Math.random() * 360),

    // optional debug info if you ever want it:
    // fromAbove, angleDeg
  });
}

function spawnVisualDebris(game){
  const st = game.state;
  const {w, h} = game.getViewport();
  const margin = 60;
  const speed = rand(180, 380);

  // Pick a random screen edge and an angle pointing inward with spread
  const edge = Math.floor(Math.random() * 4);
  let sx, sy, angle;
  switch(edge){
    case 0: sx = rand(-margin, w+margin); sy = -margin;          angle = rand(Math.PI*0.15, Math.PI*0.85); break; // top → down
    case 1: sx = rand(-margin, w+margin); sy = h+margin;         angle = rand(Math.PI*1.15, Math.PI*1.85); break; // bottom → up
    case 2: sx = -margin;                 sy = rand(0, h);       angle = rand(-Math.PI*0.35, Math.PI*0.35); break; // left → right
    default: sx = w+margin;              sy = rand(0, h);       angle = rand(Math.PI*0.65, Math.PI*1.35); break; // right → left
  }

  st.debris.push({
    id: ++st.debrisId,
    spawnX: sx, spawnY: sy,
    targetX: sx, targetY: sy,
    x: sx, y: sy,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    baseR: rand(8, 22),
    rot: Math.random() * Math.PI * 2,
    vr: rand(-1.8, 1.8),
    bornAt: st.t,
    tca: 6,
    mode: "grow",
    seed: Math.random(),
    nPts: Math.floor(rand(5, 13)),
    hue: Math.floor(Math.random() * 360),
    visual: true,
  });
}

export function updateGame(game, dt){
  const st = game.state;
  const {w,h} = game.getViewport();
  if (st.over && st.exploding){
    st.explodeAge += dt;
    st.explodeTimer -= dt;
    if (st.explodeTimer <= 0) st.exploding = false;
    for (let i=st.particles.length-1; i>=0; i--){
      const p = st.particles[i];
      p.t += dt; p.x += p.vx*dt; p.y += p.vy*dt;
      p.vx *= (1 - 1.8*dt); p.vy *= (1 - 1.8*dt);
      if (p.t >= p.life) st.particles.splice(i,1);
    }
    return;
  }
  if (st.over) return;

  st.t += dt;
  st.score += dt;

  // recompute rec markers
  if (st.conj && st.mts){
    const tNow = clamp(st.t - st.conj.createdAt, 0, st.conj.tca);
    st.recommended = computeRecAtNow(game.cfg, st.mts, tNow);
  }

  // execute locked-in manoeuvre at its scheduled burn time (relative to conj.createdAt)
  if (st.conj){
    const conj = st.conj;
    const tNow = clamp(st.t - conj.createdAt, 0, conj.tca);
    if (conj.executed && !conj.burned && conj.executedTBurn != null && tNow >= conj.executedTBurn){
      const dv = conj.executedDv;
      st.vel += Math.sign(dv) * Math.log(Math.abs(dv)) * game.cfg.SAT_IMPULSE_PX_PER_SEC_PER_DV  || 0;
      conj.burned = true;
      spawnBurnParticles(st, dv);
    }
  }

  // satellite motion
  st.vel *= Math.exp(-st.drag*dt);
  st.offset += st.vel*dt;

  const maxOff = w*0.24;
  if (st.offset < -maxOff) { st.offset = -maxOff; st.vel *= -0.15; }
  if (st.offset >  maxOff) { st.offset =  maxOff; st.vel *= -0.15; }

  // debris motion + collision
  const satX = st.sat.x + st.offset;
  const satY = st.sat.y;

  for (let i=st.debris.length-1;i>=0;i--){
    const d = st.debris[i];
    d.x += d.vx*dt;
    d.y += d.vy*dt;
    d.rot += d.vr*dt;

    const age = st.t - d.bornAt;
    const tt = clamp(age / d.tca, 0, 1);
    const r = (d.mode === "grow") ? lerp(d.baseR*0.55, d.baseR*1.35, tt)
                                  : lerp(d.baseR*1.35, d.baseR*0.55, tt);

    if (d.x < -450 || d.x > w+450 || d.y < -450 || d.y > h+450){
      st.debris.splice(i,1);
    }
  }

  // particles
  for (let i=st.particles.length-1;i>=0;i--){
    const p = st.particles[i];
    p.t += dt;
    p.x += p.vx*dt;
    p.y += p.vy*dt;
    p.vx *= (1 - 2.2*dt);
    p.vy *= (1 - 2.2*dt);
    if (p.t >= p.life) st.particles.splice(i,1);
  }

  // stars scroll
  for (const s of st.stars){
    s.x -= s.v*dt;
    if (s.x < -5){ s.x = w+5; s.y = Math.random()*h; s.v = rand(10,55); s.s=rand(0.6,2.1); }
  }

  // celestials scroll
  for (const c of st.celestials){
    c.x -= c.v*dt;
    const margin = c.r*3;
    if (c.x < -margin){ c.x = w+margin; c.y = rand(0.08, 0.92)*h; }
  }

  // Spawn fast visual debris from all directions during fast-forward
  if (st.conj?.executed && !st.over){
    st.visualDebrisTimer -= dt;
    if (st.visualDebrisTimer <= 0){
      spawnVisualDebris(game);
      st.visualDebrisTimer = rand(0.30, 0.70);
    }
  }

  // event rollover + probabilistic outcome at TCA (Option A)
  if (st.conj && st.mts && st.t >= st.eventEndAt) {
    // Resolve exactly once, at TCA
    if (!st.conjResolved) {
      st.conjResolved = true;

      // Use executed manoeuvre if available; otherwise treat as "no burn"
      const tBurn = (st.conj.executed && st.conj.executedTBurn != null) ? st.conj.executedTBurn : 0;
      const dv    = (st.conj.executed) ? st.conj.executedDv : 0;

      const p = probAt(st.mts, tBurn, dv);
      const u = Math.random();

      const hit = (u < p);

      st.outcomeText = hit ? "Satellite hit" : "Satellite safe";
      st.outcomeP = p;
      st.outcomeUntil = st.t + 4.0; // show for 2 seconds (or forever if you crash, since time stops)

      if (hit) {
        st.over = true;
        st.exploding = true;
        st.explodeAge = 0;
        st.explodeTimer = game.cfg.EXPLODE_DURATION;
        spawnExplosion(st);
      }
    }

    // Only schedule next event if we survived
    if (!st.over && st.nextEventAt == null) {
      st.nextEventAt = st.t + game.cfg.GAP_BETWEEN_EVENTS;
    }
  }

  if (!st.over && st.nextEventAt != null && st.t >= st.nextEventAt) {
    startNewEvent(game);
  }
}

function tryExecute(game){
  const st = game.state;
  const cfg = game.cfg;
  const conj = st.conj;
  if (!conj || conj.executed) return;

  const dv = st.plannedDv;

  // Disallow executing a manoeuvre scheduled in the future

  const tNow = clamp(st.t - conj.createdAt, 0, conj.tca);
  if (st.plannedTBurn < tNow) {
    showNotice(st, "Can't execute: selected burn time is in the past.", "warn", 2);
    return;
  }
  const cost = Math.abs(dv) * cfg.DV_COST_PER_UNIT;
  if (st.fuel < cost) {
    showNotice(st, "Not enough fuel to execute this manoeuvre.", "error", 2);
    return;
  }

  st.fuel -= cost;

  // Lock in plan; actual impulse will be applied later in updateGame when tNow >= executedTBurn
  conj.executed = true;
  conj.executedDv = dv;
  conj.executedTBurn = st.plannedTBurn;
  conj.burned = false;

  st.noticeText = "Manoeuvre plan locked in, >> fast-forwarding time";
  st.noticeUntil = st.eventEndAt; // keep showing until TCA is reached
}

function spawnExplosion(st){
  const cx = st.sat.x + st.offset;
  const cy = st.sat.y;

  // Fireball — orange/red/yellow, medium speed
  for (let i = 0; i < 40; i++){
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(50, 260);
    const g = Math.floor(rand(50, 190));
    st.particles.push({
      x: cx + rand(-8,8), y: cy + rand(-8,8),
      vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
      life: rand(0.8, 2.0), t: 0, size: rand(4,13),
      color: `rgba(255,${g},0,0.95)`,
    });
  }

  // Sparks — white/yellow, fast, short-lived
  for (let i = 0; i < 35; i++){
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(180, 480);
    const b = Math.floor(rand(80, 255));
    st.particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
      life: rand(0.2, 0.6), t: 0, size: rand(1, 3.5),
      color: `rgba(255,245,${b},0.95)`,
    });
  }

  // Debris chunks — grey, slow, long-lived
  for (let i = 0; i < 12; i++){
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(20, 110);
    const v = Math.floor(rand(140, 210));
    st.particles.push({
      x: cx + rand(-12,12), y: cy + rand(-12,12),
      vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
      life: rand(1.4, 2.4), t: 0, size: rand(3,10),
      color: `rgba(${v},${v-8},${v-18},0.92)`,
    });
  }
}

function spawnBurnParticles(st, dv){
  const dir = (Math.sign(dv) || 1);
  const baseX = st.sat.x + st.offset - dir*18;
  const baseY = st.sat.y;
  for (let i=0;i<14;i++){
    st.particles.push({
      x: baseX + rand(-2,2),
      y: baseY + rand(-7,7),
      vx: -dir*rand(90, 220) + rand(-30,30),
      vy: rand(-45,45),
      life: rand(0.25, 0.55),
      t: 0,
      size: rand(2.5, 6.5)
    });
  }
}

export { tryExecute };

function showNotice(st, text, kind="warn", seconds=2){
  st.noticeText = text;
  st.noticeKind = kind;
  st.noticeUntil = st.t + seconds;
}