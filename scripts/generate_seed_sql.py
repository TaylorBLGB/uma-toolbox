"""
Generates db/seed.sql from the current data/umas.json, data/supports.json and
data/races.json, for a one-time load into a fresh Supabase project (after
running db/schema.sql).

    python scripts/generate_seed_sql.py

This is a one-time migration aid, not something you re-run routinely - once
the data lives in Supabase, you edit it there directly.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT_FILE = ROOT / "db" / "seed.sql"

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
WARNINGS = []


def sql_str(v):
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def sql_bool(v):
    return "true" if v else "false"


def sql_num(v, context):
    """Numeric columns only ever get null or a real number. A raw string like
    '0.3/0' would otherwise land unquoted in the SQL as a literal division -
    Postgres evaluates that at insert time (division by zero if the
    denominator is 0), rather than erroring on bad syntax as you'd expect."""
    if v is None:
        return "null"
    if isinstance(v, (int, float)):
        return str(v)
    try:
        return str(float(v))
    except (TypeError, ValueError):
        WARNINGS.append(f"{context}: non-numeric value {v!r} in a numeric column -> stored as null")
        return "null"


def sql_date(v, context):
    """Date columns only ever get null or an ISO date - arbitrary text (e.g.
    a '?' placeholder for an unannounced release) fails as invalid input for
    type date rather than being silently accepted."""
    if v is None:
        return "null"
    if DATE_RE.match(str(v)):
        return f"'{v}'"
    WARNINGS.append(f"{context}: invalid date value {v!r} -> stored as null")
    return "null"


UMA_COLUMNS = [
    "name", "costume", "version", "in_game", "unique_skill_name", "unique_condition",
    "pre_condition_note", "dist_aptitude", "style", "target_speed_bonus",
    "acceleration_bonus", "heal_bonus", "unique_effect_note", "duration",
    "apt_turf", "apt_dirt", "apt_sprint", "apt_mile", "apt_medium", "apt_long",
    "apt_front", "apt_pace", "apt_late", "apt_end",
    "stat_spd", "stat_sta", "stat_pwr", "stat_gut", "stat_wit",
    "note", "release_date",
]


def uma_row(u):
    apt = u.get("aptitude") or {}
    stat = u.get("statBonus") or {}
    label = f"uma {u.get('name')!r} ({u.get('costume')})"
    return [
        sql_str(u.get("name")), sql_str(u.get("costume")), sql_str(u.get("version")),
        sql_bool(u.get("inGame")), sql_str(u.get("uniqueSkillName")), sql_str(u.get("uniqueCondition")),
        sql_str(u.get("preConditionNote")), sql_str(u.get("distAptitude")), sql_str(u.get("style")),
        sql_num(u.get("targetSpeedBonus"), f"{label}.targetSpeedBonus"),
        sql_num(u.get("accelerationBonus"), f"{label}.accelerationBonus"),
        sql_num(u.get("healBonus"), f"{label}.healBonus"),
        sql_str(u.get("uniqueEffectNote")),
        sql_num(u.get("duration"), f"{label}.duration"),
        sql_str(apt.get("turf")), sql_str(apt.get("dirt")), sql_str(apt.get("sprint")),
        sql_str(apt.get("mile")), sql_str(apt.get("medium")), sql_str(apt.get("long")),
        sql_str(apt.get("front")), sql_str(apt.get("pace")), sql_str(apt.get("late")), sql_str(apt.get("end")),
        sql_num(stat.get("spd"), f"{label}.statBonus.spd"),
        sql_num(stat.get("sta"), f"{label}.statBonus.sta"),
        sql_num(stat.get("pwr"), f"{label}.statBonus.pwr"),
        sql_num(stat.get("gut"), f"{label}.statBonus.gut"),
        sql_num(stat.get("wit"), f"{label}.statBonus.wit"),
        sql_str(u.get("note")),
        sql_date(u.get("release"), f"{label}.release"),
    ]


SUPPORT_COLUMNS = [
    "character", "name", "in_game", "type", "grade", "lb_pips",
    "friendship_bonus", "motivation_effect", "training_bonus", "effect_m_plus_t_bonus", "total_bonus",
    "init_stat", "init_gauge", "race_bonus", "fan_bonus",
    "hint_level", "hint_frequency", "skill_pt_priority", "skill_pt_bonus",
    "notes", "friendship_ratio", "release_date",
]


