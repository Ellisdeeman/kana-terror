import { expandReading, hiraToKata, primaryRomaji } from "./romaji.js";

/** Seven sectors. The last one is Subject 09. */
export const SECTORS = [
  {
    id: "dock",
    name: "Docking Ring",
    code: "SEC-01",
    blurb: "The airlock cycles. Something on the hull is sounding out the alphabet.",
    pool: "hira-basic",
    kills: 9,
    spawn: 1450,
    speed: 0.135,
    max: 4,
    runners: 0,
    armored: 0,
    mimic: 0,
  },
  {
    id: "vents",
    name: "Vent Shafts",
    code: "SEC-02",
    blurb: "They come through the grilles. The short ones run.",
    pool: "hira-full",
    kills: 10,
    spawn: 1300,
    speed: 0.15,
    max: 4,
    runners: 0.3,
    armored: 0,
    mimic: 0,
  },
  {
    id: "lab",
    name: "Cold Lab",
    code: "SEC-03",
    blurb: "The loanword cultures are awake. Read the tags in katakana.",
    pool: "kata",
    kills: 10,
    spawn: 1350,
    speed: 0.145,
    max: 4,
    runners: 0.22,
    armored: 0,
    mimic: 0,
  },
  {
    id: "ward",
    name: "Specimen Ward",
    code: "SEC-04",
    blurb: "Labeled hosts. Type the reading, not the marks on the plate.",
    pool: "vocab",
    kills: 12,
    spawn: 1550,
    speed: 0.12,
    max: 4,
    runners: 0.1,
    armored: 0.38,
    mimic: 0,
    vocabMode: "early",
  },
  {
    id: "bay",
    name: "Armor Bay",
    code: "SEC-05",
    blurb: "Plated things. The kanji is a shield. The reading is the seam.",
    pool: "kanji",
    kills: 12,
    spawn: 1450,
    speed: 0.125,
    max: 4,
    runners: 0.14,
    armored: 0.72,
    mimic: 0,
  },
  {
    id: "gallery",
    name: "Mimic Gallery",
    code: "SEC-06",
    blurb: "These ones wear English like a face. Answer in Japanese.",
    pool: "vocab",
    kills: 12,
    spawn: 1400,
    speed: 0.13,
    max: 5,
    runners: 0.16,
    armored: 0.12,
    mimic: 0.5,
  },
  {
    id: "core",
    name: "The Core",
    code: "SEC-07",
    blurb: "Subject 09 will not keep a shape. Finish the word before it becomes another.",
    pool: "boss",
    kills: 1,
    spawn: 9000,
    speed: 0.052,
    max: 1,
    runners: 0,
    armored: 0,
    mimic: 0,
    boss: true,
  },
];

const BASIC = ["あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ", "さ", "し", "す", "せ", "そ", "た", "ち", "つ", "て", "と", "な", "に", "ぬ", "ね", "の", "は", "ひ", "ふ", "へ", "ほ", "ま", "み", "む", "め", "も", "や", "ゆ", "よ", "ら", "り", "る", "れ", "ろ", "わ", "を", "ん"];
const VOICED = ["が", "ぎ", "ぐ", "げ", "ご", "ざ", "じ", "ず", "ぜ", "ぞ", "だ", "ぢ", "づ", "で", "ど", "ば", "び", "ぶ", "べ", "ぼ", "ぱ", "ぴ", "ぷ", "ぺ", "ぽ"];
const YOON_HEADS = ["き", "ぎ", "し", "じ", "ち", "に", "ひ", "び", "ぴ", "み", "り"];
const YOON_TAILS = ["ゃ", "ゅ", "ょ"];

function kanaItem(hira, script) {
  const display = script === "kata" ? hiraToKata(hira) : hira;
  const kind = script === "kata" ? "katakana" : "hiragana";
  return {
    id: display,
    type: "kana",
    script,
    accept: [hira],
    display,
    meaning: `${kind} ${primaryRomaji(hira) || hira}`,
    reading: hira,
    len: [...hira].length,
  };
}

function buildKana() {
  const yoon = [];
  for (const head of YOON_HEADS) {
    for (const tail of YOON_TAILS) yoon.push(head + tail);
  }
  const hiraBasic = BASIC.map((h) => kanaItem(h, "hira"));
  const hiraFull = [...BASIC, ...VOICED, ...yoon].map((h) => kanaItem(h, "hira"));
  const kata = [...BASIC, ...VOICED, ...yoon].map((h) => kanaItem(h, "kata"));
  return { hiraBasic, hiraFull, kata };
}

export const BOSS_PHRASE = {
  display: "私は学生です。出口はどこですか。",
  accept: ["わたしはがくせいですでぐちはどこですか"],
  meaning: "I am a student. Where is the exit?",
  reading: "わたしはがくせいですでぐちはどこですか",
  parts: [
    { id: 713, type: "vocab" },
    { id: 155, type: "vocab" },
    { id: 430, type: "vocab" },
    { id: 456, type: "vocab" },
  ],
};

function firstJp(jp) {
  return String(jp).split(/[;；]/)[0].trim();
}

export function buildCatalog(vocabRows, kanjiRows) {
  const kana = buildKana();
  const vocab = vocabRows.map((row) => {
    const accept = expandReading(row.kana);
    const reading = accept[0] || row.kana;
    return {
      id: row.id,
      type: "vocab",
      jp: firstJp(row.jp),
      kana: row.kana,
      en: row.en,
      rank: row.rank ?? row.id,
      rankCount: vocabRows.length,
      accept: accept.length ? accept : [reading],
      display: firstJp(row.jp),
      meaning: row.en,
      reading,
      len: [...reading].length,
      kanji: /[\u4e00-\u9fff]/.test(firstJp(row.jp)),
    };
  });
  const kanji = kanjiRows.map((row) => {
    const accept = (row.accept || []).filter(Boolean);
    return {
      id: row.id,
      type: "kanji",
      accept,
      display: row.id,
      meaning: row.meaning,
      reading: accept[0] || row.id,
      len: [...(accept[0] || "")].length || 1,
    };
  }).filter((k) => k.accept.length);
  return { ...kana, vocab, kanji };
}

export function sectorByIndex(i) {
  return SECTORS[Math.max(0, Math.min(SECTORS.length - 1, i))];
}

export function endlessTuning(kills) {
  const n = Math.max(0, kills);
  return {
    id: "endless",
    name: "Endless Watch",
    code: "SEC-∞",
    blurb: "The station does not end.",
    pool: n < 8 ? "hira-full" : n < 16 ? "kata" : "mix",
    kills: Infinity,
    spawn: Math.max(680, 1500 - n * 28),
    speed: Math.min(0.24, 0.12 + n * 0.0035),
    max: Math.min(6, 3 + Math.floor(n / 8)),
    runners: Math.min(0.4, 0.12 + n * 0.01),
    armored: n >= 16 ? 0.34 : 0,
    mimic: n >= 24 ? 0.28 : 0,
    vocabMode: "flat",
    boss: false,
  };
}
