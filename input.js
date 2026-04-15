import { clamp, roundTo } from "./util.js";

export function attachInput(game){
  function isControl(code){
    return ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(code);
  }

  window.addEventListener("keydown", (e) => {
    if (isControl(e.code)) e.preventDefault();
    if (e.repeat) return;

    const st = game.state; 
    
    if (st?.inputLocked || game.paused) return;


    if (e.code === "Space") {
      if (st.over) { game.reset(); return; }
      game.tryExecute();
      return;
    }
    if (st.over || !st.conj) return;
    if (st.conj.executed) return;

    // Plan Δv
    if (e.code === "ArrowUp") {
      st.plannedDv = clamp(roundTo(st.plannedDv + game.cfg.DV_STEP, game.cfg.DV_STEP), -game.cfg.DV_MAX, game.cfg.DV_MAX);
    }
    if (e.code === "ArrowDown") {
      st.plannedDv = clamp(roundTo(st.plannedDv - game.cfg.DV_STEP, game.cfg.DV_STEP), -game.cfg.DV_MAX, game.cfg.DV_MAX);
    }

    // Plan time
    const tMax = st.conj.tca;
    const step = tMax * game.cfg.TIME_STEP_FRAC;
    if (e.code === "ArrowRight") st.plannedTBurn = clamp(st.plannedTBurn + step, 0, tMax);
    if (e.code === "ArrowLeft")  st.plannedTBurn = clamp(st.plannedTBurn - step, 0, tMax);
  }, {passive:false});
}
