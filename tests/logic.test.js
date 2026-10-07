import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildCatalog, BOSS_PHRASE } from "../js/content.js";
import {
  accuracyOf,
  createRun,
  fitsEnemy,
  offerInput,
  step,
  tuningOf,
} from "../js/game.js";
import {
  approachSeconds,
  HEAT_IDLE_PER_S,
  readingSlowdown,
  shiftWindow,
} from "../js/pace.js";
import { loadSave, writeSave } from "../js/storage.js";
import {
  expandReading,
  foldLong,
  liveConvert,
  romajiToHiragana,
  sameReading,
} from "../js/romaji.js";
import {
  EXPORT_SOURCE,
  MS_MAX,
  RESULTS_MAX,
  buildResultsExport,
  commonWeight,
  emptyCard,
  emptySave,
  gradeFromAnswer,
  parseStudyList,
  pickWeighted,
  prepareExport,
  reviewCard,
  spawnWeight,
  splitPending,
  vocabPool,
  WEAK_MULT,
} from "../js/srs.js";

const vocab = JSON.parse(readFileSync(new URL("../data/n5-vocab.json", import.meta.url), "utf8"));
const kanji = JSON.parse(readFileSync(new URL("../data/kanji.json", import.meta.url), "utf8"));
const catalog = buildCatalog(vocab, kanji);

test("N5 vocab ids match JLPT Vocab Quest indexes", () => {
  assert.equal(vocab.length, 718);
  assert.equal(vocab[0].id, 0);
  assert.equal(vocab[0].jp, "ああ");
  assert.equal(vocab[250].jp, "コーヒー");
  assert.equal(vocab[250].kana, "コーヒー");
  assert.equal(vocab[717].id, 717);
  for (let i = 0; i < vocab.length; i++) assert.equal(vocab[i].id, i);
  assert.ok(vocab.find((w) => w.jp === "私").rank < vocab.find((w) => w.jp.includes("ワイシャツ")).rank);
});

test("romaji IME: ka, n/nn, small tsu, aliases, long vowels", () => {
  assert.equal(liveConvert("ka").text, "か");
  assert.equal(liveConvert("k").pending, "k");
  assert.equal(liveConvert("shi").kana, "し");
  assert.equal(liveConvert("si").kana, "し");
  assert.equal(liveConvert("chi").kana, "ち");
  assert.equal(liveConvert("ti").kana, "ち");
  assert.equal(liveConvert("tsu").kana, "つ");
  assert.equal(liveConvert("tu").kana, "つ");
  assert.equal(liveConvert("fu").kana, "ふ");
  assert.equal(liveConvert("kya").kana, "きゃ");
  assert.equal(liveConvert("kk").kana, "っ");
  assert.equal(liveConvert("kk").pending, "k");
  assert.equal(liveConvert("kka").text, "っか");
  assert.equal(liveConvert("n").pending, "n");
  assert.equal(liveConvert("n").kana, "");
  assert.equal(liveConvert("na").text, "な");
  assert.equal(liveConvert("nn").text, "ん");
  assert.equal(liveConvert("nna").text, "んな");
  assert.equal(liveConvert("n'a").text, "んあ");
  assert.equal(romajiToHiragana("konnichiwa"), "こんにちわ");
  assert.equal(liveConvert("matcha").text, "まっちゃ");
  assert.equal(liveConvert("gakkou").text, "がっこう");
  assert.equal(sameReading("コーヒー", "koohii" && romajiToHiragana("koohii")), true);
  assert.equal(sameReading("こーひー", "こおひい"), true);
  assert.equal(sameReading("を", "お"), true);
  assert.deepEqual(expandReading("けっこん (する)"), ["けっこん", "けっこんする"]);
  assert.deepEqual(expandReading("(〜を) とお"), ["とお"]);
  assert.equal(foldLong(romajiToHiragana("koohii")), foldLong("コーヒー"));
});

test("direct kana passes through and katakana folds", () => {
  assert.equal(liveConvert("か").text, "か");
  assert.equal(liveConvert("カ").text, "か");
  assert.equal(romajiToHiragana("wo"), "を");
});

