const STORAGE_KEY = "uma-planner-selections-v2";
const APTITUDE_STORAGE_KEY = "uma-planner-aptitude-v1";
const FAN_BONUS_STORAGE_KEY = "uma-planner-fan-bonus-v1";
const PHASES = ["Junior", "Classic", "Senior"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const HALVES = ["Early", "Late"];
const APTITUDE_THRESHOLD = "B"; // grade at/above this counts a race as "considered"

// The Junior Late Jun debut race always happens and isn't a real choice - the
// specific race varies per run, so this is an average across the possible ones.
const DEBUT_SLOT_KEY = "Junior Late Jun";
const DEBUT_FANS = 1000;
// Every trainee runs 3 fixed 30,000-fan races beyond the 72-slot calendar
// (the Twinkle Star Climax / URA Finals races), so this is added flat.
const CAREER_FINALE_BONUS_FANS = 90000;

// Aptitude dimensions used for race filtering, mapped to the field names on a
// uma's `aptitude` object and to the `distType` values used on races.
const APTITUDE_DIMS = [
  { key: "turf", label: "Turf", kind: "surface", value: "turf" },
  { key: "dirt", label: "Dirt", kind: "surface", value: "dirt" },
  { key: "sprint", label: "Short", kind: "dist", value: "Short" },
  { key: "mile", label: "Mile", kind: "dist", value: "Mile" },
  { key: "medium", label: "Medium", kind: "dist", value: "Medium" },
  { key: "long", label: "Long", kind: "dist", value: "Long" },
];
const DEFAULT_APTITUDE = { turf: "B", dirt: "G", sprint: "G", mile: "B", medium: "B", long: "B" };

let allRaces = [];
let umas = [];
let slots = [];        // ordered list of { key, phase, month, half, label } for the 72 regular slots
let racesBySlot = {};  // slot key -> [race, ...]
let selections = {};   // slot key -> race name
let aptitudeGrades = { ...DEFAULT_APTITUDE }; // dimension key -> letter grade (A-G)
let fanBonusPercent = 0;
let activeSlotKey = null;
let selectedTrainee = null; // uma object, or null
let includeUnreleased = false;

function buildSlots() {
  slots = [];
  for (const phase of PHASES) {
    for (const month of MONTHS) {
      for (const half of HALVES) {
        const key = `${phase} ${half} ${month}`;
        slots.push({ key, phase, month, half, label: `${half} ${month}` });
      }
    }
  }
}

function loadSelections() {
  const fromUrl = new URLSearchParams(location.search).get("agenda");
  if (fromUrl) {
    try {
      selections = JSON.parse(decodeURIComponent(atob(fromUrl)));
      saveSelections();
      history.replaceState(null, "", location.pathname);
      return;
    } catch {
      // fall through to localStorage
    }
  }
  try {
    selections = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    selections = {};
  }
}

function saveSelections() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(selections));
}

function loadAptitude() {
  try {
    aptitudeGrades = { ...DEFAULT_APTITUDE, ...JSON.parse(localStorage.getItem(APTITUDE_STORAGE_KEY)) };
  } catch {
    aptitudeGrades = { ...DEFAULT_APTITUDE };
  }
}

function saveAptitude() {
  localStorage.setItem(APTITUDE_STORAGE_KEY, JSON.stringify(aptitudeGrades));
}

function loadFanBonus() {
  fanBonusPercent = Number(localStorage.getItem(FAN_BONUS_STORAGE_KEY)) || 0;
}

function saveFanBonus() {
  localStorage.setItem(FAN_BONUS_STORAGE_KEY, String(fanBonusPercent));
}

function getFilters() {
  const surfaces = new Set();
  const distTypes = new Set();
  for (const dim of APTITUDE_DIMS) {
    if (!aptitudeAtLeast(aptitudeGrades[dim.key], APTITUDE_THRESHOLD)) continue;
    if (dim.kind === "surface") surfaces.add(dim.value);
    else distTypes.add(dim.value);
  }
  return { surfaces, distTypes };
}

