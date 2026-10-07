/** Romaji IME and kana matching. Hiragana is the internal form. */

const SYLLABLES = [
  ["kya", "きゃ"], ["kyu", "きゅ"], ["kyo", "きょ"],
  ["gya", "ぎゃ"], ["gyu", "ぎゅ"], ["gyo", "ぎょ"],
  ["sha", "しゃ"], ["shu", "しゅ"], ["sho", "しょ"],
  ["sya", "しゃ"], ["syu", "しゅ"], ["syo", "しょ"],
  ["cha", "ちゃ"], ["chu", "ちゅ"], ["cho", "ちょ"],
  ["tya", "ちゃ"], ["tyu", "ちゅ"], ["tyo", "ちょ"],
  ["nya", "にゃ"], ["nyu", "にゅ"], ["nyo", "にょ"],
  ["hya", "ひゃ"], ["hyu", "ひゅ"], ["hyo", "ひょ"],
  ["bya", "びゃ"], ["byu", "びゅ"], ["byo", "びょ"],
  ["pya", "ぴゃ"], ["pyu", "ぴゅ"], ["pyo", "ぴょ"],
  ["mya", "みゃ"], ["myu", "みゅ"], ["myo", "みょ"],
  ["rya", "りゃ"], ["ryu", "りゅ"], ["ryo", "りょ"],
  ["ja", "じゃ"], ["ju", "じゅ"], ["jo", "じょ"],
  ["jya", "じゃ"], ["jyu", "じゅ"], ["jyo", "じょ"],
  ["zya", "じゃ"], ["zyu", "じゅ"], ["zyo", "じょ"],
  ["shi", "し"], ["si", "し"],
  ["chi", "ち"], ["ti", "ち"],
  ["tsu", "つ"], ["tu", "つ"],
  ["fu", "ふ"], ["hu", "ふ"],
  ["ka", "か"], ["ki", "き"], ["ku", "く"], ["ke", "け"], ["ko", "こ"],
  ["ga", "が"], ["gi", "ぎ"], ["gu", "ぐ"], ["ge", "げ"], ["go", "ご"],
  ["sa", "さ"], ["su", "す"], ["se", "せ"], ["so", "そ"],
  ["za", "ざ"], ["ji", "じ"], ["zu", "ず"], ["ze", "ぜ"], ["zo", "ぞ"],
  ["zi", "じ"],
  ["ta", "た"], ["te", "て"], ["to", "と"],
  ["da", "だ"], ["di", "ぢ"], ["du", "づ"], ["de", "で"], ["do", "ど"],
  ["na", "な"], ["ni", "に"], ["nu", "ぬ"], ["ne", "ね"], ["no", "の"],
  ["ha", "は"], ["hi", "ひ"], ["he", "へ"], ["ho", "ほ"],
  ["ba", "ば"], ["bi", "び"], ["bu", "ぶ"], ["be", "べ"], ["bo", "ぼ"],
  ["pa", "ぱ"], ["pi", "ぴ"], ["pu", "ぷ"], ["pe", "ぺ"], ["po", "ぽ"],
  ["ma", "ま"], ["mi", "み"], ["mu", "む"], ["me", "め"], ["mo", "も"],
  ["ya", "や"], ["yu", "ゆ"], ["yo", "よ"],
  ["ra", "ら"], ["ri", "り"], ["ru", "る"], ["re", "れ"], ["ro", "ろ"],
  ["wa", "わ"], ["wo", "を"],
  ["a", "あ"], ["i", "い"], ["u", "う"], ["e", "え"], ["o", "お"],
];

const ROMA_TO_HIRA = new Map(SYLLABLES.map(([r, h]) => [r, h]));
const ROMA_KEYS = [...ROMA_TO_HIRA.keys()].sort((a, b) => b.length - a.length);

