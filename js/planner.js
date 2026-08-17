const STORAGE_KEY = "uma-planner-selections-v1";
const PHASES = ["Junior", "Classic", "Senior"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const HALVES = ["Early", "Late"];

let allRaces = [];
let slots = [];        // ordered list of { key, phase, label } for the 72 regular slots
let racesBySlot = {};  // slot key -> [race, ...]
let finalRaces = [];   // the EX/Finals races (index 97-99), shown separately
let selections = {};   // slot key -> race name (or race name for finals key)

function buildSlots() {
  slots = [];
  for (const phase of PHASES) {
    for (const month of MONTHS) {
      for (const half of HALVES) {
        const key = `${phase} ${half} ${month}`;
        slots.push({ key, phase, label: `${half} ${month}` });
      }
    }
  }
}

function loadSelections() {
  try {
    selections = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    selections = {};
  }
}

function saveSelections() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(selections));
}

function getFilters() {
  const checked = (name) => document.querySelector(`[data-apt="${name}"]`).checked;
  return {
    surfaces: new Set(["turf", "dirt"].filter((s) => checked(`surface-${s}`))),
    distTypes: new Set(["Short", "Mile", "Medium", "Long"].filter((d) => checked(`dist-${d}`))),
  };
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

function renderSlotCard(slot) {
  const races = racesBySlot[slot.key] || [];
  const selected = selections[slot.key];
  const filters = getFilters();

  const card = document.createElement("div");
  card.className = "slot-card" + (selected ? " has-selection" : "") + (races.length === 0 ? " empty-slot" : "");

  const header = document.createElement("div");
  header.className = "slot-header";
  header.innerHTML = `<span class="slot-label">${slot.label}</span>`;
  card.appendChild(header);

  if (races.length === 0) {
    const note = document.createElement("div");
    note.className = "slot-empty-note";
    note.textContent = "No races scheduled — training only.";
    card.appendChild(note);
    return card;
  }

  const options = document.createElement("div");
  options.className = "race-options";

  const noneBtn = document.createElement("button");
  noneBtn.type = "button";
  noneBtn.className = "none-option" + (!selected ? " selected" : "");
  noneBtn.textContent = "Skip / train";
  noneBtn.addEventListener("click", () => {
    delete selections[slot.key];
    saveSelections();
    renderAll();
  });
  options.appendChild(noneBtn);

  for (const race of races) {
    const btn = document.createElement("button");
    btn.type = "button";
    const isSelected = selected === race.name;
    const offApt = !raceMatchesFilter(race, filters);
    btn.className = "race-option" + (isSelected ? " selected" : "") + (offApt ? " off-aptitude" : "");
    const grade = race.grade ? `<span class="badge ${gradeBadgeClass(race.grade)}">${race.grade}</span>` : "";
    btn.innerHTML = `${grade}<span class="rname">${race.name}</span><span class="rmeta">${raceOptionLabel(race)}</span>`;
    btn.addEventListener("click", () => {
      selections[slot.key] = isSelected ? undefined : race.name;
      if (!selections[slot.key]) delete selections[slot.key];
      saveSelections();
      renderAll();
    });
    options.appendChild(btn);
  }

  card.appendChild(options);
  return card;
}

function computeStats() {
  let count = 0, distance = 0, fans = 0;
  let streak = 0, longestStreak = 0;

  for (const slot of slots) {
    const raceName = selections[slot.key];
    const race = raceName ? (racesBySlot[slot.key] || []).find((r) => r.name === raceName) : null;
    if (race) {
      count++;
      distance += race.meters || 0;
      fans += race.fansGained || 0;
      streak++;
      longestStreak = Math.max(longestStreak, streak);
    } else {
      streak = 0;
    }
  }

  return { count, distance, fans, longestStreak };
}

function renderStats() {
  const { count, distance, fans, longestStreak } = computeStats();
  document.getElementById("stat-count").textContent = fmtNum(count);
  document.getElementById("stat-distance").textContent = `${fmtNum(distance)} m`;
  document.getElementById("stat-fans").textContent = fmtNum(fans);

  const threshold = Number(document.getElementById("warn-threshold").value) || 4;
  const streakEl = document.getElementById("stat-streak");
  streakEl.textContent = longestStreak;
  streakEl.className = "v" + (longestStreak > threshold ? " streak-bad" : longestStreak === threshold ? " streak-warn" : "");
}

function renderBody() {
  const body = document.getElementById("planner-body");
  body.innerHTML = "";

  for (const phase of PHASES) {
    const heading = document.createElement("div");
    heading.className = "phase-heading";
    const phaseSlots = slots.filter((s) => s.phase === phase);
    const filled = phaseSlots.filter((s) => selections[s.key]).length;
    heading.innerHTML = `${phase} Year <span class="phase-sub">${filled} race${filled === 1 ? "" : "s"} selected</span>`;
    body.appendChild(heading);

    for (const slot of phaseSlots) {
      body.appendChild(renderSlotCard(slot));
    }
  }

  const finHeading = document.createElement("div");
  finHeading.className = "phase-heading";
  finHeading.innerHTML = `Career Finale <span class="phase-sub">informational only — not counted in totals</span>`;
  body.appendChild(finHeading);

  const finCard = document.createElement("div");
  finCard.className = "slot-card";
  const finOptions = document.createElement("div");
  finOptions.className = "race-options";
  for (const race of finalRaces) {
    const span = document.createElement("span");
    span.className = "race-option off-aptitude";
    span.style.cursor = "default";
    const grade = `<span class="badge ${gradeBadgeClass(race.grade)}">${race.grade}</span>`;
    span.innerHTML = `${grade}<span class="rname">${race.name}</span>`;
    finOptions.appendChild(span);
  }
  finCard.appendChild(finOptions);
  body.appendChild(finCard);
}

function renderAll() {
  renderBody();
  renderStats();
}

async function init() {
  renderHeader("planner");
  buildSlots();
  loadSelections();

  allRaces = await loadJSON("data/races.json");
  racesBySlot = {};
  finalRaces = [];
  for (const race of allRaces) {
    if (race.slot === "Fin ???") {
      finalRaces.push(race);
      continue;
    }
    (racesBySlot[race.slot] ||= []).push(race);
  }

  renderAll();

  document.querySelectorAll('[data-apt]').forEach((el) => el.addEventListener("change", renderAll));
  document.getElementById("warn-threshold").addEventListener("input", renderStats);
  document.getElementById("reset-btn").addEventListener("click", () => {
    if (confirm("Clear every race you've picked?")) {
      selections = {};
      saveSelections();
      renderAll();
    }
  });
}

init();
