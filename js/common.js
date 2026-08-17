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
