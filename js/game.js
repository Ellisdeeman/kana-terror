import { SECTORS, sectorByIndex, endlessTuning, BOSS_PHRASE } from "./content.js";
import {
  cardKey,
  emptyCard,
  gradeFromAnswer,
  pickWeighted,
  reviewCard,
  spawnWeight,
  vocabPool,
} from "./srs.js";
import { foldLong, liveConvert, pendingFits, sameReading } from "./romaji.js";

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRun(mode = "campaign", seed = 1) {
  const state = {
    mode,
    rng: mulberry32(seed || 1),
    phase: "play",
    sector: 0,
    banner: null,
    kills: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    hp: 100,
    coolant: 100,
    hits: 0,
    misses: 0,
    enemies: [],
    fx: [],
    input: "",
    kana: "",
    pending: "",
    lock: null,
    toast: null,
    spawnIn: 220,
    elapsed: 0,
    shake: 0,
    hurtFlash: 0,
    uid: 1,
    events: [],
    runResults: [],
    clearIn: 0,
    endlessKills: 0,
    heatAcc: 0,
    lamp: 0,
  };
  announceSector(state);
  return state;
}

export function tuningOf(state) {
  if (state.mode === "endless") return endlessTuning(state.endlessKills);
  return sectorByIndex(state.sector);
}

function announceSector(state) {
  const t = tuningOf(state);
  state.banner = { kicker: t.code, title: t.name, sub: t.blurb, until: 2600 };
}

function chars(s) {
  return [...foldLong(s)];
}

function sameAt(a, b) {
  if (a === b) return true;
  if ((a === "を" && b === "お") || (a === "お" && b === "を")) return true;
  return false;
}

export function fitsEnemy(enemy, kana, pending) {
  const got = chars(kana);
  return enemy.accept.some((acc) => {
    const target = chars(acc);
    if (got.length > target.length) return false;
    for (let i = 0; i < got.length; i++) if (!sameAt(got[i], target[i])) return false;
    const rest = target.slice(got.length).join("");
    if (!pending) return true;
    return pendingFits(rest, pending);
  });
}

function isComplete(enemy, kana, pending) {
  if (pending && pending !== "n") return false;
  const got = pending === "n" ? `${kana}ん` : kana;
  return enemy.accept.some((acc) => sameReading(acc, got));
}

function remainingLen(enemy, kana) {
  let best = 99;
  const got = chars(kana);
  for (const acc of enemy.accept) {
    const target = chars(acc);
    if (got.length > target.length) continue;
    let ok = true;
    for (let i = 0; i < got.length; i++) if (!sameAt(got[i], target[i])) ok = false;
    if (!ok) continue;
    best = Math.min(best, target.length - got.length);
  }
  return best;
}

