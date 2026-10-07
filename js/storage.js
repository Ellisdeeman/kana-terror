import { emptySave, normalizeResults } from "./srs.js";

export const SAVE_KEY = "kana-terror.v1";

export function loadSave(storage = localStorage) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return emptySave();
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return emptySave();
    return {
      ...emptySave(),
      ...data,
      results: Array.isArray(data.results) ? data.results : [],
      cards: data.cards && typeof data.cards === "object" ? data.cards : {},
      study: data.study && Array.isArray(data.study.known) ? data.study : null,
    };
  } catch {
    return emptySave();
  }
}

export function writeSave(save, storage = localStorage) {
  storage.setItem(SAVE_KEY, JSON.stringify(save));
  return save;
}

export function rememberResult(row, patch, storage = localStorage) {
  const save = loadSave(storage);
  save.results = normalizeResults((save.results || []).concat(normalizeResults([row])));
  if (patch) Object.assign(save, patch);
  return writeSave(save, storage);
}
