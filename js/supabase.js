// Reads umas/supports from Supabase (via its auto-generated REST API) and
// reshapes each row back into the same nested shape data/umas.json and
// data/supports.json already used, so nothing downstream (planner.js) needs
// to change regardless of which source is active. See js/supabase-config.js
// for the on/off switch.

async function supabaseSelect(table, query) {
  const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SUPABASE_CONFIG.anonKey,
      Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase request failed: ${table} (${res.status})`);
  return res.json();
}

function reshapeUmaRow(row) {
  return {
    name: row.name,
    inGame: row.in_game,
    costume: row.costume,
    version: row.version,
    uniqueSkillName: row.unique_skill_name,
    uniqueCondition: row.unique_condition,
    preConditionNote: row.pre_condition_note,
    distAptitude: row.dist_aptitude,
    style: row.style,
    targetSpeedBonus: row.target_speed_bonus,
    accelerationBonus: row.acceleration_bonus,
    healBonus: row.heal_bonus,
    uniqueEffectNote: row.unique_effect_note,
    duration: row.duration,
    aptitude: {
      turf: row.apt_turf, dirt: row.apt_dirt, sprint: row.apt_sprint,
      mile: row.apt_mile, medium: row.apt_medium, long: row.apt_long,
      front: row.apt_front, pace: row.apt_pace, late: row.apt_late, end: row.apt_end,
    },
    statBonus: {
      spd: row.stat_spd, sta: row.stat_sta, pwr: row.stat_pwr,
      gut: row.stat_gut, wit: row.stat_wit,
    },
    note: row.note,
    release: row.release_date,
  };
}

function reshapeSupportRow(row) {
  return {
    character: row.character,
    name: row.name,
    inGame: row.in_game,
    type: row.type,
    grade: row.grade,
    lbPips: row.lb_pips,
    friendshipBonus: row.friendship_bonus,
    motivationEffect: row.motivation_effect,
    trainingBonus: row.training_bonus,
    effectMPlusTBonus: row.effect_m_plus_t_bonus,
    totalBonus: row.total_bonus,
    initStat: row.init_stat,
    initGauge: row.init_gauge,
    raceBonus: row.race_bonus,
    fanBonus: row.fan_bonus,
    hintLevel: row.hint_level,
    hintFrequency: row.hint_frequency,
    skillPtPriority: row.skill_pt_priority,
    skillPtBonus: row.skill_pt_bonus,
    notes: row.notes,
    friendshipRatio: row.friendship_ratio,
    release: row.release_date,
  };
}

async function loadUmas() {
  if (!SUPABASE_CONFIG.enabled) return loadJSON("data/umas.json");
  const rows = await supabaseSelect("umas", "select=*&order=name");
  return rows.map(reshapeUmaRow);
}

async function loadSupports() {
  if (!SUPABASE_CONFIG.enabled) return loadJSON("data/supports.json");
  const rows = await supabaseSelect("supports", "select=*&order=character");
  return rows.map(reshapeSupportRow);
}
