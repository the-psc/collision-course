import { createGame, updateGame } from "./game.js";
import { createRenderer, renderFrame } from "./render.js";
import { attachInput } from "./input.js";
import { loadLeaderboard, addToLeaderboard, clearLeaderboard, renderLeaderboard } from "./leaderboard.js";

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

function resize(){
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(window.innerWidth*dpr);
  canvas.height = Math.floor(window.innerHeight*dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener("resize", resize);
resize();

const errors = [];
function pushErr(s){ errors.push(s); if (errors.length>10) errors.shift(); }

window.addEventListener("error", (e) => {
  pushErr(`JS Error: ${e.message} @ ${e.filename?.split("/").pop()}:${e.lineno}:${e.colno}`);
});
window.addEventListener("unhandledrejection", (e) => {
  pushErr(`Promise Rejection: ${e.reason?.message || String(e.reason)}`);
});

const game = createGame(() => ({ w: innerWidth, h: innerHeight }));
game.paused = false;
const renderer = createRenderer();

attachInput(game);

let last = performance.now();

// Code to add start and end screens
const startScreen = document.getElementById("startScreen");
const nameInput = document.getElementById("playerName");
const beginBtn = document.getElementById("beginBtn");

const gameOverScreen = document.getElementById("gameOverScreen");
const gameOverMsg = document.getElementById("gameOverMsg");
const restartBtn = document.getElementById("restartBtn");

// Leaderboard DOM
const lbList = document.getElementById("leaderboardList");
const lbEmpty = document.getElementById("leaderboardEmpty");
const lbClear = document.getElementById("leaderboardClear");

// Initial render
renderLeaderboard(loadLeaderboard(), { listEl: lbList, emptyEl: lbEmpty });

// Clear button
lbClear.addEventListener("click", () => {
  const entries = clearLeaderboard();
  renderLeaderboard(entries, { listEl: lbList, emptyEl: lbEmpty });
});

let started = false;
let playerName = null;
let gameOverShown = false;
let startPauseUntil = 0; // performance.now() timestamp

function showStartScreen() {
  startPauseUntil = 0;
  if (game.state) game.state.inputLocked = false;
  canvas.style.pointerEvents = "auto";

  started = false;
  playerName = null;
  gameOverShown = false;

  gameOverScreen.style.display = "none";
  startScreen.style.display = "flex";
  nameInput.value = "";
  nameInput.focus();
}

function showGameOver() {
  gameOverShown = true;
  started = false; // pause updates while overlay is up

  // Record this run (local-only)
  const st = game.state;
  const finalScore = st?.score != null ? Math.floor(st.score) : 0;

  const updated = addToLeaderboard({
    name: playerName || "Player",
    score: finalScore,
    at: Date.now()
  });

  renderLeaderboard(updated, { listEl: lbList, emptyEl: lbEmpty });

  // Probability string
  let pLine = "";
  if (st && st.outcomeP != null) {
    const pct = st.outcomeP * 100;
    const pctStr = pct < 0.1 ? "<0.1" : pct.toFixed(1).replace(/\.0$/, "");
    pLine = `There was a ${pctStr}% chance of collision.`;
  }

  // Final score
  const scoreLine = (st && st.score != null)
    ? `Final score: ${Math.floor(st.score)}`
    : "";

  // Build message (multi-line)
  const lines = [
    `Game over.`,
    `Your satellite was hit by debris.`,
    pLine,
    scoreLine
  ].filter(Boolean);

  // Use newlines; make sure your overlay CSS allows them (see note below)
  gameOverMsg.textContent = lines.join("\n\n");

  gameOverScreen.style.display = "flex";
}
beginBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (!name) return;

  playerName = name;
  started = true;
  gameOverShown = false;

  // Configure pause from cfg
  startPauseUntil = performance.now() + (game.cfg.START_PAUSE_SEC * 1000);

  // Lock input during pause
  if (game.state) game.state.inputLocked = true;
  canvas.style.pointerEvents = "none";

  startScreen.style.display = "none";
  gameOverScreen.style.display = "none";
});

restartBtn.addEventListener("click", () => {
  game.reset();
  showStartScreen();
});

window.addEventListener("keydown", (e) => {
  // Q — quit current run and return to start screen
  if (e.code === "KeyQ" && started) {
    game.paused = false;
    game.reset();
    showStartScreen();
    return;
  }
  // P — toggle pause (only while a run is active and not over)
  if (e.code === "KeyP" && started && !game.state?.over) {
    game.paused = !game.paused;
    return;
  }
});
// Loop function

function loop(now){
  const dtRaw = Math.min(0.033, (now - last) / 1000);
  last = now;

  // Fast-forward once manoeuvre is locked in (but not during explosion)
  const ff = (game.state?.conj?.executed && !game.state?.over) ? (game.cfg.FAST_FORWARD_MULT || 2.0) : 1.0;

  // Cap after scaling so it stays stable
  const dtSim = Math.min(0.1, dtRaw * ff);

  if (started) {
    const remaining = startPauseUntil - now;
    game.state.pauseRemainingMs = Math.max(0, remaining);

    if (remaining <= 0 && !game.paused) {
      if (game.state?.inputLocked) {
        game.state.inputLocked = false;
        canvas.style.pointerEvents = "auto";
      }
      updateGame(game, dtSim);
    }
  }  // if the game ends, show game over overlay once
  if (game.state?.over && !game.state?.exploding && !gameOverShown) {
    showGameOver();
  }

  renderFrame(ctx, game, renderer, dtSim, errors);

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