const HIRA_ROMAS = new Map();
for (const [roma, hira] of SYLLABLES) {
  if (!HIRA_ROMAS.has(hira)) HIRA_ROMAS.set(hira, []);
  const list = HIRA_ROMAS.get(hira);
  if (!list.includes(roma)) list.push(roma);
}
const HIRA_KEYS = [...HIRA_ROMAS.keys()].sort((a, b) => b.length - a.length);

const VOWEL_OF = {};
for (const [hira, romas] of HIRA_ROMAS) {
  const v = romas[0].match(/[aeiou]$/)?.[0];
  if (!v) continue;
  const last = [...hira].at(-1);
  VOWEL_OF[last] = { a: "あ", i: "い", u: "う", e: "え", o: "お" }[v];
}
VOWEL_OF["を"] = "お";

export function kataToHira(s) {
  return [...String(s)].map((ch) => {
    const c = ch.codePointAt(0);
    if (c >= 0x30a1 && c <= 0x30f6) return String.fromCodePoint(c - 0x60);
    return ch;
  }).join("");
}

export function hiraToKata(s) {
  return [...String(s)].map((ch) => {
    const c = ch.codePointAt(0);
    if (c >= 0x3041 && c <= 0x3096) return String.fromCodePoint(c + 0x60);
    return ch;
  }).join("");
}

/** Expand ー into the vowel it lengthens. を is kept. */
export function foldLong(s) {
  const src = kataToHira(s);
  let out = "";
  for (const ch of src) {
    if (ch === "ー") {
      const prev = [...out].at(-1);
      const v = prev && VOWEL_OF[prev];
      if (v) out += v;
      continue;
    }
    out += ch;
  }
  return out;
}

/** を and お compare equal, after long-mark folding. */
export function sameReading(a, b) {
  const x = foldLong(a).replaceAll("を", "お");
  const y = foldLong(b).replaceAll("を", "お");
  return x === y;
}

function prepLatin(s) {
  return s
    .replaceAll("tcha", "ccha")
    .replaceAll("tchu", "cchu")
    .replaceAll("tcho", "ccho")
    .replaceAll("tchi", "cchi");
}

function isPrefixOfRoma(s) {
  if (!s) return true;
  return ROMA_KEYS.some((key) => key.startsWith(s));
}

/**
 * Convert a latin chunk. A trailing n stays pending (it might still be な).
 * nn at the end confirms ん. nna is んな. Doubled consonants become っ.
 */
export function convertLatin(chunk) {
  const s = prepLatin(chunk);
  let kana = "";
  let i = 0;
  while (i < s.length) {
    if (s.startsWith("n'", i)) {
      kana += "ん";
      i += 2;
      continue;
    }
    if (s[i] === "n" && s[i + 1] === "n") {
      const third = s[i + 2];
      if (!third) {
        kana += "ん";
        i += 2;
        continue;
      }
      if ("aiueoy".includes(third)) {
        kana += "ん";
        i += 1;
        continue;
      }
      kana += "ん";
      i += 2;
      continue;
    }
    if (s[i] === "n" && s[i + 1] && !"aiueoy'".includes(s[i + 1])) {
      kana += "ん";
      i += 1;
      continue;
    }
    if (s[i + 1] === s[i] && !"aeioun'".includes(s[i])) {
      kana += "っ";
      i += 1;
      continue;
    }
    let matched = null;
    for (const key of ROMA_KEYS) {
      if (!s.startsWith(key, i)) continue;
      if (key === "n") {
        const after = s[i + 1];
        if (!after || "aiueoy'".includes(after)) continue;
      }
      matched = key;
      break;
    }
    if (matched) {
      kana += ROMA_TO_HIRA.get(matched);
      i += matched.length;
      continue;
    }
    return { kana, pending: s.slice(i) };
  }
  return { kana, pending: "" };
}

