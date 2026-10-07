/** Original synthesized drones, tracker beeps, and stingers. */

let ctx = null;
let master = null;
let musicGain = null;
let started = false;
let muted = false;
let musicTimer = null;
const scale = [110, 130.81, 146.83, 164.81, 196, 220, 246.94];
let stepN = 0;

function ac() {
  if (!ctx) ctx = new AudioContext();
  if (!master) {
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
  }
  return ctx;
}

export function setMuted(on) {
  muted = !!on;
  if (master) master.gain.value = muted ? 0 : 0.9;
}

export function isMuted() {
  return muted;
}

export async function resumeAudio() {
  const c = ac();
  if (c.state === "suspended") await c.resume();
  if (!started) {
    started = true;
    startMusic();
  }
}

function envGain(duration, peak = 0.2) {
  const c = ac();
  const g = c.createGain();
  g.connect(master);
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  return g;
}

function tone(freq, dur, type, peak) {
  if (!started) return;
  const c = ac();
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  o.connect(envGain(dur, peak));
  o.start();
  o.stop(c.currentTime + dur + 0.02);
}

function noise(dur, peak) {
  if (!started) return;
  const c = ac();
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 900;
  src.connect(filter);
  filter.connect(envGain(dur, peak));
  src.start();
}

export function sfxKill() {
  noise(0.12, 0.18);
  tone(520, 0.09, "square", 0.08);
  tone(180, 0.16, "sawtooth", 0.06);
}

export function sfxMiss() {
  tone(90, 0.08, "square", 0.05);
}

export function sfxHurt() {
  tone(70, 0.28, "sawtooth", 0.12);
  tone(48, 0.36, "square", 0.08);
}

export function sfxShift() {
  if (!started) return;
  const c = ac();
  const o = c.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(240, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(60, c.currentTime + 0.35);
  o.connect(envGain(0.38, 0.08));
  o.start();
  o.stop(c.currentTime + 0.4);
}

export function sfxClear() {
  tone(330, 0.12, "triangle", 0.07);
  setTimeout(() => tone(440, 0.18, "triangle", 0.07), 90);
}

function startMusic() {
  const c = ac();
  musicGain = c.createGain();
  musicGain.gain.value = 0.18;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 420;
  musicGain.connect(filter);
  filter.connect(master);

  const drone = c.createOscillator();
  drone.type = "sawtooth";
  drone.frequency.value = 55;
  const droneGain = c.createGain();
  droneGain.gain.value = 0.22;
  drone.connect(droneGain);
  droneGain.connect(musicGain);
  drone.start();

  const drone2 = c.createOscillator();
  drone2.type = "triangle";
  drone2.frequency.value = 82.5;
  const g2 = c.createGain();
  g2.gain.value = 0.12;
  drone2.connect(g2);
  g2.connect(musicGain);
  drone2.start();

  const play = () => {
    if (!started) return;
    const freq = scale[stepN % scale.length];
    stepN += 1;
    const o = c.createOscillator();
    o.type = stepN % 4 === 0 ? "square" : "triangle";
    o.frequency.value = freq / (stepN % 7 === 0 ? 2 : 1);
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g);
    g.connect(musicGain);
    o.start();
    o.stop(t + 0.75);
  };
  play();
  musicTimer = setInterval(play, 780);
}

let lastBeep = 0;

export function tracker(nearest, now) {
  if (!started || nearest <= 0) return;
  const gap = nearest > 0.82 ? 180 : nearest > 0.6 ? 340 : nearest > 0.35 ? 700 : 1200;
  if (now - lastBeep < gap) return;
  lastBeep = now;
  tone(880 + nearest * 440, 0.045, "square", 0.04 + nearest * 0.03);
}

export function stopAudio() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  if (ctx) ctx.close().catch(() => {});
  ctx = null;
  master = null;
  started = false;
}