function raceMatchesFilter(race, filters) {
  const surfaceOk = !race.surface || filters.surfaces.has(race.surface.toLowerCase());
  const distOk = !race.distType || race.distType === "Varies" ||
    race.distType.split("/").some((d) => filters.distTypes.has(d));
  return surfaceOk && distOk;
}

function fmtNum(n) {
  return n.toLocaleString("en-US");
}

function raceOptionLabel(race) {
  const bits = [];
  if (race.distType && race.distType !== "Varies") bits.push(race.distType);
  if (race.meters) bits.push(`${race.meters}m`);
  if (race.racecourse) bits.push(race.racecourse);
  if (race.fansGained) bits.push(`${fmtNum(race.fansGained)} fans`);
  return bits.join(" · ");
}

// -------- Optimizer: DP maximizing total fans, capped by max consecutive races --------

function getRace(slotKey, name) {
  return (racesBySlot[slotKey] || []).find((r) => r.name === name);
}

function bestValidRace(slotKey, filters) {
  const options = (racesBySlot[slotKey] || []).filter((r) => raceMatchesFilter(r, filters));
  if (options.length === 0) return null;
  return options.reduce((best, r) => ((r.fansGained || 0) > (best.fansGained || 0) ? r : best));
}

function runOptimizer() {
  const filters = getFilters();
  const maxStreak = Math.max(1, Number(document.getElementById("max-streak").value) || 4);
  const n = slots.length;

  const best = slots.map((s) => bestValidRace(s.key, filters));

  // dp[i][s] = max fans achievable from slot i..n-1, given s consecutive races selected
  // immediately before slot i (0 <= s < maxStreak).
  const dp = Array.from({ length: n + 1 }, () => new Array(maxStreak + 1).fill(0));
  const choice = Array.from({ length: n }, () => new Array(maxStreak + 1).fill("skip"));

  for (let i = n - 1; i >= 0; i--) {
    for (let s = 0; s <= maxStreak; s++) {
      const skipVal = dp[i + 1][0];
      let takeVal = -Infinity;
      if (best[i] && s < maxStreak) {
        takeVal = (best[i].fansGained || 0) + dp[i + 1][s + 1];
      }
      if (takeVal > skipVal) {
        dp[i][s] = takeVal;
        choice[i][s] = "take";
      } else {
        dp[i][s] = skipVal;
        choice[i][s] = "skip";
      }
    }
  }

  const result = {};
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (choice[i][s] === "take") {
      result[slots[i].key] = best[i].name;
      s += 1;
    } else {
      s = 0;
    }
  }
  return result;
}

// -------- Stats --------

function computeStats() {
  let count = 0, baseFans = DEBUT_FANS + CAREER_FINALE_BONUS_FANS, g1 = 0;
  const distTypeCounts = {};

  for (const slot of slots) {
    const raceName = selections[slot.key];
    const race = raceName ? getRace(slot.key, raceName) : null;
    if (race) {
      count++;
      baseFans += race.fansGained || 0;
      if (race.grade === "G1") g1++;
      if (race.distType && race.distType !== "Varies") {
        for (const d of race.distType.split("/")) {
          distTypeCounts[d] = (distTypeCounts[d] || 0) + 1;
        }
      }
    }
  }

  const totalFans = Math.round(baseFans * (1 + fanBonusPercent / 100));
  return { count, baseFans, totalFans, g1, distTypeCounts };
}

function renderStatBadges() {
  const { count, baseFans, totalFans, g1, distTypeCounts } = computeStats();

  const badges = [
    `<span class="stat-badge"><span class="n">${fmtNum(count)}</span>races</span>`,
    `<span class="stat-badge"><span class="n">${fmtNum(g1)}</span>G1</span>`,
  ];
  for (const [type, n] of Object.entries(distTypeCounts).sort((a, b) => b[1] - a[1])) {
    badges.push(`<span class="stat-badge"><span class="n">${n}</span>${type}</span>`);
  }
  badges.push(`<span class="stat-badge"><span class="n">${fmtNum(baseFans)}</span>base fans</span>`);
  badges.push(`<span class="stat-badge highlight"><span class="n">${fmtNum(totalFans)}</span>total fans</span>`);

  document.getElementById("stat-badges").innerHTML = badges.join("");
}

