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

const DIST_TYPE_TO_APT_KEY = Object.fromEntries(APTITUDE_DIMS.filter((d) => d.kind === "dist").map((d) => [d.value, d.key]));

// Lower is better (0 = A). Used to break ties between same-fan races by
// aptitude - the current trainee's actual grades if one's selected,
// otherwise whatever the aptitude panel is set to.
function aptitudeScoreForRace(race) {
  const surfaceGrade = race.surface ? aptitudeGrades[race.surface.toLowerCase()] : null;

  let distGrade = null;
  if (race.distType && race.distType !== "Varies") {
    const grades = race.distType.split("/").map((d) => aptitudeGrades[DIST_TYPE_TO_APT_KEY[d]]).filter(Boolean);
    if (grades.length) {
      distGrade = grades.reduce((best, g) => (APTITUDE_ORDER.indexOf(g) < APTITUDE_ORDER.indexOf(best) ? g : best));
    }
  }

  const worst = APTITUDE_ORDER.length; // unknown aptitude counts as worse than any real grade
  const surfaceIdx = surfaceGrade ? APTITUDE_ORDER.indexOf(surfaceGrade) : worst;
  const distIdx = distGrade ? APTITUDE_ORDER.indexOf(distGrade) : worst;
  return surfaceIdx + distIdx;
}

function bestValidRace(slotKey, filters) {
  const options = (racesBySlot[slotKey] || []).filter((r) => raceMatchesFilter(r, filters));
  if (options.length === 0) return null;
  return options.reduce((best, r) => {
    const rFans = r.fansGained || 0, bestFans = best.fansGained || 0;
    if (rFans !== bestFans) return rFans > bestFans ? r : best;
    return aptitudeScoreForRace(r) < aptitudeScoreForRace(best) ? r : best;
  });
}