function normalizeRaw(input) {
  let s = String(input ?? "").toLowerCase();
  s = s.replace(/[Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  s = s.replace(/[。、．，,.!！?？・\s\-‐‑–—]/g, (ch) => (ch === "-" || ch === "‐" || ch === "‑" || ch === "–" || ch === "—" ? "-" : ""));
  s = s.replace(/ā/g, "aa").replace(/ī/g, "ii").replace(/ū/g, "uu").replace(/ē/g, "ee").replace(/ō/g, "oo");
  return s;
}

/** Live IME: mixed kana and romaji become hiragana plus a short latin tail. */
export function liveConvert(input) {
  const s = normalizeRaw(input);
  let kana = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "-") {
      if (kana) kana += "ー";
      i += 1;
      continue;
    }
    const code = ch.codePointAt(0);
    const isKana = (code >= 0x3040 && code <= 0x30ff) || ch === "ー";
    if (isKana) {
      kana += kataToHira(ch);
      i += 1;
      continue;
    }
    if (!/[a-z']/.test(ch)) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < s.length && /[a-z']/.test(s[j])) j += 1;
    const part = convertLatin(s.slice(i, j));
    kana += part.kana;
    if (part.pending) return { kana, pending: part.pending, text: kana + part.pending };
    i = j;
  }
  return { kana, pending: "", text: kana };
}

export function romajiToHiragana(input) {
  const { kana, pending } = liveConvert(input);
  if (pending) {
    if (pending === "n") return kana + "ん";
    return null;
  }
  return kana;
}

function romajiOptions(hira) {
  const s = kataToHira(hira);
  const memo = new Map();
  function walk(i) {
    if (memo.has(i)) return memo.get(i);
    if (i >= s.length) return [""];
    const ch = s[i];
    let out = [];
    if (ch === "っ") {
      for (const next of walk(i + 1)) {
        if (next && !"aiueon'".includes(next[0])) out.push(next[0] + next);
      }
    } else if (ch === "ん") {
      for (const next of walk(i + 1)) {
        if (!next) out.push("n", "nn");
        else if ("aiueoy".includes(next[0])) out.push("n'" + next, "nn" + next);
        else out.push("n" + next);
      }
    } else if (ch === "ー") {
      out.push("-");
    } else if (ch === "を") {
      for (const next of walk(i + 1)) out.push("wo" + next, "o" + next);
    } else {
      let hit = false;
      for (const key of HIRA_KEYS) {
        if (!s.startsWith(key, i)) continue;
        hit = true;
        const romas = HIRA_ROMAS.get(key);
        for (const next of walk(i + key.length)) {
          for (const roma of romas) out.push(roma + next);
        }
        break;
      }
      if (!hit) out = [];
    }
    out = [...new Set(out)];
    memo.set(i, out);
    return out;
  }
  return walk(0);
}

/** True when `pending` can still grow into the unread tail of a reading. */
export function pendingFits(rest, pending) {
  if (!pending) return true;
  if (!isPrefixOfRoma(pending) && pending !== "n") return false;
  const options = romajiOptions(rest);
  return options.some((roma) => roma.startsWith(pending));
}

export function kanaToRomaji(input) {
  const opts = romajiOptions(foldLong(input).replaceAll("を", "お"));
  return opts[0] || "";
}

/** Dictionary reading → hiragana strings the player may type. */
export function expandReading(reading) {
  const parts = String(reading).split(/\s*[;；/／]\s*/);
  const out = [];
  const add = (p) => {
    let t = kataToHira(p);
    t = t.replace(/[(（][^)）]*[)）]/g, "");
    t = t.replace(/[～〜~]/g, "");
    t = t.replace(/[・\s]/g, "");
    t = t.replace(/[()（）]/g, "");
    if (t && /^[\u3040-\u309fー]+$/.test(t) && !out.includes(t)) out.push(t);
  };
  for (let p of parts) {
    p = p.trim();
    if (!p) continue;
    const optional = p.match(/^(.*?)[(（]\s*する\s*[)）]\s*$/);
    if (optional) {
      add(optional[1]);
      add(`${optional[1]}する`);
    } else add(p);
  }
  return out;
}

export function primaryRomaji(hira) {
  return kanaToRomaji(hira);
}