// -------- Trainee search --------

// Trainees don't have different aptitude per costume (the source sheet just
// underlines the grade a character's skills lean toward - not a real
// difference), so search operates on one entry per unique name. Prefer a
// released row's data if any costume of this trainee is released.
function traineeIndex() {
  const byName = new Map();
  for (const u of umas) {
    const existing = byName.get(u.name);
    if (!existing || (u.inGame && !existing.inGame)) byName.set(u.name, u);
  }
  return [...byName.values()];
}

function traineePortraitUrl(uma) {
  return `images/trainees/${slugify(uma.name)}.png`;
}

function applyTrainee(uma) {
  selectedTrainee = uma;
  document.getElementById("trainee-input").value = uma ? uma.name : "";

  const portrait = document.getElementById("trainee-portrait");
  if (uma) {
    portrait.src = traineePortraitUrl(uma);
    portrait.classList.remove("hidden");
  } else {
    portrait.removeAttribute("src");
    portrait.classList.add("hidden");
  }

  if (uma) {
    for (const dim of APTITUDE_DIMS) {
      aptitudeGrades[dim.key] = uma.aptitude[dim.key] || "G";
    }
    saveAptitude();
  }
  hideTraineeSuggestions();
  renderAptitudeControls();
}

function hideTraineeSuggestions() {
  document.getElementById("trainee-suggestions").classList.add("hidden");
}

function renderTraineeSuggestions(query) {
  const box = document.getElementById("trainee-suggestions");
  const q = query.trim().toLowerCase();

  if (!q) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }

  const pool = traineeIndex().filter((u) => includeUnreleased || u.inGame);
  const starts = pool.filter((u) => u.name.toLowerCase().startsWith(q));
  const contains = pool.filter((u) => !u.name.toLowerCase().startsWith(q) && u.name.toLowerCase().includes(q));
  const matches = [...starts.sort((a, b) => a.name.localeCompare(b.name)),
                   ...contains.sort((a, b) => a.name.localeCompare(b.name))].slice(0, 25);

  box.innerHTML = matches.length
    ? matches.map((u, i) => `
        <div class="trainee-suggestion" data-idx="${i}">
          <img class="trainee-suggestion-portrait" src="${traineePortraitUrl(u)}" alt="" onerror="this.remove()">
          <span class="trainee-suggestion-name">
            <span>${u.name}</span>
            ${u.inGame ? "" : '<span class="unreleased-tag">unreleased</span>'}
          </span>
        </div>`).join("")
    : `<div class="trainee-suggestion-empty">No trainees match "${query}"</div>`;

  box.querySelectorAll(".trainee-suggestion").forEach((el) => {
    el.addEventListener("mousedown", (e) => {
      e.preventDefault(); // keep focus so the click isn't lost to the input's blur handler
      applyTrainee(matches[Number(el.dataset.idx)]);
    });
  });

  box.classList.remove("hidden");
}

// -------- Aptitude controls --------

function adjustAptitude(key, delta) {
  const idx = APTITUDE_ORDER.indexOf(aptitudeGrades[key]);
  const clamped = Math.min(APTITUDE_ORDER.length - 1, Math.max(0, idx + delta));
  aptitudeGrades[key] = APTITUDE_ORDER[clamped];
  saveAptitude();
  // Aptitude only affects the optimizer (on Auto-Fill) and the picker's
  // dimming (recomputed when it opens) - the grid/stats don't depend on it,
  // so re-render just the controls rather than tearing down race nameplates.
  renderAptitudeControls();
}