function runOptimizer() {
  const filters = getFilters();
  const maxStreak = Math.max(1, Number(document.getElementById("max-streak").value) || 5);
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

const DIST_TYPE_ORDER = ["Short", "Mile", "Medium", "Long"];

function computeStats() {
  let count = 0, baseFans = DEBUT_FANS + CAREER_FINALE_BONUS_FANS;
  const distTypeCounts = {};

  for (const slot of slots) {
    const raceName = selections[slot.key];
    const race = raceName ? getRace(slot.key, raceName) : null;
    if (race) {
      count++;
      baseFans += race.fansGained || 0;
      if (race.distType && race.distType !== "Varies") {
        for (const d of race.distType.split("/")) {
          distTypeCounts[d] = (distTypeCounts[d] || 0) + 1;
        }
      }
    }
  }

  const totalFans = Math.round(baseFans * (1 + fanBonusPercent / 100));
  return { count, baseFans, totalFans, distTypeCounts };
}

function renderStatBadges() {
  const { count, baseFans, totalFans, distTypeCounts } = computeStats();

  const badges = [`<span class="stat-badge"><span class="n">${fmtNum(count)}</span>races</span>`];
  for (const type of DIST_TYPE_ORDER) {
    if (distTypeCounts[type]) badges.push(`<span class="stat-badge"><span class="n">${distTypeCounts[type]}</span>${type}</span>`);
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
      </div>`;
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
        <img class="nameplate-img" src="${raceImageUrl(race.urlSlug)}" alt="" onerror="this.remove()">
        <span class="nameplate-name">${race.name}</span>
      </div>`;
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

// -------- Image export (mirrors the in-game vertical per-year share screenshot) --------

const EXPORT_GRADE_STOPS = {
  G1: ["#7a1f3d", "#c9436b", "#ffb347"],
  G2: ["#1f3d6e", "#3b6bb0"],
  G3: ["#1f5e46", "#379a72"],
  OP: ["#5c5320", "#a4923a"],
  "Pre-OP": ["#5c5320", "#a4923a"],
  default: ["#33395a", "#4a5280"],
};

function loadImageOrNull(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawNameplateTile(ctx, x, y, w, h, grade, name, img) {
  const r = 8;
  roundRectPath(ctx, x, y, w, h, r);
  const stops = EXPORT_GRADE_STOPS[grade] || EXPORT_GRADE_STOPS.default;
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  stops.forEach((c, i) => grad.addColorStop(i / (stops.length - 1 || 1), c));
  ctx.fillStyle = grad;
  ctx.fill();

  if (img) {
    ctx.save();
    roundRectPath(ctx, x, y, w, h, r);
    ctx.clip();
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.globalAlpha = 0.55;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 11px 'Segoe UI', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 3;
  const lines = wrapText(ctx, name, w - 12).slice(0, 2);
  const lineH = 13;
  let ty = y + h - 7 - (lines.length - 1) * lineH;
  for (const line of lines) {
    ctx.fillText(line, x + 6, ty);
    ty += lineH;
  }
  ctx.shadowBlur = 0;
}

function drawBlankTile(ctx, x, y, w, h, label) {
  const r = 8;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = "#2c3350";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#9aa0bd";
  ctx.font = "600 10px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2);
}

async function renderPhaseCanvas(phase) {
  const phaseSlots = slots.filter((s) => s.phase === phase);
  const cols = 4, rows = 6; // mirrors the on-site phase-col-body grid
  const width = 720;
  const pad = 14;
  const gap = 6;
  const headerH = 84;
  const footerH = 64;
  const tileW = (width - pad * 2 - gap * (cols - 1)) / cols;
  const tileH = tileW * 0.75; // matches the site's 4:3 slot-cell aspect ratio
  const gridH = rows * tileH + (rows - 1) * gap;
  const height = headerH + pad + gridH + pad + footerH;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0f1220";
  ctx.fillRect(0, 0, width, height);

  const headerGrad = ctx.createLinearGradient(0, 0, 0, headerH);
  headerGrad.addColorStop(0, "#b0555f");
  headerGrad.addColorStop(1, "#8a3d47");
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, width, headerH);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 28px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${phase} Year`, width / 2, headerH / 2);

  let phaseRaces = 0, phaseFans = 0;

  for (let i = 0; i < phaseSlots.length; i++) {
    const slot = phaseSlots[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * (tileW + gap);
    const y = headerH + pad + row * (tileH + gap);

    if (slot.key === DEBUT_SLOT_KEY) {
      drawNameplateTile(ctx, x, y, tileW, tileH, "default", "Make Debut", null);
      continue;
    }

    const races = racesBySlot[slot.key] || [];
    const raceName = selections[slot.key];
    const race = raceName ? getRace(slot.key, raceName) : null;

    if (race) {
      phaseRaces++;
      phaseFans += race.fansGained || 0;
      const img = await loadImageOrNull(raceImageUrl(race.urlSlug));
      drawNameplateTile(ctx, x, y, tileW, tileH, race.grade, race.name, img);
    } else {
      drawBlankTile(ctx, x, y, tileW, tileH, slot.label);
    }
  }

  const footerY = headerH + pad + gridH + pad;
  ctx.fillStyle = "#171b2e";
  ctx.fillRect(0, footerY, width, footerH);
  ctx.fillStyle = "#e8eaf5";
  ctx.font = "700 17px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${phaseRaces} races · ${fmtNum(phaseFans)} fans this year`, width / 2, footerY + footerH / 2 - 10);
  ctx.font = "400 11px 'Segoe UI', sans-serif";
  ctx.fillStyle = "#9aa0bd";
  ctx.fillText("Made with UmaToolbox", width / 2, footerY + footerH / 2 + 13);

  return canvas;
}

async function downloadAgendaImages() {
  const canvases = [];
  for (const phase of PHASES) {
    canvases.push([phase, await renderPhaseCanvas(phase)]);
  }
  for (const [phase, canvas] of canvases) {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${phase.toLowerCase()}-agenda.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
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

  [allRaces, umas] = await Promise.all([loadRaces(), loadUmas()]);

  racesBySlot = {};
  for (const race of allRaces) {
    if (race.inGame === false) continue; // e.g. announced but not yet live (Prix Foy)
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

  // Copy Link / Download Images buttons are pulled from the toolbar for now
  // (testing phase, toolbar was wrapping to 2 lines). loadSelections() still
  // decodes a ?agenda= URL if one's opened directly, and the image-export
  // functions (renderPhaseCanvas etc., further up) are untouched - both are
  // quick to re-wire if the buttons come back.

  document.getElementById("picker-close").addEventListener("click", closePicker);
  document.getElementById("picker-modal").addEventListener("click", (e) => {
    if (e.target.id === "picker-modal") closePicker();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePicker();
  });
}

init();
