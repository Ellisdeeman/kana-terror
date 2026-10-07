/** Corridor, lamps, and original creatures. No licensed characters. */

const spriteCache = new Map();

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
}

function paintSprite(variant, accent) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  const skin = accent || "#b7c4b0";
  const dark = "#14181c";
  const sore = "#c4373a";
  if (variant === "runner") {
    px(g, 6, 34, 52, 10, skin);
    px(g, 8, 30, 16, 6, skin);
    px(g, 44, 28, 12, 8, dark);
    px(g, 50, 30, 3, 3, sore);
    for (let i = 0; i < 6; i++) px(g, 8 + i * 8, 44, 3, 10, dark);
    px(g, 4, 36, 6, 3, sore);
  } else if (variant === "spore") {
    px(g, 24, 8, 16, 10, skin);
    px(g, 16, 18, 32, 28, "#9fb0a4");
    px(g, 20, 26, 8, 8, sore);
    px(g, 36, 30, 6, 6, dark);
    px(g, 18, 46, 6, 12, dark);
    px(g, 40, 46, 6, 12, dark);
    px(g, 28, 48, 8, 12, dark);
  } else if (variant === "armored") {
    px(g, 14, 10, 36, 40, "#6e7774");
    px(g, 18, 14, 28, 14, "#a8b0aa");
    px(g, 22, 18, 20, 4, "#d6ffe2");
    px(g, 16, 30, 32, 6, "#3c4340");
    px(g, 12, 40, 10, 16, "#545c59");
    px(g, 42, 40, 10, 16, "#545c59");
    px(g, 26, 44, 12, 16, "#2a2f2d");
    px(g, 20, 8, 6, 6, sore);
  } else if (variant === "mimic") {
    px(g, 24, 6, 16, 16, "#d7c2a6");
    px(g, 26, 10, 4, 4, dark);
    px(g, 34, 10, 4, 4, dark);
    px(g, 28, 16, 8, 2, sore);
    px(g, 22, 22, 20, 22, "#cbb89a");
    px(g, 10, 24, 12, 6, "#d7c2a6");
    px(g, 42, 28, 12, 6, "#d7c2a6");
    px(g, 18, 44, 8, 14, "#b7a488");
    px(g, 36, 44, 8, 14, "#b7a488");
    px(g, 8, 26, 6, 10, "#d7c2a6");
  } else if (variant === "boss") {
    px(g, 10, 16, 44, 32, "#8d9a86");
    px(g, 4, 24, 14, 16, "#6d7b68");
    px(g, 46, 20, 14, 18, "#6d7b68");
    px(g, 22, 8, 18, 12, skin);
    px(g, 26, 12, 4, 4, sore);
    px(g, 34, 12, 4, 4, dark);
    px(g, 18, 28, 28, 8, "#243028");
    px(g, 16, 46, 8, 12, dark);
    px(g, 40, 46, 8, 12, dark);
    px(g, 28, 44, 10, 14, dark);
    px(g, 8, 18, 6, 6, sore);
  } else if (variant === "host") {
    px(g, 22, 4, 18, 14, skin);
    px(g, 26, 8, 4, 4, sore);
    px(g, 34, 8, 3, 3, dark);
    px(g, 18, 18, 28, 26, "#97a394");
    px(g, 8, 20, 10, 18, skin);
    px(g, 46, 22, 10, 20, skin);
    px(g, 20, 44, 8, 16, dark);
    px(g, 36, 44, 8, 16, dark);
    px(g, 24, 26, 16, 6, "#2a2428");
  } else {
    px(g, 16, 20, 32, 22, skin);
    px(g, 20, 14, 22, 10, "#d5ddd0");
    px(g, 24, 16, 5, 5, sore);
    px(g, 34, 17, 4, 4, dark);
    px(g, 12, 40, 4, 12, dark);
    px(g, 22, 42, 4, 14, dark);
    px(g, 32, 42, 4, 14, dark);
    px(g, 44, 40, 4, 12, dark);
    px(g, 8, 28, 8, 4, skin);
    px(g, 48, 30, 8, 4, skin);
  }
  return c;
}

function sprite(variant) {
  if (!spriteCache.has(variant)) spriteCache.set(variant, paintSprite(variant));
  return spriteCache.get(variant);
}

export function layoutEnemy(enemy, w, h) {
  const lanes = [-0.72, 0, 0.72];
  const lane = lanes[enemy.lane] ?? 0;
  const p = Math.max(0, Math.min(1, enemy.progress));
  const y = h * (0.34 + p * 0.46);
  const spread = w * (0.08 + p * 0.26);
  const x = w * 0.5 + lane * spread;
  const scale = (enemy.boss ? 1.35 : 1) * (0.38 + p * 1.15);
  return { x, y, scale, p };
}

