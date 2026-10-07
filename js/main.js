import { accuracyOf, createRun, offerInput, retrySector, setRunPace, step, togglePause, tuningOf } from "./game.js";
import { PACES } from "./pace.js";
import { drawTitle, drawWorld, layoutEnemy } from "./render.js";
import { buildCatalog } from "./content.js";
import { resumeAudio, setMuted, sfxClear, sfxHurt, sfxKill, sfxMiss, sfxShift, tracker } from "./audio.js";
import { loadSave, rememberResult, SAVE_KEY, writeSave } from "./storage.js";
import {
  commitExported,
  normalizeResults,
  parseStudyList,
  prepareExport,
} from "./srs.js";
import { hiraToKata } from "./romaji.js";

const app = document.querySelector("#app");
const canvas = document.querySelector("#view");
const dock = document.querySelector("#dock");
const typeEl = document.querySelector("#type");
const mirror = document.querySelector("#mirror");
const plates = document.querySelector("#plates");
const banner = document.querySelector("#banner");
const flash = document.querySelector("#flash");
const fileEl = document.querySelector("#import-file");

let catalog = null;
let save = loadSave();
let state = null;
let ctx = null;
let mode = "menu";
let last = 0;
let composing = false;
let raf = 0;
let audioOn = false;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function sinceLabel(n) {
  const count = Math.max(0, Number(n) || 0);
  return `${count} ${count === 1 ? "result" : "results"} since last export`;
}