def support_row(s):
    label = f"support {s.get('character')!r} / {s.get('name')!r}"
    return [
        sql_str(s.get("character")), sql_str(s.get("name")), sql_bool(s.get("inGame")),
        sql_str(s.get("type")), sql_str(s.get("grade")),
        sql_num(s.get("lbPips"), f"{label}.lbPips"),
        sql_num(s.get("friendshipBonus"), f"{label}.friendshipBonus"),
        sql_num(s.get("motivationEffect"), f"{label}.motivationEffect"),
        sql_num(s.get("trainingBonus"), f"{label}.trainingBonus"),
        sql_num(s.get("effectMPlusTBonus"), f"{label}.effectMPlusTBonus"),
        sql_num(s.get("totalBonus"), f"{label}.totalBonus"),
        sql_num(s.get("initStat"), f"{label}.initStat"),
        sql_num(s.get("initGauge"), f"{label}.initGauge"),
        sql_num(s.get("raceBonus"), f"{label}.raceBonus"),
        sql_num(s.get("fanBonus"), f"{label}.fanBonus"),
        sql_num(s.get("hintLevel"), f"{label}.hintLevel"),
        sql_num(s.get("hintFrequency"), f"{label}.hintFrequency"),
        sql_num(s.get("skillPtPriority"), f"{label}.skillPtPriority"),
        sql_num(s.get("skillPtBonus"), f"{label}.skillPtBonus"),
        sql_str(s.get("notes")),
        sql_num(s.get("friendshipRatio"), f"{label}.friendshipRatio"),
        sql_date(s.get("release"), f"{label}.release"),
    ]


RACE_COLUMNS = [
    "name", "in_game", "grade", "dist_type", "meters", "date_index", "slot", "phase",
    "surface", "racecourse", "course", "direction", "participants", "time_of_day",
    "base_fans", "url_slug", "fans_required", "fans_gained",
]


def race_row(r):
    label = f"race {r.get('name')!r} ({r.get('slot')})"
    return [
        sql_str(r.get("name")),
        sql_bool(r.get("inGame", True)),  # races.json predates this field - treat all as live
        sql_str(r.get("grade")), sql_str(r.get("distType")),
        sql_num(r.get("meters"), f"{label}.meters"),
        sql_num(r.get("dateIndex"), f"{label}.dateIndex"),
        sql_str(r.get("slot")), sql_str(r.get("phase")), sql_str(r.get("surface")),
        sql_str(r.get("racecourse")), sql_str(r.get("course")), sql_str(r.get("direction")),
        sql_str(r.get("participants")),  # text - some races have compound values like "16/14/14/16"
        sql_str(r.get("timeOfDay")),
        sql_num(r.get("baseFans"), f"{label}.baseFans"),
        sql_str(r.get("urlSlug")),
        sql_num(r.get("fansRequired"), f"{label}.fansRequired"),
        sql_num(r.get("fansGained"), f"{label}.fansGained"),
    ]


def build_insert(table, columns, rows):
    lines = [f"insert into {table} ({', '.join(columns)}) values"]
    value_lines = [f"  ({', '.join(row)})" for row in rows]
    lines.append(",\n".join(value_lines) + ";")
    return "\n".join(lines)


def main():
    umas = json.loads((DATA_DIR / "umas.json").read_text(encoding="utf-8"))
    supports = json.loads((DATA_DIR / "supports.json").read_text(encoding="utf-8"))
    races = json.loads((DATA_DIR / "races.json").read_text(encoding="utf-8"))

    parts = [
        "-- Generated by scripts/generate_seed_sql.py - run once in Supabase's SQL Editor",
        "-- after schema.sql. Safe to re-run against an empty table; will duplicate rows",
        "-- if the tables already have data (truncate first if re-seeding).",
        "",
        build_insert("umas", UMA_COLUMNS, [uma_row(u) for u in umas]),
        "",
        build_insert("supports", SUPPORT_COLUMNS, [support_row(s) for s in supports]),
        "",
        build_insert("races", RACE_COLUMNS, [race_row(r) for r in races]),
        "",
    ]

    OUT_FILE.write_text("\n".join(parts), encoding="utf-8")
    print(f"Wrote {OUT_FILE} ({len(umas)} umas, {len(supports)} supports, {len(races)} races)")

    if WARNINGS:
        print(f"\n{len(WARNINGS)} value(s) couldn't be stored as-is and were set to null:")
        for w in WARNINGS:
            print(f"  - {w}")
        print("\nThese reflect real data in the spreadsheet that doesn't fit a single number or a real")
        print("date (e.g. a '?' placeholder for an unannounced release, a dual value like '0.3/0', or a")
        print("cell that got auto-formatted as a date). Fix them in the spreadsheet if you want the real")
        print("value in Supabase too - regenerating won't overwrite rows you've already loaded, so either")
        print("re-seed from scratch or edit those specific cells directly in the Supabase Table Editor.")


if __name__ == "__main__":
    main()
