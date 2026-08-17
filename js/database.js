let umas = [];
let supports = [];
let umaSort = { key: "name", dir: 1 };
let supportSort = { key: "name", dir: 1 };
let expandedUma = null;
let expandedSupport = null;

function populateSelect(select, values) {
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  }
}

function pct(v) {
  return v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`;
}

function val(v) {
  return v === null || v === undefined || v === "" ? "—" : v;
}

// -------- Umas --------

function umaMatchesFilters(u) {
  const q = document.getElementById("uma-search").value.trim().toLowerCase();
  const style = document.getElementById("uma-style-filter").value;
  const dist = document.getElementById("uma-dist-filter").value;

  if (q) {
    const hay = `${u.name} ${u.costume || ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (style && u.style !== style) return false;
  if (dist && u.distAptitude !== dist) return false;
  return true;
}

function renderAptitudeGrid(apt) {
  const rows = [
    ["Turf", apt.turf], ["Dirt", apt.dirt],
    ["Sprint", apt.sprint], ["Mile", apt.mile], ["Medium", apt.medium], ["Long", apt.long],
    ["Front", apt.front], ["Pace", apt.pace], ["Late", apt.late], ["End", apt.end],
  ];
  return `<div class="aptitude-grades">${rows.map(([label, g]) =>
    `<div><span class="label">${label}</span><span class="grade-letter ${letterClass(g)}">${g || "—"}</span></div>`
  ).join("")}</div>`;
}

function renderUmaDetail(u) {
  const stats = ["spd", "sta", "pwr", "gut", "wit"].map((k) =>
    `<div><span class="label">${k.toUpperCase()}</span> <span class="grade-letter">${u.statBonus[k] ? pct(u.statBonus[k]) : "—"}</span></div>`
  ).join("");

  return `
    <div class="detail-grid">
      <div>
        <h4>Aptitude</h4>
        ${renderAptitudeGrid(u.aptitude)}
      </div>
      <div>
        <h4>Inherited Stat Bonus</h4>
        ${stats}
      </div>
      <div>
        <h4>Unique Skill</h4>
        <div><strong>${val(u.uniqueSkillName)}</strong></div>
        <div style="margin-top:4px; color: var(--text-dim);">${val(u.uniqueCondition)}</div>
        ${u.preConditionNote ? `<div style="margin-top:4px;">${u.preConditionNote}</div>` : ""}
      </div>
      <div>
        <h4>Skill Effect</h4>
        <div>Target speed: ${pct(u.targetSpeedBonus)}</div>
        <div>Acceleration: ${pct(u.accelerationBonus)}</div>
        <div>Heal: ${pct(u.healBonus)}</div>
        <div>Duration: ${val(u.duration)}${u.duration ? "s" : ""}</div>
      </div>
      ${u.note ? `<div><h4>Note</h4><div>${u.note}</div></div>` : ""}
    </div>`;
}

function renderUmaTable() {
  const filtered = umas.filter(umaMatchesFilters);
  filtered.sort((a, b) => {
    const av = a[umaSort.key] ?? "";
    const bv = b[umaSort.key] ?? "";
    return av > bv ? umaSort.dir : av < bv ? -umaSort.dir : 0;
  });

  document.getElementById("uma-count").textContent = `${filtered.length} of ${umas.length} trainees`;

  const tbody = document.getElementById("uma-tbody");
  tbody.innerHTML = "";
  for (const u of filtered) {
    const tr = document.createElement("tr");
    tr.className = "expandable";
    tr.innerHTML = `
      <td>${u.name}</td>
      <td>${val(u.costume)}</td>
      <td>${val(u.style)}</td>
      <td>${val(u.distAptitude)}</td>
      <td>${val(u.uniqueSkillName)}</td>`;
    tr.addEventListener("click", () => {
      expandedUma = expandedUma === u.name ? null : u.name;
      renderUmaTable();
    });
    tbody.appendChild(tr);

    if (expandedUma === u.name) {
      const detailTr = document.createElement("tr");
      detailTr.className = "detail-row";
      const td = document.createElement("td");
      td.colSpan = 5;
      td.innerHTML = renderUmaDetail(u);
      detailTr.appendChild(td);
      tbody.appendChild(detailTr);
    }
  }
}

// -------- Supports --------

function supportMatchesFilters(s) {
  const q = document.getElementById("support-search").value.trim().toLowerCase();
  const type = document.getElementById("support-type-filter").value;
  const grade = document.getElementById("support-grade-filter").value;

  if (q) {
    const hay = `${s.name} ${s.character || ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (type && s.type !== type) return false;
  if (grade && s.grade !== grade) return false;
  return true;
}

function renderSupportDetail(s) {
  return `
    <div class="detail-grid">
      <div>
        <h4>Bonuses</h4>
        <div>Friendship bonus: ${val(s.friendshipBonus)}</div>
        <div>Motivation effect: ${val(s.motivationEffect)}</div>
        <div>Training bonus: ${val(s.trainingBonus)}</div>
        <div>Effect (M+T): ${val(s.effectMPlusTBonus)}</div>
        <div>Total (T+M+F): ${val(s.totalBonus)}</div>
      </div>
      <div>
        <h4>Race &amp; Fans</h4>
        <div>Init stat: ${val(s.initStat)}</div>
        <div>Init gauge: ${val(s.initGauge)}</div>
        <div>Race bonus: ${val(s.raceBonus)}</div>
        <div>Fan bonus: ${val(s.fanBonus)}</div>
      </div>
      <div>
        <h4>Hints &amp; Skill Points</h4>
        <div>Hint level: ${val(s.hintLevel)}</div>
        <div>Hint frequency: ${val(s.hintFrequency)}</div>
        <div>Skill pt priority: ${val(s.skillPtPriority)}</div>
        <div>Skill pt bonus: ${val(s.skillPtBonus)}</div>
      </div>
      <div>
        <h4>Other</h4>
        <div>LB pips: ${val(s.lbPips)}</div>
        <div>Friendship ratio: ${val(s.friendshipRatio)}</div>
        <div>Released: ${val(s.release)}</div>
      </div>
      ${s.notes ? `<div><h4>Notes</h4><div>${s.notes}</div></div>` : ""}
    </div>`;
}

function renderSupportTable() {
  const filtered = supports.filter(supportMatchesFilters);
  filtered.sort((a, b) => {
    const av = a[supportSort.key] ?? "";
    const bv = b[supportSort.key] ?? "";
    return av > bv ? supportSort.dir : av < bv ? -supportSort.dir : 0;
  });

  document.getElementById("support-count").textContent = `${filtered.length} of ${supports.length} support cards`;

  const tbody = document.getElementById("support-tbody");
  tbody.innerHTML = "";
  for (const s of filtered) {
    const tr = document.createElement("tr");
    tr.className = "expandable";
    tr.innerHTML = `
      <td>${val(s.character)}</td>
      <td>${s.name}</td>
      <td>${val(s.type)}</td>
      <td><span class="badge grade-default">${val(s.grade)}</span></td>
      <td>${val(s.totalBonus)}</td>
      <td>${val(s.friendshipBonus)}</td>`;
    const rowKey = `${s.character}::${s.name}`;
    tr.addEventListener("click", () => {
      expandedSupport = expandedSupport === rowKey ? null : rowKey;
      renderSupportTable();
    });
    tbody.appendChild(tr);

    if (expandedSupport === rowKey) {
      const detailTr = document.createElement("tr");
      detailTr.className = "detail-row";
      const td = document.createElement("td");
      td.colSpan = 6;
      td.innerHTML = renderSupportDetail(s);
      detailTr.appendChild(td);
      tbody.appendChild(detailTr);
    }
  }
}

// -------- Sorting / tabs / wiring --------

function wireSortableHeaders(tableId, sortState, renderFn) {
  document.querySelectorAll(`#${tableId} thead th[data-sort]`).forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (sortState.key === key) sortState.dir *= -1;
      else { sortState.key = key; sortState.dir = 1; }
      document.querySelectorAll(`#${tableId} thead th`).forEach((h) => h.classList.remove("sorted"));
      th.classList.add("sorted");
      renderFn();
    });
  });
}