function refreshMeta() {
  save = loadSave();
  const n = normalizeResults(save.results).length;
  const line = sinceLabel(n);
  document.querySelector("#export-count").textContent = line;
  const cardEx = document.querySelector("#card-export");
  if (cardEx) cardEx.textContent = line;
  const study = save.study;
  const pool = study ? `${study.known.length} known · ${study.weak.length} weak` : "full N5 list, common words a little more often";
  document.querySelector("#menu-meta").textContent = `Best ${save.best || 0} · clears ${save.clears || 0} · endless ${save.endlessBest || 0} · ${pool}`;
  const weakN = study ? study.weak.length : 0;
  const weakLine = !study
    ? "No study list yet. Vocab hosts use the full N5 list, tilted gently toward common words."
    : weakN === 0
      ? `Vocab hosts are drawn from all ${study.known.length} known words.`
      : `Vocab hosts are drawn from all ${study.known.length} known words. ${weakN} weak ${weakN === 1 ? "word is" : "words are"} only a little more likely.`;
  document.querySelector("#study-status").textContent = weakLine;
  const pace = PACES[save.pace] || PACES.relaxed;
  document.querySelectorAll("[data-pace]").forEach((btn) => {
    const on = btn.dataset.pace === pace.id;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const note = document.querySelector("#pace-note");
  if (note) note.textContent = paceNote(pace.id);
  document.querySelector("#mute").textContent = save.muted ? "MUTE" : "SND";
  document.querySelector("#mute").setAttribute("aria-pressed", save.muted ? "true" : "false");
  setMuted(save.muted);
}

function paceNote(id) {
  if (id === "intense") return "Intense is the original pace: faster crawlers, more of them, quicker heat.";
  if (id === "normal") return "Normal sits between Relaxed and the original pace.";
  return "Relaxed: crawlers are about 45% slower, two on screen, longer gaps, slower heat. Longer words get more time.";
}

function choosePace(id) {
  persistPatch({ pace: id });
  if (state) setRunPace(state, id);
}

function setMode(next) {
  mode = next;
  app.dataset.mode = next === "play" ? "play" : next;
  dock.hidden = next !== "play";
  if (next === "study") {
    document.querySelector("#study").hidden = false;
    document.querySelector("#card").hidden = true;
    document.querySelector("#menu").hidden = true;
  } else if (next === "card") {
    document.querySelector("#card").hidden = false;
    document.querySelector("#study").hidden = true;
    document.querySelector("#menu").hidden = true;
  } else if (next === "menu") {
    document.querySelector("#menu").hidden = false;
    document.querySelector("#study").hidden = true;
    document.querySelector("#card").hidden = true;
  } else {
    document.querySelector("#menu").hidden = true;
    document.querySelector("#study").hidden = true;
    document.querySelector("#card").hidden = next !== "card";
  }
}

function ensureAudio() {
  if (audioOn) return;
  audioOn = true;
  setMuted(save.muted);
  resumeAudio().catch(() => {});
}

function speak(text) {
  if (!save.speech || !text || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 0.95;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

function downloadJson(name, data) {
  try {
    const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
  } catch {
    return false;
  }
}

function doExport() {
  const current = loadSave();
  const plan = prepareExport(current);
  if (!plan) {
    setFlash("No results since the last export.");
    return;
  }
  const day = plan.payload.date.slice(0, 10);
  const ok = downloadJson(`kana-terror-results-${day}.json`, plan.payload);
  if (!ok) {
    setFlash("The download didn't start, so those results are still saved.");
    return;
  }
  const fresh = loadSave();
  fresh.results = commitExported(fresh.results, plan.payload.results);
  fresh.lastExportDate = plan.payload.date;
  if (ctx) fresh.cards = ctx.cards;
  writeSave(fresh);
  save = fresh;
  refreshMeta();
  const left = normalizeResults(fresh.results).length;
  setFlash(left
    ? `Downloaded ${plan.payload.results.length}. ${sinceLabel(left)} still saved.`
    : `Downloaded ${plan.payload.results.length}.`);
}

function setFlash(text) {
  if (state) {
    state.toast = { jp: text, reading: "", en: "", until: 2200, ms: 0 };
  }
  flash.textContent = text;
}

function persistPatch(patch) {
  const current = loadSave();
  Object.assign(current, patch);
  if (ctx) current.cards = ctx.cards;
  writeSave(current);
  save = current;
  refreshMeta();
}

function onResult(row) {
  const patch = {};
  if (state) patch.best = Math.max(save.best || 0, state.score);
  rememberResult(row, { ...patch, cards: ctx ? ctx.cards : save.cards });
  save = loadSave();
  refreshMeta();
}

function start(kind) {
  ensureAudio();
  save = loadSave();
  state = createRun(kind, (Date.now() ^ (Math.random() * 1e9)) >>> 0, save.pace);
  ctx = {
    catalog,
    cards: save.cards || {},
    study: save.study,
    now: () => Date.now(),
    onResult,
  };
  persistPatch({ runs: (save.runs || 0) + 1, cards: ctx.cards });
  setMode("play");
  typeEl.value = "";
  mirror.textContent = "";
  last = performance.now();
  typeEl.focus();
}

function showCard(kicker, title, body, buttons) {
  document.querySelector("#card-kicker").textContent = kicker;
  document.querySelector("#card-title").textContent = title;
  document.querySelector("#card-body").textContent = body;
  const actions = document.querySelector("#card-actions");
  actions.innerHTML = "";
  for (const b of buttons) {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = b.label;
    if (b.primary) el.className = "primary";
    else if (b.ghost) el.className = "ghost";
    el.addEventListener("click", b.on);
    actions.appendChild(el);
  }
  refreshMeta();
  setMode("card");
}

function endRun() {
  if (!state) return;
  const acc = Math.round(accuracyOf(state) * 100);
  if (state.mode === "endless") {
    persistPatch({ endlessBest: Math.max(save.endlessBest || 0, state.score), best: Math.max(save.best || 0, state.score) });
  } else if (state.phase === "win") {
    persistPatch({ clears: (save.clears || 0) + 1, best: Math.max(save.best || 0, state.score) });
  } else {
    persistPatch({ best: Math.max(save.best || 0, state.score) });
  }
  const won = state.phase === "win";
  const kind = state.mode;
  const title = won ? "Contained" : "Flatline";
  const body = won
    ? `Subject 09 is down. Score ${state.score}. Accuracy ${acc}%. Best combo x${state.bestCombo}.`
    : `The lamp goes out in ${tuningOf(state).name}. Score ${state.score}. Accuracy ${acc}%.`;
  showCard(won ? "CORE QUIET" : "SIGNAL LOST", title, body, [
    { label: won ? "Run the station again" : "Retry sector", primary: true, on: () => {
      if (!won && state) {
        retrySector(state);
        setMode("play");
        typeEl.focus();
      } else start(kind);
    } },
    { label: "Export results", on: doExport },
    { label: "Back to the airlock", ghost: true, on: () => { state = null; setMode("menu"); } },
  ]);
}

function openPause() {
  if (!state || (state.phase !== "play" && state.phase !== "clear" && state.phase !== "pause")) return;
  if (state.phase !== "pause") togglePause(state);
  showCard("HOLD", "Paused", "The vents are still moving.", [
    ...["relaxed", "normal", "intense"].map((id) => ({
      label: save.pace === id ? `${PACES[id].label} · on` : PACES[id].label,
      primary: save.pace === id,
      on: () => { choosePace(id); openPause(); },
    })),
    { label: save.speech ? "Speech on" : "Speech off", on: () => { save.speech = !save.speech; persistPatch({ speech: save.speech }); openPause(); } },
    { label: "Resume", primary: true, on: () => { if (state?.phase === "pause") togglePause(state); setMode("play"); typeEl.focus(); } },
    { label: "Export results", on: doExport },
    { label: "Abort run", ghost: true, on: () => { state = null; setMode("menu"); } },
  ]);
  setMode("pause");
  app.dataset.mode = "pause";
  document.querySelector("#card").hidden = false;
}

function syncHud() {
  const t = tuningOf(state);
  document.querySelector("#sec-code").textContent = t.code;
  document.querySelector("#sec-name").textContent = t.name.toUpperCase();
  document.querySelector("#hp-num").textContent = String(Math.ceil(state.hp));
  document.querySelector("#hp-bar").style.setProperty("--p", `${state.hp}%`);
  const heat = Math.round(100 - state.coolant);
  document.querySelector("#heat-num").textContent = String(heat);
  document.querySelector("#heat-bar").style.setProperty("--p", `${heat}%`);
  document.querySelector("#score").textContent = String(state.score);
  document.querySelector("#combo").textContent = `x${state.combo}`;
  document.querySelector("#acc").textContent = `${Math.round(accuracyOf(state) * 100)}%`;
  app.classList.toggle("low", state.hp < 35 || state.coolant < 20);
  const trackerEl = document.querySelector("#tracker");
  const dots = state.enemies.slice(0, 6);
  trackerEl.innerHTML = dots.map((e) => `<b class="${e.progress > 0.72 ? "hot" : e.progress > 0.35 ? "on" : ""}"></b>`).join("")
    || "<b></b><b></b><b></b>";
}

function syncPlates(w, h) {
  const seen = new Set();
  for (const e of state.enemies) {
    seen.add(String(e.uid));
    let node = plates.querySelector(`[data-uid="${e.uid}"]`);
    if (!node) {
      node = document.createElement("div");
      node.className = "plate";
      node.dataset.uid = String(e.uid);
      plates.appendChild(node);
    }
    const box = layoutEnemy(e, w, h);
    node.style.transform = `translate(${box.x}px, ${box.y}px) translate(-50%, -115%) scale(${(0.72 + box.p * 0.5).toFixed(3)})`;
    node.classList.toggle("lock", state.lock === e.uid);
    node.classList.toggle("near", e.progress > 0.78);
    node.classList.toggle("phrase", e.prompt === "phrase");
    const tag = e.boss ? "SUBJECT 09" : e.variant === "runner" ? "RUNNER" : e.variant === "armored" ? "ARMOR" : e.variant === "mimic" ? "MIMIC" : "";
    let word = esc(e.display);
    if ((e.prompt === "reading" || e.type === "kana") && state.lock === e.uid && state.kana) {
      const typed = e.script === "kata" ? hiraToKata(state.kana) : state.kana;
      const rest = [...e.display].slice([...typed].length).join("");
      word = `<span>${esc(typed)}</span>${esc(rest)}`;
    }
    const shift = e.boss && e.shiftIn != null ? `<div class="shift"><span style="width:${Math.max(0, Math.min(100, (e.shiftIn / 7800) * 100))}%"></span></div>` : "";
    node.innerHTML = `${tag ? `<div class="tag">${tag}</div>` : ""}<div class="word">${word}</div>${shift}`;
  }
  for (const node of [...plates.children]) {
    if (!seen.has(node.dataset.uid)) node.remove();
  }
}

function syncBanner() {
  if (!state?.banner) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  banner.innerHTML = `<em>${esc(state.banner.kicker || "")}</em><strong>${esc(state.banner.title || "")}</strong><span>${esc(state.banner.sub || "")}</span>`;
}

function syncFlash() {
  const t = state?.toast;
  if (t && t.jp) {
    const reading = t.reading ? ` · ${t.reading}` : "";
    const en = t.en ? ` — ${t.en}` : "";
    flash.innerHTML = `<b>${esc(t.jp)}</b>${esc(reading)}<i>${esc(en)}</i>`;
    return;
  }
  const boss = state?.enemies?.find((e) => e.uid === state.lock && e.prompt === "phrase" && e.progress > 0.4);
  flash.innerHTML = boss ? `<i>${esc(boss.reading)}</i>` : "";
}

function drainEvents() {
  const events = state.events.splice(0, state.events.length);
  for (const ev of events) {
    if (ev.type === "kill") {
      sfxKill();
      speak(ev.enemy.reading || ev.enemy.display);
    } else if (ev.type === "hurt") sfxHurt();
    else if (ev.type === "mistype") sfxMiss();
    else if (ev.type === "shift" || ev.type === "phrase") sfxShift();
    else if (ev.type === "clear") sfxClear();
    else if (ev.type === "win") sfxClear();
  }
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!state || mode === "menu" || mode === "study") {
    drawTitle(g, w, h, now);
    return;
  }
  const dt = Math.min(48, now - last || 16);
  last = now;
  if (mode === "play") step(state, ctx, dt);
  drawWorld(g, state, w, h, now);
  if (state.shake > 2) app.classList.add("shake");
  else app.classList.remove("shake");
  syncHud();
  syncPlates(w, h);
  syncBanner();
  syncFlash();
  const near = state.enemies.reduce((m, e) => Math.max(m, e.progress), 0);
  if (mode === "play") tracker(near, now);
  drainEvents();
  if (mode === "play" && (state.phase === "dead" || state.phase === "win")) endRun();
}

function onType() {
  if (composing || !state || mode !== "play") return;
  const res = offerInput(state, ctx, typeEl.value);
  if (typeEl.value !== res.text) {
    typeEl.value = res.text;
    const end = res.text.length;
    typeEl.setSelectionRange(end, end);
  }
  mirror.textContent = res.text;
}

function bindViewport() {
  const apply = () => {
    const vv = window.visualViewport;
    const h = vv ? vv.height : window.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    document.documentElement.style.setProperty("--app-h", `${h}px`);
    document.documentElement.style.setProperty("--app-top", `${top}px`);
    app.classList.toggle("kb", window.innerHeight - h > 80);
  };
  apply();
  window.visualViewport?.addEventListener("resize", apply);
  window.visualViewport?.addEventListener("scroll", apply);
  window.addEventListener("resize", apply);
}

function bind() {
  document.querySelectorAll("[data-pace]").forEach((btn) => {
    btn.addEventListener("click", () => choosePace(btn.dataset.pace));
  });
  document.querySelector("#start").addEventListener("click", () => start("campaign"));
  document.querySelector("#endless").addEventListener("click", () => start("endless"));
  document.querySelector("#study-open").addEventListener("click", () => { refreshMeta(); setMode("study"); });
  document.querySelector("#study-close").addEventListener("click", () => setMode("menu"));
  document.querySelector("#pause").addEventListener("click", () => openPause());
  document.querySelector("#mute").addEventListener("click", () => {
    ensureAudio();
    persistPatch({ muted: !save.muted });
  });
  document.querySelector("#export-btn").addEventListener("click", doExport);
  document.querySelector("#import-btn").addEventListener("click", () => fileEl.click());
  document.querySelector("#clear-study").addEventListener("click", () => {
    persistPatch({ study: null });
    if (ctx) ctx.study = null;
    setFlash("Vocab hosts will use the full N5 list.");
  });
  fileEl.addEventListener("change", async () => {
    const file = fileEl.files && fileEl.files[0];
    fileEl.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const list = parseStudyList(data);
      persistPatch({ study: list });
      if (ctx) ctx.study = list;
      setFlash(`Study list: ${list.known.length} known, ${list.weak.length} weak.`);
    } catch (err) {
      setFlash(err.message || "Could not import that study list.");
    }
  });
  dock.addEventListener("submit", (e) => e.preventDefault());
  typeEl.addEventListener("compositionstart", () => { composing = true; });
  typeEl.addEventListener("compositionend", () => { composing = false; onType(); });
  typeEl.addEventListener("input", () => { if (!composing) onType(); });
  document.querySelector("#stage").addEventListener("pointerdown", () => {
    if (mode === "play") typeEl.focus();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (mode === "play") openPause();
      else if (mode === "pause" && state?.phase === "pause") {
        togglePause(state);
        setMode("play");
        typeEl.focus();
      }
      return;
    }
    if (mode !== "play" || !state) return;
    if (e.target === typeEl || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Backspace") {
      typeEl.value = [...typeEl.value].slice(0, -1).join("");
      onType();
      e.preventDefault();
    } else if (e.key.length === 1) {
      typeEl.value += e.key;
      onType();
      e.preventDefault();
      typeEl.focus();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state && mode === "play") openPause();
  });
  window.addEventListener("storage", (e) => {
    if (e.key === SAVE_KEY) refreshMeta();
  });
}

async function boot() {
  bindViewport();
  bind();
  refreshMeta();
  const [vocab, kanji] = await Promise.all([
    fetch("./data/n5-vocab.json").then((r) => r.json()),
    fetch("./data/kanji.json").then((r) => r.json()),
  ]);
  catalog = buildCatalog(vocab, kanji);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  raf = requestAnimationFrame(frame);
}

boot().catch((err) => {
  document.querySelector("#menu-meta").textContent = `Failed to load the word list (${err.message}).`;
});
