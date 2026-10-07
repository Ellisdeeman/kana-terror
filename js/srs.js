/**
 * SM-2 scheduling and the JLPT Vocab Quest file formats.
 * Change EXPORT_SOURCE if the study app should read a different id.
 */
export const EXPORT_SOURCE = "kana-terror";

export const RESULTS_MAX = 5000;
export const MS_MAX = 3600000;
export const VOCAB_ID_MAX = 717;
export const WEAK_MULT = 1.6;
export const WEIGHT_CAP = 3.2;

export function emptyCard(type, id) {
  return {
    id,
    type,
    ease: 2.5,
    intervalDays: 0,
    reps: 0,
    due: 0,
    lapses: 0,
    correct: 0,
    incorrect: 0,
    seen: false,
  };
}

export function cardKey(type, id) {
  return `${type}:${id}`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

/** grade is "perfect" (q=5), "slow" (q=3), or "wrong" (q=1). */
export function reviewCard(prev, grade, now = Date.now()) {
  const card = { ...emptyCard(prev?.type, prev?.id), ...prev };
  const q = grade === "perfect" ? 5 : grade === "slow" ? 3 : 1;
  if (q < 3) {
    card.incorrect += 1;
    card.reps = 0;
    card.intervalDays = 0;
    card.lapses += 1;
    card.due = now + 20000;
  } else {
    card.correct += 1;
    if (card.reps <= 0) card.intervalDays = 1;
    else if (card.reps === 1) card.intervalDays = 6;
    else card.intervalDays = round4(card.intervalDays * card.ease);
    card.reps += 1;
    card.due = now + card.intervalDays * 86400000;
  }
  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  card.ease = Math.max(1.3, round2(card.ease + delta));
  card.seen = true;
  return card;
}

export function gradeFromAnswer(correct, ms, len = 2) {
  if (!correct) return "wrong";
  const limit = len <= 2 ? 2400 : len <= 5 ? 3800 : 5200;
  return ms <= limit ? "perfect" : "slow";
}

export function clampMs(ms) {
  const n = Math.round(Number(ms));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MS_MAX, n);
}

/** ISO time strictly later than the previous export. */
export function uniqueIso(previous, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  let t = Number.isFinite(nowMs) ? nowMs : Date.now();
  const prev = typeof previous === "string" ? Date.parse(previous) : NaN;
  if (Number.isFinite(prev) && t <= prev) t = prev + 1;
  return new Date(t).toISOString();
}

function resultId(type, id) {
  if (type === "vocab") {
    const n = typeof id === "number" ? id : NaN;
    return Number.isInteger(n) ? n : null;
  }
  if (typeof id !== "string" || id.length === 0 || id.length > 8) return null;
  return id;
}

export function normalizeResults(results) {
  const rows = [];
  for (const r of results || []) {
    if (!r || (r.type !== "vocab" && r.type !== "kana" && r.type !== "kanji")) continue;
    const id = resultId(r.type, r.id);
    if (id == null) continue;
    rows.push({
      id,
      type: r.type,
      correct: r.correct === true,
      ms: clampMs(r.ms),
    });
  }
  return rows;
}

export function buildResultsExport(results, date = new Date()) {
  const iso = typeof date === "string" ? uniqueIso(null, new Date(date)) : date.toISOString();
  return {
    source: EXPORT_SOURCE,
    date: iso,
    results: normalizeResults(results).slice(0, RESULTS_MAX),
  };
}

export function splitPending(results) {
  const clean = normalizeResults(results);
  return {
    batch: clean.slice(0, RESULTS_MAX),
    rest: clean.slice(RESULTS_MAX),
  };
}

function intIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const id of value) {
    if (typeof id !== "number" || !Number.isInteger(id)) continue;
    if (id < 0 || id > VOCAB_ID_MAX || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  out.sort((a, b) => a - b);
  return out;
}

/**
 * Study list from JLPT Vocab Quest.
 * Unknown fields are ignored. Ids outside 0–717 are skipped.
 * weak is kept only when it is also in known.
 */
export function parseStudyList(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Study list must be a JSON object.");
  }
  if (data.app !== "jlpt-vocab-quest" || data.v !== 1) {
    throw new Error('Study list must use {"app":"jlpt-vocab-quest","v":1}.');
  }
  if (!Array.isArray(data.known)) throw new Error("known must be an array of word ids.");
  const known = intIds(data.known);
  const knownSet = new Set(known);
  const weak = intIds(data.weak).filter((id) => knownSet.has(id));
  return { known, weak };
}

/** Every imported known word. Before a list exists, the full N5 set. */
export function vocabPool(vocab, study) {
  if (study && Array.isArray(study.known) && study.known.length) {
    const set = new Set(study.known);
    return vocab.filter((w) => set.has(w.id));
  }
  return vocab;
}

export function isWeak(study, id) {
  return !!study && Array.isArray(study.weak) && study.weak.includes(id);
}

/** 1 at the rare end, about 2.4 at the most common. */
export function commonWeight(rank, count) {
  const t = count <= 1 ? 0 : rank / (count - 1);
  return 1 + 1.4 * (1 - t);
}

/**
 * Spawn weight. With a study list, every known word stays in the pool.
 * Weak words get a moderate multiplier and cannot crowd the others out.
 */
export function spawnWeight(item, card, study, now = Date.now(), mode = "flat") {
  const hasList = !!(study && Array.isArray(study.known) && study.known.length);
  let w = 1;
  if (item.type === "vocab") {
    if (hasList) {
      if (isWeak(study, item.id)) w *= WEAK_MULT;
    } else if (item.rank != null) {
      w = commonWeight(item.rank, item.rankCount || 718);
      if (mode === "early") w = w ** 1.15;
    }
  }
  if (card && card.seen) {
    if (card.due <= now) w *= 1.65;
    else w *= 0.9;
    if ((card.incorrect || 0) > (card.correct || 0)) w *= 1.3;
  }
  const cap = hasList ? WEIGHT_CAP : 4;
  return Math.min(cap, Math.max(0.05, w));
}

export function pickWeighted(items, weightOf, rng) {
  if (!items.length) return null;
  let total = 0;
  const weights = items.map((it) => {
    const w = Math.max(0, weightOf(it));
    total += w;
    return w;
  });
  if (total <= 0) return items[Math.floor(rng() * items.length)];
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function sameResult(a, b) {
  return a.type === b.type && a.id === b.id && a.correct === b.correct && a.ms === b.ms;
}

/** Drop exported rows from the queue. Prefers a matching head, then first hits. */
export function commitExported(results, exportedRows) {
  const rows = results.slice();
  const n = exportedRows.length;
  const head = n > 0 && rows.length >= n && exportedRows.every((r, i) => sameResult(r, rows[i]));
  if (head) return rows.slice(n);
  const next = rows.slice();
  for (const e of exportedRows) {
    const idx = next.findIndex((r) => sameResult(r, e));
    if (idx >= 0) next.splice(idx, 1);
  }
  return next;
}

export function prepareExport(save, now = new Date()) {
  const { batch, rest } = splitPending(save.results || []);
  if (!batch.length) return null;
  const date = uniqueIso(save.lastExportDate, now);
  const payload = buildResultsExport(batch, date);
  if (!payload.results.length) return null;
  return { payload, rest };
}

export function emptySave() {
  return {
    v: 1,
    muted: false,
    speech: false,
    study: null,
    cards: {},
    results: [],
    lastExportDate: null,
    best: 0,
    clears: 0,
    endlessBest: 0,
    runs: 0,
    pace: "relaxed",
  };
}