function renderAptitudeControls() {
  const surfaceContainer = document.getElementById("aptitude-controls-surface");
  const distContainer = document.getElementById("aptitude-controls-dist");
  surfaceContainer.innerHTML = "";
  distContainer.innerHTML = "";

  for (const dim of APTITUDE_DIMS) {
    const grade = aptitudeGrades[dim.key];
    const active = aptitudeAtLeast(grade, APTITUDE_THRESHOLD);

    const el = document.createElement("div");
    el.className = "apt-control" + (active ? " active" : "");
    el.innerHTML = `
      <span class="apt-label">${dim.label}</span>
      <div class="apt-stepper">
        <button type="button" class="apt-btn apt-up" aria-label="Increase ${dim.label} aptitude">&and;</button>
        <span class="apt-grade-value ${letterClass(grade)}">${grade}</span>
        <button type="button" class="apt-btn apt-down" aria-label="Decrease ${dim.label} aptitude">&or;</button>
      </div>`;
    el.querySelector(".apt-up").addEventListener("click", () => adjustAptitude(dim.key, -1));
    el.querySelector(".apt-down").addEventListener("click", () => adjustAptitude(dim.key, 1));
    (dim.kind === "surface" ? surfaceContainer : distContainer).appendChild(el);
  }
}

// -------- Grid rendering --------

function renderSlotCell(slot) {
  if (slot.key === DEBUT_SLOT_KEY) {
    const cell = document.createElement("div");
    cell.className = "slot-cell";
    cell.innerHTML = `
      <div class="nameplate grade-default">
        <span class="nameplate-name">Make Debut</span>
      </div>
      <span class="slot-cell-label on-nameplate">${slot.label}</span>`;
    return cell;
  }

  const races = racesBySlot[slot.key] || [];
  const selectedName = selections[slot.key];
  const race = selectedName ? getRace(slot.key, selectedName) : null;

  const cell = document.createElement("div");
  cell.className = "slot-cell" + (races.length === 0 ? " empty-slot" : "");

  if (race) {
    const gClass = gradeBadgeClass(race.grade).replace("grade-", "");
    cell.innerHTML = `
      <div class="nameplate grade-${gClass}">
        <img class="nameplate-img" src="images/races/${race.urlSlug || ""}.png" alt="" onerror="this.remove()">
        <span class="nameplate-name">${race.name}</span>
      </div>
      <span class="slot-cell-label on-nameplate">${slot.label}</span>`;
  } else {
    cell.innerHTML = races.length
      ? `<span class="plus-icon">+</span><span class="slot-cell-label">${slot.label}</span>`
      : `<span class="slot-cell-label">${slot.label}</span>`;
  }

  if (races.length > 0) {
    cell.addEventListener("click", () => openPicker(slot.key));
  }
  return cell;
}

function renderGrid() {
  const body = document.getElementById("planner-body");
  body.innerHTML = "";

  const columns = document.createElement("div");
  columns.className = "phase-columns";

  for (const phase of PHASES) {
    const col = document.createElement("div");
    const header = document.createElement("div");
    header.className = "phase-col-header";
    header.textContent = `${phase} Year`;
    col.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "phase-col-body";
    for (const slot of slots.filter((s) => s.phase === phase)) {
      grid.appendChild(renderSlotCell(slot));
    }
    col.appendChild(grid);
    columns.appendChild(col);
  }

  body.appendChild(columns);
}

// -------- Picker modal --------

