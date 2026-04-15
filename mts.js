import { clamp } from "./util.js";

// Forward-sim the SAME 1D along-track dynamics as the game uses.
// - At tBurn: vel += dv * impulse
// - vel decays with exp drag via per-step damping (approx)
// - offset integrates vel
// - bounds clamp + bounce (same rule as game)
function simulateOffsetAtTCA(sim, tBurn, dv, tMax){
  const { dt, drag, impulse, maxOff, bounce } = sim;

  let t = 0;
  let vel = 0;
  let off = 0;

  // Per-step exponential drag factor
  // (Matches vel *= exp(-drag*dt) style used in game.)
  const damp = Math.exp(-drag * dt);

  let fired = false;

  while (t < tMax - 1e-9){
    const step = Math.min(dt, tMax - t);

    // Fire exactly once, as soon as we pass burn time.
    if (!fired && t <= tBurn && (t + step) >= tBurn){
      vel += dv * impulse;
      fired = true;
    }

    // Integrate forward one step
    // Approx: apply drag then integrate (good enough at small dt)
    vel *= Math.exp(-drag * step);
    off += vel * step;

    // Clamp + bounce like game
    if (off < -maxOff) { off = -maxOff; vel *= -bounce; }
    if (off >  maxOff) { off =  maxOff; vel *= -bounce; }

    t += step;
  }

  return off;
}

export function buildMTS(cfg, conj, simParams){
  const nx = cfg.GRID_X, ny = cfg.GRID_Y;
  const grid = new Float32Array(nx*ny);

  const tMax = conj.tca;
  const dvMin = -cfg.DV_MAX, dvMax = cfg.DV_MAX;

  // Simulation parameters derived from current game
  const sim = {
    dt: simParams?.dt ?? 0.05,                    // 20 Hz sim for heatmap (fast + stable)
    drag: simParams?.drag ?? cfg.SAT_DRAG,
    impulse: simParams?.impulse ?? cfg.SAT_IMPULSE_PX_PER_SEC_PER_DV,
    maxOff: simParams?.maxOff ?? 999999,
    bounce: simParams?.bounce ?? 0.15,            // game uses vel *= -0.15
  };

  const seed = (conj && conj.seed != null) ? conj.seed : 0;

  // For each cell: simulate satellite offset at TCA, compute miss vs target, map to p
  for (let ix=0; ix<nx; ix++){
    const tBurn = (ix/(nx-1)) * tMax;

    for (let iy=0; iy<ny; iy++){
      const dv = dvMin + (iy/(ny-1))*(dvMax-dvMin);

      // satellite x at TCA: nominal + offsetAtTCA
      const offsetAtTCA = simulateOffsetAtTCA(sim, tBurn, dv, tMax);

      // miss distance at TCA is targetX - satX(TCA).
      // baselineMiss = targetX - nominalX, so miss = baselineMiss - offsetAtTCA
      const miss = conj.baselineMiss - offsetAtTCA;

      // Normalised coordinates
      const dvAbs = Math.abs(dv);
      const dvNorm = dvAbs / cfg.DV_MAX;      // 0 center, 1 edges
      const timeNorm = tBurn / tMax;          // 0 early, 1 late
      const sign = (dv >= 0) ? 1 : -1;

      // --- Base shape --- Center is high risk; edges lower risk
      let q = 1 - dvNorm;                      // 1 at center, 0 at edges
      q = Math.pow(q, 1.8);                    // steeper falloff => edges stay greener longer

      // --- Time pressure (SLOWER + less "all red") --- Use an ease curve that grows slowly at first and avoids blasting to 1
      const tEase = Math.pow(timeNorm, 2);   // slower than linear early

      // Per-row "rate" variation (different for +dv / -dv)
      const rowJitter =
        0.80 + 0.35 * Math.abs(Math.sin((iy + 1) * 7.13 + sign * 1.9));  // ~0.80..1.15

      // Make time pressure weaker at the edges (prevents long red bands there)
      const edgeDamp = 1.0 - 0.5 * dvNorm;    // 1.0 center -> 0.45 edges
      const timeStrength = 1.2 * rowJitter * edgeDamp; // global dial

      // Apply time increase as a partial blend toward 1 (but limited by timeStrength)
      q = q + (1 - q) * (tEase * timeStrength);

      // --- Add "chop" (stronger on edges, but not too large) ---
      // Deterministic cell noise in [-1,1]
      const n = Math.sin((ix * 127.1 + (iy + 13.7) * 311.7 + seed*1000) * 0.017);      
      const chopAmp = 0.03 + 0.10 * dvNorm * tEase; 
      q = q * (1 + n * chopAmp);

      // --- Asymmetry that can change over time ---
      // A drifting bias that changes sign with time, so sometimes +dv is safer, sometimes -dv
      const drift = Math.sin(ix * 0.11*seed*0.8);        // -1..1 varies across time
      const asymAmp = 0.00 + 0.35 * (seed * 2 - 1);          // add dvNorm to make stronger at edges
      q = q + sign * drift * asymAmp;

      // Clamp q to [0,1]
      q = Math.max(0, Math.min(1, q));

      // Map to probability range 1% → 80%
      const P_MIN = 0.01;
      const P_MAX = 0.80 - seed / 2.5;
      let p = P_MIN + (P_MAX - P_MIN) * q;

      // Force middle band always red (but make stripe narrower so it doesn’t dominate)
      const MID_STRIPE_DV = 0.04; // was 0.12; narrower = shorter red band visually
      if (dvAbs <= MID_STRIPE_DV) p = P_MAX;

      // Final clamp safety
      grid[ix*ny + iy] = Math.max(P_MIN, Math.min(P_MAX, p));    }
  }

  return { grid, nx, ny, tMax, dvMin, dvMax };
}

export function probAt(mts, tBurn, dv){
  const {grid,nx,ny,tMax,dvMin,dvMax} = mts;
  const tx = clamp(tBurn / tMax, 0, 1);
  const ty = clamp((dv - dvMin)/(dvMax-dvMin), 0, 1);
  const ix = Math.round(tx*(nx-1));
  const iy = Math.round(ty*(ny-1));
  return grid[ix*ny + iy];draw
}

export function computeRecAtNow(cfg, mts, tNow){
  const {grid,nx,ny,tMax,dvMin,dvMax} = mts;
  const ixNow = Math.round(clamp(tNow/tMax,0,1)*(nx-1));

  let dvPos = null, dvNeg = null;

  const dvVals = [];
  for (let iy=0; iy<ny; iy++){
    const dv = dvMin + (iy/(ny-1))*(dvMax-dvMin);
    dvVals.push({iy, dv});
  }
  dvVals.sort((a,b)=>{
    const da = Math.abs(a.dv), db = Math.abs(b.dv);
    if (da !== db) return da - db;
    return a.dv - b.dv;
  });

  for (const {iy, dv} of dvVals){
    const p = grid[ixNow*ny + iy];
    if (p < cfg.TH_BLUE) {
      if (dv >= 0 && dvPos == null) dvPos = dv;
      if (dv <= 0 && dvNeg == null) dvNeg = dv;
      if (dvPos != null && dvNeg != null) break;
    }
  }

  return { dvPos, dvNeg, tNow };
}