function flicker(t) {
  const n = Math.abs(Math.sin(t * 0.017) + Math.sin(t * 0.005) * 0.4);
  return 0.55 + (n % 1) * 0.45;
}

export function drawWorld(ctx, state, w, h, time) {
  ctx.clearRect(0, 0, w, h);
  const t = time || 0;
  const lamp = flicker(t + (state?.lamp || 0));
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#05060a");
  g.addColorStop(0.45, "#10141c");
  g.addColorStop(1, "#07080c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const vanishX = w * 0.5;
  const vanishY = h * 0.16;
  ctx.strokeStyle = `rgba(150, 190, 160, ${0.08 + lamp * 0.08})`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const y = vanishY + ((h * 0.78 - vanishY) * i) / 6;
    ctx.beginPath();
    ctx.moveTo(w * 0.08, y);
    ctx.lineTo(w * 0.92, y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(vanishX, vanishY);
  ctx.lineTo(w * 0.06, h * 0.82);
  ctx.moveTo(vanishX, vanishY);
  ctx.lineTo(w * 0.94, h * 0.82);
  ctx.moveTo(vanishX, vanishY);
  ctx.lineTo(w * 0.28, h * 0.82);
  ctx.moveTo(vanishX, vanishY);
  ctx.lineTo(w * 0.72, h * 0.82);
  ctx.stroke();

  // vents
  ctx.fillStyle = "rgba(20, 28, 24, 0.85)";
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const p = 0.25 + i * 0.16;
      const x = vanishX + side * (40 + p * w * 0.32);
      const y = vanishY + p * h * 0.42;
      ctx.fillRect(x, y, 18 + p * 20, 10 + p * 8);
      ctx.fillStyle = `rgba(80, 120, 90, ${0.15 + lamp * 0.2})`;
      for (let k = 0; k < 4; k++) ctx.fillRect(x + 2, y + 2 + k * 3, 14 + p * 16, 1);
      ctx.fillStyle = "rgba(20, 28, 24, 0.85)";
    }
  }

  // ceiling lamps
  for (let i = 0; i < 3; i++) {
    const x = w * (0.28 + i * 0.22);
    const a = i === 1 ? lamp : 0.35 + lamp * 0.4;
    ctx.fillStyle = `rgba(190, 255, 190, ${0.15 + a * 0.35})`;
    ctx.fillRect(x, h * 0.08, 36, 8);
    const glow = ctx.createRadialGradient(x + 18, h * 0.12, 4, x + 18, h * 0.28, 90);
    glow.addColorStop(0, `rgba(170, 255, 180, ${0.18 * a})`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 60, h * 0.08, 160, 180);
  }

  const list = (state?.enemies || []).slice().sort((a, b) => a.progress - b.progress);
  for (const enemy of list) {
    const box = layoutEnemy(enemy, w, h);
    const spr = sprite(enemy.variant || "crawler");
    const dw = 64 * box.scale;
    const dh = 64 * box.scale;
    ctx.save();
    ctx.globalAlpha = 0.35 + box.p * 0.65;
    if (state?.lock === enemy.uid) {
      ctx.shadowColor = "#b6ff9a";
      ctx.shadowBlur = 16;
    }
    const bob = Math.sin(t * 0.01 + enemy.uid) * (2 + box.p * 3);
    ctx.drawImage(spr, box.x - dw / 2, box.y - dh * 0.75 + bob, dw, dh);
    ctx.restore();
  }

  // player lamp
  const cone = ctx.createRadialGradient(w / 2, h * 0.92, 10, w / 2, h * 0.7, w * 0.45);
  cone.addColorStop(0, `rgba(180, 255, 190, ${0.16 * lamp})`);
  cone.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = cone;
  ctx.fillRect(0, h * 0.4, w, h * 0.6);

  if (state?.hurtFlash > 0) {
    ctx.fillStyle = `rgba(180, 20, 30, ${state.hurtFlash * 0.35})`;
    ctx.fillRect(0, 0, w, h);
  }
}

export function drawTitle(ctx, w, h, time) {
  drawWorld(ctx, {
    lamp: time,
    lock: 1,
    enemies: [{ uid: 1, lane: 1, progress: 0.42 + Math.sin(time * 0.001) * 0.04, variant: "boss" }],
  }, w, h, time);
}
