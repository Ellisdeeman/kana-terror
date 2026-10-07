/**
 * Approach, spawn, and heat presets.
 * Intense matches the original station. Relaxed is the phone-keyboard default.
 * These numbers are not part of the study-list import or the results export.
 */

export const DEFAULT_PACE = "relaxed";

/** Progress a creature still has to cover from a typical spawn to the lamp. */
export const APPROACH_SPAN = 0.96;

export const HEAT_IDLE_PER_S = 1.5;
export const HEAT_CLOSE_PER_S = 9;
export const HEAT_TICK_MS = 850;

export const PACES = {
  relaxed: {
    id: "relaxed",
    label: "Relaxed",
    speed: 0.55,
    spawn: 1.8,
    heat: 0.55,
    ramp: 0.45,
    maxCut: 2,
    maxFloor: 2,
    maxCap: 3,
    secPerKana: 1.7,
    openDelay: 2000,
    shiftBase: 14000,
  },
  normal: {
    id: "normal",
    label: "Normal",
    speed: 0.78,
    spawn: 1.4,
    heat: 0.78,
    ramp: 0.72,
    maxCut: 1,
    maxFloor: 2,
    maxCap: 4,
    secPerKana: 1.1,
    openDelay: 1100,
    shiftBase: 11000,
  },
  intense: {
    id: "intense",
    label: "Intense",
    speed: 1,
    spawn: 1,
    heat: 1,
    ramp: 1,
    maxCut: 0,
    maxFloor: 1,
    maxCap: 6,
    secPerKana: 0.55,
    openDelay: 220,
    shiftBase: 7800,
  },
};

export function paceById(id) {
  return PACES[id] || PACES[DEFAULT_PACE];
}

export function normalizePace(id) {
  return PACES[id] ? id : DEFAULT_PACE;
}

function easeSpeed(speed, origin, ramp) {
  if (ramp >= 1 || speed <= origin) return speed;
  return origin + (speed - origin) * ramp;
}

function easeSpawn(spawn, origin, ramp) {
  if (ramp >= 1 || spawn >= origin) return spawn;
  return origin + (spawn - origin) * ramp;
}

/**
 * Scale a sector or endless block.
 * origin is the first sector: later sectors only ease toward it when they are harsher.
 */
export function scaleTuning(tuning, paceId, origin = null) {
  const pace = paceById(paceId);
  let speed = tuning.speed;
  let spawn = tuning.spawn;
  if (origin) {
    speed = easeSpeed(speed, origin.speed, pace.ramp);
    spawn = easeSpawn(spawn, origin.spawn, pace.ramp);
  }
  let max = tuning.max;
  if (!tuning.boss) {
    max = Math.max(pace.maxFloor, Math.min(pace.maxCap, tuning.max - pace.maxCut));
  }
  return {
    ...tuning,
    speed: speed * pace.speed,
    spawn: spawn * pace.spawn,
    max,
    pace: pace.id,
  };
}

/** Seconds from a fresh spawn to the lamp at this progress speed. */
export function approachSeconds(speed) {
  return APPROACH_SPAN / speed;
}

/**
 * Vocab, kanji, and mimics keep the sector speed for a 1-kana reading,
 * then gain secPerKana seconds for every further kana.
 */
export function readingSlowdown(baseSpeed, len, paceId, apply) {
  if (!apply || !(baseSpeed > 0)) return baseSpeed;
  const extra = Math.max(0, (len || 1) - 1) * paceById(paceId).secPerKana;
  if (extra <= 0) return baseSpeed;
  return APPROACH_SPAN / (approachSeconds(baseSpeed) + extra);
}

/** Boss shift window. A 1- or 2-kana word uses the pace base; longer words add the same per-kana seconds. */
export function shiftWindow(len, paceId) {
  const pace = paceById(paceId);
  const extra = Math.max(0, (len || 1) - 2) * pace.secPerKana * 1000;
  return Math.round(pace.shiftBase + extra);
}