test("study list keeps every known id and only a moderate weak boost", () => {
  const parsed = parseStudyList({
    app: "jlpt-vocab-quest",
    v: 1,
    date: "2026-10-07T12:00:00.000Z",
    note: "ignored",
    known: [0, 1, 12, 48, 250, 800, -1, 1.5, "12"],
    weak: [12, 48, 3, 900],
  });
  assert.deepEqual(parsed.known, [0, 1, 12, 48, 250]);
  assert.deepEqual(parsed.weak, [12, 48]);
  assert.throws(() => parseStudyList({ app: "other", v: 1, known: [], weak: [] }));

  const known = Array.from({ length: 100 }, (_, i) => i);
  const study = { known, weak: [0, 1, 2, 3, 4] };
  const pool = vocabPool(vocab, study);
  assert.equal(pool.length, 100);
  assert.ok(pool.some((w) => w.id === 99));
  assert.equal(WEAK_MULT, 1.6);
  let weakHits = 0;
  const rng = () => Math.random();
  for (let i = 0; i < 4000; i++) {
    const pick = pickWeighted(pool, (w) => spawnWeight(w, null, study, 0, "flat"), rng);
    if (study.weak.includes(pick.id)) weakHits += 1;
  }
  const frac = weakHits / 4000;
  assert.ok(frac > 0.04 && frac < 0.16, `weak fraction ${frac}`);
  const alone = spawnWeight({ type: "vocab", id: 0, rank: 0 }, null, study, 0);
  const plain = spawnWeight({ type: "vocab", id: 50, rank: 50 }, null, study, 0);
  assert.ok(alone / plain <= WEAK_MULT + 0.01);
  assert.ok(alone <= 3.2);
});

test("without a study list the full N5 list is weighted gently toward common words", () => {
  assert.equal(vocabPool(vocab, null).length, 718);
  assert.equal(vocabPool(vocab, { known: [], weak: [] }).length, 718);
  const common = commonWeight(0, 718);
  const rare = commonWeight(717, 718);
  assert.ok(common > rare);
  assert.ok(rare > 0);
  assert.ok(common / rare < 3);
  const early = catalog.vocab.find((w) => w.jp === "私");
  const late = catalog.vocab.find((w) => w.jp.includes("ワイシャツ"));
  assert.ok(spawnWeight(early, null, null, 0) > spawnWeight(late, null, null, 0));
});

test("results export matches the study-app file", () => {
  assert.equal(EXPORT_SOURCE, "kana-terror");
  const rows = [
    { id: 250, type: "vocab", correct: true, ms: 1800.4 },
    { id: "あ", type: "kana", correct: false, ms: -5 },
    { id: "火", type: "kanji", correct: true, ms: 99999999 },
    { id: "too-long!", type: "kana", correct: true, ms: 10 },
    { id: "12", type: "vocab", correct: true, ms: 10 },
  ];
  const file = buildResultsExport(rows, new Date("2026-10-07T12:00:00.000Z"));
  assert.equal(file.source, "kana-terror");
  assert.equal(file.date, "2026-10-07T12:00:00.000Z");
  assert.equal(file.results.length, 3);
  assert.deepEqual(file.results[0], { id: 250, type: "vocab", correct: true, ms: 1800 });
  assert.deepEqual(file.results[1], { id: "あ", type: "kana", correct: false, ms: 0 });
  assert.equal(file.results[2].ms, MS_MAX);
  assert.equal(prepareExport({ results: [], lastExportDate: null }), null);
  const many = Array.from({ length: RESULTS_MAX + 10 }, (_, i) => ({ id: i % 718, type: "vocab", correct: true, ms: i }));
  const split = splitPending(many);
  assert.equal(split.batch.length, RESULTS_MAX);
  assert.equal(split.rest.length, 10);
  const plan = prepareExport({ results: many, lastExportDate: "2026-10-07T12:00:00.000Z" }, new Date("2026-10-07T12:00:00.000Z"));
  assert.equal(plan.payload.results.length, RESULTS_MAX);
  assert.ok(plan.payload.date > "2026-10-07T12:00:00.000Z");
  assert.equal(plan.rest.length, 10);
});

test("SM-2 brings a miss back quickly", () => {
  const now = Date.UTC(2026, 9, 7);
  const missed = reviewCard(emptyCard("kana", "あ"), "wrong", now);
  assert.equal(missed.due, now + 20000);
  assert.ok(missed.ease < 2.5);
  const passed = reviewCard(emptyCard("vocab", 250), "perfect", now);
  assert.equal(passed.intervalDays, 1);
  const second = reviewCard(passed, "perfect", passed.due);
  assert.equal(second.intervalDays, 6);
  assert.equal(gradeFromAnswer(false, 10, 2), "wrong");
  assert.equal(gradeFromAnswer(true, 1000, 2), "perfect");
});

