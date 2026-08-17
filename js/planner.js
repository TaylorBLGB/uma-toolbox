const STORAGE_KEY = "uma-planner-selections-v2";
const APTITUDE_STORAGE_KEY = "uma-planner-aptitude-v1";
const PHASES = ["Junior", "Classic", "Senior"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const HALVES = ["Early", "Late"];
const APTITUDE_THRESHOLD = "B"; // grade at/above this counts a race as "considered"

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
let activeSlotKey = null;

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
  let count = 0, distance = 0, fans = 0, g1 = 0;
  const distTypeCounts = {};
  let streak = 0, longestStreak = 0;

  for (const slot of slots) {
    const raceName = selections[slot.key];
    const race = raceName ? getRace(slot.key, raceName) : null;
    if (race) {
      count++;
      distance += race.meters || 0;
      fans += race.fansGained || 0;
      if (race.grade === "G1") g1++;
      if (race.distType && race.distType !== "Varies") {
        for (const d of race.distType.split("/")) {
          distTypeCounts[d] = (distTypeCounts[d] || 0) + 1;
        }
      }
      streak++;
      longestStreak = Math.max(longestStreak, streak);
    } else {
      streak = 0;
    }
  }

  return { count, distance, fans, g1, distTypeCounts, longestStreak };
}

function renderStatBadges() {
  const { count, distance, fans, g1, distTypeCounts, longestStreak } = computeStats();
  const threshold = Number(document.getElementById("max-streak").value) || 4;

  const badges = [
    `<span class="stat-badge"><span class="n">${fmtNum(count)}</span>races</span>`,
    `<span class="stat-badge"><span class="n">${fmtNum(g1)}</span>G1</span>`,
  ];
  for (const [type, n] of Object.entries(distTypeCounts).sort((a, b) => b[1] - a[1])) {
    badges.push(`<span class="stat-badge"><span class="n">${n}</span>${type}</span>`);
  }
  badges.push(`<span class="stat-badge"><span class="n">${fmtNum(distance)}m</span>distance</span>`);
  badges.push(`<span class="stat-badge"><span class="n">${fmtNum(fans)}</span>fans</span>`);

  const streakClass = longestStreak > threshold ? " streak-bad" : longestStreak === threshold ? " streak-warn" : "";
  badges.push(`<span class="stat-badge${streakClass}"><span class="n">${longestStreak}</span>streak</span>`);

  document.getElementById("stat-badges").innerHTML = badges.join("");
}

// -------- Aptitude controls --------

function adjustAptitude(key, delta) {
  const idx = APTITUDE_ORDER.indexOf(aptitudeGrades[key]);
  const clamped = Math.min(APTITUDE_ORDER.length - 1, Math.max(0, idx + delta));
  aptitudeGrades[key] = APTITUDE_ORDER[clamped];
  saveAptitude();
  renderAll();
}

function renderAptitudeControls() {
  const container = document.getElementById("aptitude-controls");
  container.innerHTML = "";
  for (const dim of APTITUDE_DIMS) {
    const grade = aptitudeGrades[dim.key];
    const active = aptitudeAtLeast(grade, APTITUDE_THRESHOLD);

    const el = document.createElement("div");
    el.className = "apt-control" + (active ? " active" : "");
    el.innerHTML = `
      <span class="apt-label">${dim.label}</span>
      <div class="apt-stepper">
        <button type="button" class="apt-btn apt-up" title="Better">&and;</button>
        <span class="apt-grade-value ${letterClass(grade)}">${grade}</span>
        <button type="button" class="apt-btn apt-down" title="Worse">&or;</button>
      </div>`;
    el.querySelector(".apt-up").addEventListener("click", () => adjustAptitude(dim.key, -1));
    el.querySelector(".apt-down").addEventListener("click", () => adjustAptitude(dim.key, 1));
    container.appendChild(el);
  }
}

// -------- Trainee banner --------

function renderTraineeBanner() {
  const banner = document.getElementById("trainee-banner");
  const name = document.getElementById("trainee-select").value;
  if (!name) {
    banner.className = "hidden";
    banner.innerHTML = "";
    return;
  }
  const uma = umas.find((u) => u.name === name);
  if (!uma) { banner.className = "hidden"; return; }

  // Selecting a trainee auto-fills the aptitude controls from their real grades
  // (see the trainee-select change handler), so this flags cases where the
  // controls have since been manually pushed better than that trainee actually is.
  const overridden = APTITUDE_DIMS.filter((dim) => {
    const actual = uma.aptitude[dim.key] || "G";
    return APTITUDE_ORDER.indexOf(aptitudeGrades[dim.key]) < APTITUDE_ORDER.indexOf(actual);
  });

  banner.className = overridden.length ? "warn" : "ok";
  banner.innerHTML = overridden.length
    ? `<strong>${uma.name}</strong>'s real aptitude is lower than your filter in: ${overridden.map((d) => `${d.label} (actual ${uma.aptitude[d.key] || "G"})`).join(", ")}`
    : `<strong>${uma.name}</strong> — ${APTITUDE_THRESHOLD} or higher for all planned surfaces &amp; distances`;
}

// -------- Grid rendering --------

function renderSlotCell(slot) {
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
  renderTraineeBanner();
}

async function init() {
  renderHeader("planner");
  buildSlots();
  loadSelections();
  loadAptitude();

  [allRaces, umas] = await Promise.all([loadJSON("data/races.json"), loadJSON("data/umas.json")]);

  racesBySlot = {};
  for (const race of allRaces) {
    if (race.slot === "Fin ???") continue; // career finale — not part of the regular calendar
    (racesBySlot[race.slot] ||= []).push(race);
  }

  const traineeSelect = document.getElementById("trainee-select");
  for (const name of [...new Set(umas.map((u) => u.name))].sort()) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    traineeSelect.appendChild(opt);
  }

  renderAll();

  document.getElementById("max-streak").addEventListener("input", renderStatBadges);
  document.getElementById("trainee-select").addEventListener("change", () => {
    const uma = umas.find((u) => u.name === traineeSelect.value);
    if (uma) {
      for (const dim of APTITUDE_DIMS) {
        aptitudeGrades[dim.key] = uma.aptitude[dim.key] || "G";
      }
      saveAptitude();
    }
    renderAll();
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
