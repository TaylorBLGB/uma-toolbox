function renderHeader(active) {
  const el = document.getElementById("site-header");
  el.innerHTML = `
    <div class="site-header-inner">
      <a class="site-title" href="index.html">Uma<span>Toolbox</span></a>
      <nav class="site-nav">
        <a href="index.html" class="${active === "home" ? "active" : ""}">Home</a>
        <a href="planner.html" class="${active === "planner" ? "active" : ""}">Race Planner</a>
        <a href="database.html" class="${active === "database" ? "active" : ""}">Database</a>
      </nav>
    </div>`;
}

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

const KNOWN_GRADES = ["G1", "G2", "G3", "OP", "Pre-OP", "Finals", "EX"];

function gradeBadgeClass(grade) {
  if (grade && KNOWN_GRADES.includes(grade)) return `grade-${grade}`;
  return "grade-default";
}

function letterClass(letter) {
  return letter ? `gl-${letter}` : "";
}

// Best to worst. This game's aptitude scale tops out at A (no S grade in the data).
const APTITUDE_ORDER = ["A", "B", "C", "D", "E", "F", "G"];

function aptitudeAtLeast(grade, threshold) {
  const gi = APTITUDE_ORDER.indexOf(grade);
  const ti = APTITUDE_ORDER.indexOf(threshold);
  if (gi === -1 || ti === -1) return false;
  return gi <= ti;
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