test("typing ka kills a matching creature and a mistype does not stick", () => {
  const state = createRun("campaign", 3);
  const enemy = {
    uid: 1,
    lane: 1,
    progress: 0.4,
    speed: 0.01,
    born: 0,
    wordBorn: 0,
    gone: false,
    variant: "crawler",
    type: "kana",
    id: "か",
    accept: ["か"],
    display: "か",
    meaning: "hiragana ka",
    reading: "か",
    len: 1,
    script: "hira",
    damage: 10,
    prompt: "reading",
  };
  state.enemies = [enemy];
  state.uid = 2;
  const cards = {};
  const gameCtx = { catalog, cards, study: null, now: () => 1_000_000, onResult() {} };
  let res = offerInput(state, gameCtx, "k");
  assert.equal(res.rejected, false);
  assert.equal(res.text, "k");
  assert.equal(enemy.gone, false);
  res = offerInput(state, gameCtx, "x");
  assert.equal(res.rejected, true);
  assert.equal(res.text, "k");
  res = offerInput(state, gameCtx, "ka");
  assert.equal(res.text, "");
  assert.equal(enemy.gone, true);
  assert.equal(state.score > 0, true);
  assert.equal(cards["kana:か"].correct, 1);
  assert.equal(state.runResults[0].type, "kana");
  assert.equal(state.runResults[0].id, "か");
  assert.equal(state.runResults[0].correct, true);
});

test("imported vocab spawns stay inside known, including words that are not weak", () => {
  const state = createRun("campaign", 9);
  state.sector = 3;
  state.kills = 0;
  const study = { known: [250, 48, 20], weak: [250] };
  const gameCtx = { catalog, cards: {}, study, now: () => Date.now(), onResult() {} };
  const ids = new Set();
  for (let i = 0; i < 80; i++) step(state, gameCtx, 40);
  for (let n = 0; n < 30; n++) {
    state.spawnIn = 0;
    state.kills = 0;
    step(state, gameCtx, 40);
    for (const e of state.enemies) {
      if (e.type === "vocab") ids.add(e.id);
      if (e.type === "vocab") assert.ok(study.known.includes(e.id), String(e.id));
    }
    state.enemies = [];
  }
  assert.ok(ids.has(250));
  assert.ok([...ids].some((id) => id !== 250));
});

test("a typed campaign can clear every sector and the boss", () => {
  const state = createRun("campaign", 11);
  const gameCtx = { catalog, cards: {}, study: null, now: () => Date.now() + state.elapsed, onResult() {} };
  let guard = 0;
  while (state.phase !== "win" && state.phase !== "dead" && guard < 50000) {
    guard += 1;
    if (state.phase === "play") {
      const e = state.enemies.filter((x) => !x.gone).sort((a, b) => b.progress - a.progress)[0];
      if (e) {
        const target = foldLong(e.accept[0]).replaceAll("を", "お");
        const got = foldLong(state.kana).replaceAll("を", "お");
        const next = target.startsWith(got) ? [...target][[...got].length] : "";
        if (next) offerInput(state, gameCtx, `${foldLong(state.kana).replaceAll("を", "お")}${next}`);
      }
    }
    step(state, gameCtx, 40);
  }
  assert.equal(state.phase, "win", `phase ${state.phase} sector ${state.sector} hp ${state.hp} kills ${state.kills}`);
  assert.ok(state.score > 1000);
  assert.equal(BOSS_PHRASE.parts.length, 4);
  assert.ok(state.runResults.some((r) => r.type === "vocab" && r.id === 713 && r.correct));
  assert.ok(accuracyOf(state) > 0.9);
});

