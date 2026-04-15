// leaderboard.js
const KEY = "sat_leaderboard_v1";
const MAX_ENTRIES = 10;

export function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveLeaderboard(entries) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // ignore quota / privacy mode errors
  }
}

export function addToLeaderboard(entry) {
  const entries = loadLeaderboard();

  const name = String(entry.name ?? "").trim().slice(0, 24) || "Player";
  const score = Math.max(0, Math.floor(Number(entry.score ?? 0)));
  const at = Number(entry.at ?? Date.now());

  entries.push({ name, score, at });

  // sort: score desc, then most recent first
  entries.sort((a, b) => (b.score - a.score) || (b.at - a.at));

  const trimmed = entries.slice(0, MAX_ENTRIES);
  saveLeaderboard(trimmed);
  return trimmed;
}

export function clearLeaderboard() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  return [];
}

export function renderLeaderboard(entries, { listEl, emptyEl }) {
  if (!listEl || !emptyEl) return;

  listEl.innerHTML = "";

  if (!entries || entries.length === 0) {
    emptyEl.style.display = "block";
    return;
  }

  emptyEl.style.display = "none";

  for (const e of entries) {
    const li = document.createElement("li");

    const nameSpan = document.createElement("span");
    nameSpan.className = "leaderboard__name";
    nameSpan.textContent = String(e.name ?? "Player");

    const scoreSpan = document.createElement("span");
    scoreSpan.className = "leaderboard__score";
    scoreSpan.textContent = String(Math.max(0, Math.floor(Number(e.score ?? 0))));

    li.appendChild(nameSpan);
    li.appendChild(scoreSpan);
    listEl.appendChild(li);
  }
}