function switchTab(tab) {
  document.getElementById("panel-umas").classList.toggle("hidden", tab !== "umas");
  document.getElementById("panel-supports").classList.toggle("hidden", tab !== "supports");
  document.getElementById("tab-umas").classList.toggle("primary", tab === "umas");
  document.getElementById("tab-supports").classList.toggle("primary", tab === "supports");
}

async function init() {
  renderHeader("database");

  umas = await loadJSON("data/umas.json");
  supports = await loadJSON("data/supports.json");

  populateSelect(document.getElementById("uma-style-filter"),
    [...new Set(umas.map((u) => u.style).filter(Boolean))].sort());
  populateSelect(document.getElementById("uma-dist-filter"),
    [...new Set(umas.map((u) => u.distAptitude).filter(Boolean))].sort());
  populateSelect(document.getElementById("support-type-filter"),
    [...new Set(supports.map((s) => s.type).filter(Boolean))].sort());
  populateSelect(document.getElementById("support-grade-filter"),
    [...new Set(supports.map((s) => s.grade).filter(Boolean))].sort());

  renderUmaTable();
  renderSupportTable();

  wireSortableHeaders("uma-table", umaSort, renderUmaTable);
  wireSortableHeaders("support-table", supportSort, renderSupportTable);

  ["uma-search", "uma-style-filter", "uma-dist-filter"].forEach((id) =>
    document.getElementById(id).addEventListener("input", renderUmaTable));
  ["support-search", "support-type-filter", "support-grade-filter"].forEach((id) =>
    document.getElementById(id).addEventListener("input", renderSupportTable));

  document.getElementById("tab-umas").addEventListener("click", () => switchTab("umas"));
  document.getElementById("tab-supports").addEventListener("click", () => switchTab("supports"));
}

init();