test("relaxed is the default pace and intense keeps the original numbers", () => {
  const relaxed = createRun("campaign", 1);
  assert.equal(relaxed.pace, "relaxed");
  assert.equal(relaxed.spawnIn, 2000);
  const dockR = tuningOf(relaxed);
  assert.equal(dockR.max, 2);
  assert.equal(dockR.speed, 0.135 * 0.55);
  assert.equal(dockR.spawn, 1450 * 1.8);
  assert.ok(Math.abs(approachSeconds(dockR.speed) - 0.96 / (0.135 * 0.55)) < 1e-9);

  const intense = createRun("campaign", 1, "intense");
  assert.equal(intense.spawnIn, 220);
  const dockI = tuningOf(intense);
  assert.equal(dockI.speed, 0.135);
  assert.equal(dockI.spawn, 1450);
  assert.equal(dockI.max, 4);
  intense.sector = 1;
  assert.equal(tuningOf(intense).speed, 0.15);
  assert.equal(tuningOf(intense).max, 4);
  intense.sector = 5;
  assert.equal(tuningOf(intense).max, 5);

  relaxed.sector = 1;
  const ventsSlow = 1 - tuningOf(relaxed).speed / 0.15;
  assert.ok(ventsSlow >= 0.4 && ventsSlow <= 0.5, String(ventsSlow));
  relaxed.sector = 5;
  assert.equal(tuningOf(relaxed).max, 3);
  relaxed.sector = 6;
  assert.equal(tuningOf(relaxed).max, 1);
  assert.equal(tuningOf(relaxed).speed, 0.052 * 0.55);

  const wardSpeed = 0.12 * 0.55;
  const short = readingSlowdown(wardSpeed, 1, "relaxed", true);
  const four = readingSlowdown(wardSpeed, 4, "relaxed", true);
  assert.equal(short, wardSpeed);
  assert.ok(Math.abs(approachSeconds(four) - (approachSeconds(short) + 3 * 1.7)) < 1e-9);
  const fourIntense = readingSlowdown(0.12, 4, "intense", true);
  assert.ok(Math.abs(approachSeconds(fourIntense) - (0.96 / 0.12 + 3 * 0.55)) < 1e-9);
  assert.equal(shiftWindow(2, "intense"), 7800);
  assert.equal(shiftWindow(6, "relaxed"), 14000 + 4 * 1700);

  const endless = createRun("endless", 1, "intense");
  assert.equal(tuningOf(endless).speed, 0.12);
  assert.equal(tuningOf(endless).spawn, 1500);
  assert.equal(tuningOf(endless).max, 3);
  endless.endlessKills = 40;
  assert.equal(tuningOf(endless).speed, 0.24);
  assert.equal(tuningOf(endless).max, 6);
  const easy = createRun("endless", 1, "relaxed");
  assert.equal(tuningOf(easy).max, 2);
  assert.equal(tuningOf(easy).speed, 0.12 * 0.55);
  assert.equal(tuningOf(easy).spawn, 1500 * 1.8);
});

test("relaxed heat builds at 55% of the original rate", () => {
  function dropped(pace) {
    const state = createRun("campaign", 1, pace);
    state.spawnIn = 1e9;
    const gameCtx = { catalog, cards: {}, study: null, now: () => 0, onResult() {} };
    for (let i = 0; i < 100; i++) step(state, gameCtx, 48);
    return 100 - state.coolant;
  }
  const slow = dropped("relaxed");
  const fast = dropped("intense");
  assert.ok(Math.abs(fast - HEAT_IDLE_PER_S * 4.8) < 1e-6);
  assert.ok(Math.abs(slow - fast * 0.55) < 1e-6);
});

test("pace is saved locally and stays out of the results file", () => {
  const mem = {
    data: new Map(),
    getItem(k) { return this.data.has(k) ? this.data.get(k) : null; },
    setItem(k, v) { this.data.set(k, String(v)); },
  };
  writeSave({ ...emptySave(), pace: "intense" }, mem);
  assert.equal(loadSave(mem).pace, "intense");
  writeSave({ ...emptySave(), pace: "turbo" }, mem);
  assert.equal(loadSave(mem).pace, "relaxed");
  const queued = { ...emptySave(), pace: "intense", results: [{ id: "あ", type: "kana", correct: true, ms: 400 }] };
  const plan = prepareExport(queued, new Date("2026-10-08T00:00:00.000Z"));
  assert.equal(plan.payload.source, EXPORT_SOURCE);
  assert.equal(Object.hasOwn(plan.payload, "pace"), false);
  assert.deepEqual(Object.keys(plan.payload), ["source", "date", "results"]);
});

test("kanji ids are the characters", () => {
  assert.equal(kanji.length >= 70, true);
  assert.equal(catalog.kanji[0].type, "kanji");
  assert.equal(typeof catalog.kanji[0].id, "string");
  assert.ok(catalog.kanji[0].id.length <= 8);
  assert.ok(catalog.kanji.every((k) => k.accept.length > 0));
});

test("a creature that arrives records a miss", () => {
  const state = createRun("campaign", 2);
  state.enemies = [{
    uid: 4,
    lane: 0,
    progress: 0.97,
    speed: 1,
    born: 0,
    wordBorn: 0,
    gone: false,
    variant: "host",
    type: "vocab",
    id: 250,
    accept: ["こーひー"],
    display: "コーヒー",
    meaning: "coffee",
    reading: "こーひー",
    len: 4,
    script: "hira",
    damage: 40,
    prompt: "vocab",
  }];
  const gameCtx = { catalog, cards: {}, study: null, now: () => 5000, onResult() {} };
  step(state, gameCtx, 40);
  assert.equal(state.runResults.at(-1).correct, false);
  assert.equal(state.runResults.at(-1).id, 250);
  assert.ok(fitsEnemy(state.enemies[0] || { accept: ["こーひー"] }, "", "k") || state.hp < 100);
});