function openPicker(slotKey) {
  activeSlotKey = slotKey;
  const slot = slots.find((s) => s.key === slotKey);
  const races = racesBySlot[slotKey] || [];
  const selected = selections[slotKey];
  const filters = getFilters();

  document.getElementById("picker-title").textContent = slot.label + (slot.phase ? ` · ${slot.phase} Year` : "");

  const optionsEl = document.getElementById("picker-options");
  optionsEl.innerHTML = "";

  const noneBtn = document.createElement("button");
  noneBtn.type = "button";
  noneBtn.className = "none-option" + (!selected ? " selected" : "");
  noneBtn.textContent = "Skip / train";
  noneBtn.addEventListener("click", () => {
    delete selections[slotKey];
    saveSelections();
    closePicker();
    renderAll();
  });
  optionsEl.appendChild(noneBtn);

  for (const race of races) {
    const btn = document.createElement("button");
    btn.type = "button";
    const isSelected = selected === race.name;
    const offApt = !raceMatchesFilter(race, filters);
    btn.className = "race-option" + (isSelected ? " selected" : "") + (offApt ? " off-aptitude" : "");
    const grade = race.grade ? `<span class="badge ${gradeBadgeClass(race.grade)}">${race.grade}</span>` : "";
    btn.innerHTML = `${grade}<span class="rname">${race.name}</span><span class="rmeta">${raceOptionLabel(race)}</span>`;
    btn.addEventListener("click", () => {
      selections[slotKey] = race.name;
      saveSelections();
      closePicker();
      renderAll();
    });
    optionsEl.appendChild(btn);
  }

  document.getElementById("picker-modal").classList.remove("hidden");
}

function closePicker() {
  document.getElementById("picker-modal").classList.add("hidden");
  activeSlotKey = null;
}

// -------- Wiring --------

function renderAll() {
  renderAptitudeControls();
  renderGrid();
  renderStatBadges();
}

async function init() {
  renderHeader("planner");
  buildSlots();
  loadSelections();
  loadAptitude();
  loadFanBonus();

  [allRaces, umas] = await Promise.all([loadJSON("data/races.json"), loadJSON("data/umas.json")]);

  racesBySlot = {};
  for (const race of allRaces) {
    if (race.slot === "Fin ???") continue; // career finale — not part of the regular calendar
    if (race.name === "Junior Make Debut") continue; // always happens, not a real choice - see DEBUT_FANS
    (racesBySlot[race.slot] ||= []).push(race);
  }

  document.getElementById("fan-bonus").value = fanBonusPercent;

  renderAll();

  document.getElementById("fan-bonus").addEventListener("input", (e) => {
    fanBonusPercent = Number(e.target.value) || 0;
    saveFanBonus();
    renderStatBadges();
  });

  const traineeInput = document.getElementById("trainee-input");
  traineeInput.addEventListener("input", (e) => renderTraineeSuggestions(e.target.value));
  traineeInput.addEventListener("focus", (e) => renderTraineeSuggestions(e.target.value));
  traineeInput.addEventListener("blur", () => {
    hideTraineeSuggestions();
    if (!traineeInput.value.trim() && selectedTrainee) applyTrainee(null);
  });
  traineeInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { traineeInput.blur(); hideTraineeSuggestions(); }
    if (e.key === "Enter") e.preventDefault();
  });

  document.getElementById("include-unreleased").addEventListener("change", (e) => {
    includeUnreleased = e.target.checked;
    // Enforce the checkbox even for an already-selected trainee, not just new searches.
    if (!includeUnreleased && selectedTrainee && !selectedTrainee.inGame) {
      applyTrainee(null);
    }
  });

  document.getElementById("reset-btn").addEventListener("click", () => {
    if (confirm("Clear every race you've picked?")) {
      selections = {};
      saveSelections();
      renderAll();
    }
  });

  document.getElementById("autofill-btn").addEventListener("click", () => {
    selections = runOptimizer();
    saveSelections();
    renderAll();
  });

  document.getElementById("filters-toggle-btn").addEventListener("click", () => {
    document.getElementById("filters-panel").classList.toggle("hidden");
  });

  document.getElementById("share-btn").addEventListener("click", async () => {
    const encoded = btoa(encodeURIComponent(JSON.stringify(selections)));
    const url = `${location.origin}${location.pathname}?agenda=${encoded}`;
    try {
      await navigator.clipboard.writeText(url);
      alert("Share link copied to clipboard!");
    } catch {
      prompt("Copy this link:", url);
    }
  });

  document.getElementById("picker-close").addEventListener("click", closePicker);
  document.getElementById("picker-modal").addEventListener("click", (e) => {
    if (e.target.id === "picker-modal") closePicker();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePicker();
  });
}

init();