export function refreshLock(state) {
  let best = null;
  let bestScore = -Infinity;
  for (const e of state.enemies) {
    if (e.gone) continue;
    if (state.kana || state.pending) {
      if (!fitsEnemy(e, state.kana, state.pending)) continue;
    }
    const score = e.progress * 1000 - remainingLen(e, state.kana) * 2;
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  state.lock = best ? best.uid : null;
  return best;
}

function locked(state) {
  return state.enemies.find((e) => e.uid === state.lock && !e.gone) || null;
}

function clearBuffer(state) {
  state.input = "";
  state.kana = "";
  state.pending = "";
}

function pushResult(state, ctx, row) {
  state.runResults.push(row);
  state.events.push({ type: "result", row });
  if (ctx && ctx.onResult) ctx.onResult(row);
}

function applyReview(state, ctx, item, correct, ms) {
  if (!ctx || !ctx.cards) return;
  const key = cardKey(item.type, item.id);
  const prev = ctx.cards[key] || emptyCard(item.type, item.id);
  const grade = gradeFromAnswer(correct, ms, item.len || [...String(item.reading || "")].length || 2);
  ctx.cards[key] = reviewCard(prev, grade, ctx.now ? ctx.now() : Date.now());
}

function toastOf(enemy, ms) {
  const reading = enemy.reading || enemy.accept[0] || "";
  return {
    jp: enemy.toastJp || enemy.display,
    reading,
    en: enemy.meaning || "",
    until: 1500,
    ms,
  };
}

function killEnemy(state, ctx, enemy) {
  const ms = Math.max(0, state.elapsed - enemy.born);
  enemy.gone = true;
  state.combo += 1;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  const speed = ms <= 1800 ? 1.55 : ms <= 3200 ? 1.25 : 1;
  const gain = Math.round(110 * (1 + Math.min(12, state.combo) * 0.18) * speed);
  state.score += gain;
  state.coolant = Math.min(100, state.coolant + 18);
  state.toast = toastOf(enemy, ms);
  state.shake = Math.max(state.shake, 4);
  state.fx.push({ x: enemy.progress, lane: enemy.lane, life: 420, kind: "burst", variant: enemy.variant });
  state.events.push({ type: "kill", enemy, gain, ms });
  if (enemy.type && enemy.report !== false) {
    const row = { id: enemy.reportId ?? enemy.id, type: enemy.type, correct: true, ms };
    pushResult(state, ctx, row);
    applyReview(state, ctx, enemy, true, ms);
  }
  if (enemy.bossPhrase) {
    for (const part of BOSS_PHRASE.parts) {
      const row = { id: part.id, type: part.type, correct: true, ms };
      pushResult(state, ctx, row);
      applyReview(state, ctx, { type: part.type, id: part.id, len: 8 }, true, ms);
    }
  }
  clearBuffer(state);
}

function damage(state, amount) {
  state.hp = Math.max(0, state.hp - amount);
  state.combo = 0;
  state.shake = 12;
  state.hurtFlash = 1;
  state.events.push({ type: "hurt", amount });
  if (state.hp <= 0) {
    state.phase = "dead";
    state.events.push({ type: "dead" });
  }
}

function missCreature(state, ctx, enemy) {
  const ms = Math.max(0, state.elapsed - (enemy.wordBorn || enemy.born));
  state.misses += 1;
  if (enemy.type && enemy.report !== false && !enemy.bossPhrase) {
    const row = { id: enemy.reportId ?? enemy.id, type: enemy.type, correct: false, ms };
    pushResult(state, ctx, row);
    applyReview(state, ctx, enemy, false, ms);
  }
}

function resolveReach(state, ctx, enemy) {
  if (enemy.boss) {
    if (enemy.hitLock > state.elapsed) {
      enemy.progress = 0.72;
      return;
    }
    enemy.hitLock = state.elapsed + 900;
    damage(state, 32);
    missCreature(state, ctx, enemy);
    enemy.progress = 0.62;
    clearBuffer(state);
    if (state.phase !== "play") enemy.gone = true;
    return;
  }
  damage(state, enemy.damage);
  missCreature(state, ctx, enemy);
  enemy.gone = true;
  clearBuffer(state);
}

function poolFor(catalog, study, kind) {
  if (kind === "hira-basic") return catalog.hiraBasic;
  if (kind === "hira-full") return catalog.hiraFull;
  if (kind === "kata") return catalog.kata;
  if (kind === "kanji") return catalog.kanji;
  return vocabPool(catalog.vocab, study);
}

function avoidDup(items, enemies) {
  if (items.length < 2) return items;
  const live = new Set(enemies.filter((e) => !e.gone).map((e) => `${e.type}:${e.id}`));
  const filtered = items.filter((it) => !live.has(`${it.type}:${it.id}`));
  return filtered.length ? filtered : items;
}

function pickItem(state, ctx, kind, shortOnly) {
  let items = poolFor(ctx.catalog, ctx.study, kind);
  if (shortOnly) {
    const short = items.filter((it) => (it.len || 9) <= 2);
    if (short.length) items = short;
  }
  if (kind === "vocab" || kind === "kanji") items = avoidDup(items, state.enemies);
  const mode = tuningOf(state).vocabMode || "flat";
  const now = ctx.now ? ctx.now() : Date.now();
  return pickWeighted(items, (it) => {
    const card = ctx.cards ? ctx.cards[cardKey(it.type, it.id)] : null;
    return spawnWeight(it, card, ctx.study, now, mode);
  }, state.rng);
}

function makeEnemy(state, item, variant, speed) {
  const uid = state.uid++;
  const lane = Math.floor(state.rng() * 3);
  const base = {
    uid,
    lane,
    progress: 0.02 + state.rng() * 0.04,
    speed,
    born: state.elapsed,
    wordBorn: state.elapsed,
    gone: false,
    variant,
    type: item.type,
    id: item.id,
    accept: item.accept,
    display: item.display,
    meaning: item.meaning,
    reading: item.reading || item.accept[0],
    len: item.len || [...(item.accept[0] || "")].length,
    script: item.script || "hira",
    damage: variant === "runner" ? 14 : variant === "armored" ? 26 : variant === "mimic" ? 20 : 22,
    prompt: "reading",
  };
  if (variant === "mimic") {
    base.prompt = "english";
    base.display = item.meaning || item.display;
    base.toastJp = item.display;
  } else if (variant === "armored") {
    base.prompt = "kanji";
    base.display = item.type === "kanji" ? item.display : (item.kanji ? item.jp || item.display : item.display);
    base.toastJp = item.type === "vocab" ? item.jp || item.display : item.display;
  } else if (item.type === "vocab") {
    base.prompt = "vocab";
    base.toastJp = item.jp || item.display;
  }
  return base;
}

export function spawnEnemy(state, ctx, tuning = tuningOf(state)) {
  const roll = state.rng();
  let variant = "crawler";
  let kind = tuning.pool;
  if (tuning.pool === "mix") {
    const r = state.rng();
    kind = r < 0.34 ? "vocab" : r < 0.55 ? "kanji" : r < 0.78 ? "kata" : "hira-full";
  }
  if (roll < tuning.runners) {
    variant = "runner";
    kind = tuning.pool === "kata" ? "kata" : "hira-full";
  } else if (roll < tuning.runners + tuning.mimic) {
    variant = "mimic";
    kind = "vocab";
  } else if (roll < tuning.runners + tuning.mimic + tuning.armored) {
    variant = "armored";
    kind = tuning.pool === "kanji" || kind === "kanji" ? "kanji" : "vocab";
  } else if (kind === "kata") variant = "spore";
  else if (kind === "vocab" || kind === "kanji") variant = "host";

  if (variant === "armored" && kind === "vocab") {
    const kanjiWords = poolFor(ctx.catalog, ctx.study, "vocab").filter((w) => w.kanji);
    if (!kanjiWords.length && tuning.pool !== "vocab") kind = "kanji";
  }
  const item = pickItem(state, ctx, kind, variant === "runner");
  if (!item) return null;
  if (variant === "armored" && item.type === "vocab" && !item.kanji) variant = "host";
  const speed = tuning.speed * (variant === "runner" ? 1.72 : variant === "armored" ? 0.86 : 1) * (0.92 + state.rng() * 0.16);
  const enemy = makeEnemy(state, item, variant, speed);
  state.enemies.push(enemy);
  state.events.push({ type: "spawn", enemy });
  return enemy;
}

function bossWordItem(state, ctx) {
  const vocab = poolFor(ctx.catalog, ctx.study, "vocab");
  const usable = vocab.filter((w) => w.len >= 2 && w.len <= 6);
  const item = pickItem(state, ctx, "vocab", false);
  return (usable.length && item && item.len <= 8 ? item : usable[0]) || item;
}

function applyBossWord(state, enemy, item) {
  enemy.type = item.type;
  enemy.id = item.id;
  enemy.accept = item.accept;
  enemy.display = item.display;
  enemy.meaning = item.meaning;
  enemy.reading = item.reading || item.accept[0];
  enemy.len = item.len || 2;
  enemy.toastJp = item.jp || item.display;
  enemy.prompt = "vocab";
  enemy.report = true;
  enemy.bossPhrase = false;
  enemy.wordBorn = state.elapsed;
  enemy.script = "hira";
}

export function spawnBoss(state, ctx) {
  const item = bossWordItem(state, ctx);
  const enemy = makeEnemy(state, item, "boss", tuningOf(state).speed);
  enemy.boss = true;
  enemy.shiftsLeft = 3;
  enemy.shiftIn = 7800;
  enemy.lane = 1;
  enemy.progress = 0.08;
  enemy.damage = 32;
  enemy.prompt = "vocab";
  state.enemies.push(enemy);
  state.events.push({ type: "spawn", enemy });
  return enemy;
}

function morphBoss(state, ctx, enemy, failed) {
  if (enemy.phrasing) return;
  if (failed && enemy.type) {
    const ms = Math.max(0, state.elapsed - enemy.wordBorn);
    const row = { id: enemy.id, type: enemy.type, correct: false, ms };
    pushResult(state, ctx, row);
    applyReview(state, ctx, enemy, false, ms);
    state.combo = 0;
    enemy.progress = Math.min(0.9, enemy.progress + 0.1);
  } else {
    enemy.progress = Math.max(0.08, enemy.progress - 0.06);
  }
  clearBuffer(state);
  if (enemy.shiftsLeft > 0) {
    enemy.shiftsLeft -= 1;
    const item = bossWordItem(state, ctx);
    if (item) applyBossWord(state, enemy, item);
    enemy.shiftIn = 7800;
    state.events.push({ type: "shift", enemy });
    return;
  }
  enemy.phrasing = true;
  enemy.bossPhrase = true;
  enemy.shiftIn = null;
  enemy.type = "vocab";
  enemy.id = BOSS_PHRASE.parts[0].id;
  enemy.report = false;
  enemy.accept = BOSS_PHRASE.accept;
  enemy.display = BOSS_PHRASE.display;
  enemy.meaning = BOSS_PHRASE.meaning;
  enemy.reading = BOSS_PHRASE.reading;
  enemy.len = [...BOSS_PHRASE.reading].length;
  enemy.toastJp = BOSS_PHRASE.display;
  enemy.prompt = "phrase";
  enemy.wordBorn = state.elapsed;
  enemy.speed *= 0.82;
  state.events.push({ type: "phrase", enemy });
}

function tryKill(state, ctx) {
  const enemy = locked(state);
  if (!enemy) return;
  if (!isComplete(enemy, state.kana, state.pending)) return;
  if (enemy.boss) {
    if (enemy.phrasing) {
      killEnemy(state, ctx, enemy);
      if (state.phase === "play") finishBoss(state);
      return;
    }
    const ms = Math.max(0, state.elapsed - enemy.wordBorn);
    state.combo += 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    const gain = Math.round(140 * (1 + Math.min(12, state.combo) * 0.18));
    state.score += gain;
    state.coolant = Math.min(100, state.coolant + 14);
    state.toast = toastOf(enemy, ms);
    state.shake = Math.max(state.shake, 5);
    state.events.push({ type: "kill", enemy, gain, ms });
    const row = { id: enemy.id, type: enemy.type, correct: true, ms };
    pushResult(state, ctx, row);
    applyReview(state, ctx, enemy, true, ms);
    state.kills += 1;
    clearBuffer(state);
    morphBoss(state, ctx, enemy, false);
    return;
  }
  killEnemy(state, ctx, enemy);
  state.kills += 1;
  if (state.mode === "endless") state.endlessKills += 1;
}

function finishBoss(state) {
  state.enemies = [];
  state.kills += 1;
  state.score += 2500;
  state.phase = "win";
  state.banner = { kicker: "SEC-07", title: "SUBJECT 09 CONTAINED", sub: "The core is quiet. For now.", until: 6000 };
  state.events.push({ type: "win" });
}

function beginClear(state) {
  state.phase = "clear";
  state.clearIn = 1500;
  const t = tuningOf(state);
  state.score += 400;
  state.banner = { kicker: t.code, title: "SECTOR CLEAR", sub: t.name, until: 1500 };
  state.events.push({ type: "clear", sector: state.sector });
  clearBuffer(state);
}

function advance(state) {
  if (state.mode === "endless") {
    state.phase = "play";
    return;
  }
  state.sector += 1;
  if (state.sector >= SECTORS.length) {
    state.phase = "win";
    state.events.push({ type: "win" });
    return;
  }
  state.kills = 0;
  state.spawnIn = 360;
  state.phase = "play";
  state.enemies = [];
  announceSector(state);
}

export function offerInput(state, ctx, raw) {
  if (state.phase === "clear") {
    state.clearIn = 0;
    advance(state);
  }
  if (state.phase !== "play") return { text: state.input, rejected: false };
  if (state.banner && (state.kana || raw)) state.banner.until = Math.min(state.banner.until, 400);
  if (!state.enemies.some((e) => !e.gone)) {
    clearBuffer(state);
    return { text: "", rejected: false };
  }
  const prev = state.input;
  if (raw === prev) return { text: prev, rejected: false };
  const deleting = [...String(raw)].length < [...prev].length;
  const conv = liveConvert(raw);
  if (!deleting && state.enemies.some((e) => !e.gone)) {
    const ok = state.enemies.some((e) => !e.gone && fitsEnemy(e, conv.kana, conv.pending));
    if (!ok) {
      state.misses += 1;
      state.combo = 0;
      state.coolant = Math.max(0, state.coolant - 7);
      state.shake = Math.max(state.shake, 2);
      state.events.push({ type: "mistype" });
      return { text: prev, rejected: true };
    }
  }
  if (!deleting && conv.text !== prev) state.hits += 1;
  state.input = conv.text;
  state.kana = conv.kana;
  state.pending = conv.pending;
  refreshLock(state);
  tryKill(state, ctx);
  refreshLock(state);
  return { text: state.input, rejected: false };
}

export function step(state, ctx, dt) {
  dt = Math.max(0, Math.min(48, dt));
  if (state.phase === "pause") return state;
  state.elapsed += dt;
  state.lamp += dt;
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt / 18);
  if (state.hurtFlash > 0) state.hurtFlash = Math.max(0, state.hurtFlash - dt / 360);
  if (state.banner) {
    state.banner.until -= dt;
    if (state.banner.until <= 0) state.banner = null;
  }
  if (state.toast) {
    state.toast.until -= dt;
    if (state.toast.until <= 0) state.toast = null;
  }
  state.fx = state.fx.filter((f) => {
    f.life -= dt;
    return f.life > 0;
  });
  if (state.phase === "clear") {
    state.clearIn -= dt;
    if (state.clearIn <= 0) advance(state);
    return state;
  }
  if (state.phase !== "play") return state;

  const tuning = tuningOf(state);
  let drain = 1.5;
  const nearest = state.enemies.reduce((m, e) => Math.max(m, e.progress), 0);
  if (nearest > 0.5) drain += (nearest - 0.5) * 9;
  state.coolant = Math.max(0, state.coolant - (drain * dt) / 1000);
  if (state.coolant <= 0) {
    state.heatAcc += dt;
    if (state.heatAcc >= 850) {
      state.heatAcc = 0;
      damage(state, 7);
      if (state.phase !== "play") return state;
    }
  } else state.heatAcc = 0;

  for (const e of state.enemies) {
    if (e.gone) continue;
    e.progress += (e.speed * dt) / 1000;
    if (e.boss && !e.phrasing && e.shiftIn != null) {
      e.shiftIn -= dt;
      if (e.shiftIn <= 0) morphBoss(state, ctx, e, true);
    }
    if (e.progress >= 1) {
      e.progress = 1;
      resolveReach(state, ctx, e);
      if (state.phase !== "play") return state;
    }
  }
  state.enemies = state.enemies.filter((e) => !e.gone);

  if (!tuning.boss) {
    const quota = Number.isFinite(tuning.kills) ? state.kills < tuning.kills : true;
    state.spawnIn -= dt;
    if (quota && state.spawnIn <= 0 && state.enemies.length < tuning.max) {
      spawnEnemy(state, ctx, tuning);
      state.spawnIn = tuning.spawn * (0.82 + state.rng() * 0.36);
    }
    if (Number.isFinite(tuning.kills) && state.kills >= tuning.kills && state.enemies.length === 0) {
      beginClear(state);
    }
  } else if (!state.enemies.length && state.phase === "play") {
    spawnBoss(state, ctx);
  }
  refreshLock(state);
  return state;
}

export function togglePause(state) {
  if (state.phase === "pause") {
    state.phase = "play";
    state.events.push({ type: "resume" });
    return;
  }
  if (state.phase === "play" || state.phase === "clear") {
    state.phase = "pause";
    state.events.push({ type: "pause" });
  }
}

export function retrySector(state) {
  state.phase = "play";
  state.hp = 100;
  state.coolant = 100;
  state.enemies = [];
  state.kills = 0;
  state.combo = 0;
  state.heatAcc = 0;
  state.spawnIn = 280;
  state.toast = null;
  clearBuffer(state);
  announceSector(state);
}

export function accuracyOf(state) {
  const n = state.hits + state.misses;
  if (!n) return 1;
  return state.hits / n;
}

export { SECTORS, BOSS_PHRASE };
