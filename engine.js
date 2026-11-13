// Motor puro (sem DOM): alinhamento por correlação, mapa de diferença, vegetação e exposição.
// Exporta CMP (navegador e Node). Imagens chegam como RGBA (Uint8ClampedArray) com n pixels.
(function (root) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // tons de cinza; pixel transparente vira cinza médio para não puxar a correlação
  function gray(d, n) {
    const g = new Float32Array(n);
    for (let i = 0; i < n; i++) g[i] = d[i * 4 + 3] ? 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2] : 128;
    return g;
  }

  // ---------- alinhamento: translação, escala e rotação que maximizam a correlação ----------
  const meanOf = g => { let s = 0; for (let i = 0; i < g.length; i++) s += g[i]; return s / g.length; };
  function correlate(a, b, gw, gh, ox, oy, ma, mb) {
    let s = 0, n = 0;
    for (let y = 0; y < gh; y++) {
      const y2 = y + oy; if (y2 < 0 || y2 >= gh) continue;
      const r = y * gw, r2 = y2 * gw;
      for (let x = 0; x < gw; x++) { const x2 = x + ox; if (x2 < 0 || x2 >= gw) continue; s += (a[r + x] - ma) * (b[r2 + x2] - mb); n++; }
    }
    return n ? s / n : -Infinity;
  }
  function bestShift(a, b, gw, gh, cx, cy, wx, wy) {
    const ma = meanOf(a), mb = meanOf(b); let best = -Infinity, bx = cx, by = cy;
    for (let dy = cy - wy; dy <= cy + wy; dy++) for (let dx = cx - wx; dx <= cx + wx; dx++) {
      const s = correlate(a, b, gw, gh, dx, dy, ma, mb); if (s > best) { best = s; bx = dx; by = dy; }
    }
    return { dx: bx, dy: by, score: best };
  }
  function bilinear(b, gw, gh, x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    if (x0 < 0 || x0 >= gw - 1 || y0 < 0 || y0 >= gh - 1) return b[clamp(y0, 0, gh - 1) * gw + clamp(x0, 0, gw - 1)];
    const fx = x - x0, fy = y - y0, i = y0 * gw + x0;
    return b[i] * (1 - fx) * (1 - fy) + b[i + 1] * fx * (1 - fy) + b[i + gw] * (1 - fx) * fy + b[i + gw + 1] * fx * fy;
  }
  function resample(b, gw, gh, scale, deg) {
    const rad = deg * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad), cx = (gw - 1) / 2, cy = (gh - 1) / 2, r = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const u = (x - cx) / scale, v = (y - cy) / scale;
      r[y * gw + x] = bilinear(b, gw, gh, co * u + si * v + cx, -si * u + co * v + cy);
    }
    return r;
  }
  // devolve o deslocamento de b em relação a a (em pixels da grade), a escala e a rotação de b
  function computeAlign(a, b, gw, gh) {
    let { dx, dy } = bestShift(a, b, gw, gh, 0, 0, Math.round(gw * 0.08), Math.round(gh * 0.08)), scale = 1, rot = 0, best;
    const pass = (vals, set, win) => {
      best = -Infinity;
      for (const v of vals) { const t = bestShift(a, set(v), gw, gh, dx, dy, win, win); if (t.score > best) { best = t.score; pick(v); dx = t.dx; dy = t.dy; } }
    };
    let pick;
    const range = (a0, a1, st) => { const o = []; for (let v = a0; v <= a1 + 1e-9; v += st) o.push(v); return o; };
    pick = v => { scale = v; }; pass(range(0.94, 1.06, 0.02), v => resample(b, gw, gh, v, 0), 4);
    pick = v => { rot = v; };   pass(range(-2, 2, 0.5), v => resample(b, gw, gh, scale, v), 3);
    const s0 = scale; pick = v => { scale = v; }; pass(range(Math.max(0.92, s0 - 0.02), s0 + 0.02, 0.004), v => resample(b, gw, gh, v, rot), 2);
    const r0 = rot;   pick = v => { rot = v; };   pass(range(r0 - 0.5, r0 + 0.5, 0.1), v => resample(b, gw, gh, scale, v), 2);
    // refino subpixel por parábola
    const rb = resample(b, gw, gh, scale, rot), ma = meanOf(a), mb = meanOf(rb), c = (x, y) => correlate(a, rb, gw, gh, x, y, ma, mb);
    const sub = (m, c0, c1) => { const den = m - 2 * c0 + c1; return den !== 0 && c0 >= m && c0 >= c1 ? (m - c1) / (2 * den) : 0; };
    const mid = c(dx, dy);
    return { dx: dx + sub(c(dx - 1, dy), mid, c(dx + 1, dy)), dy: dy + sub(c(dx, dy - 1), mid, c(dx, dy + 1)), scale, rot, score: best };
  }

  // razão de brilho médio A/B onde as duas imagens têm pixel
  function exposure(a, b, n) {
    let sa = 0, sb = 0;
    for (let i = 0; i < n; i++) { const j = i * 4; if (!a[j + 3] || !b[j + 3]) continue; sa += a[j] + a[j + 1] + a[j + 2]; sb += b[j] + b[j + 1] + b[j + 2]; }
    return sb > 0 ? clamp(sa / sb, 0.25, 4) : 1;
  }

  // diferença: fundo em cinza escuro da imagem A; o que mudou acima do limiar acende em magenta
  function diffMap(a, b, n, thr, gain, k) {
    const out = new Uint8ClampedArray(n * 4); let valid = 0, changed = 0;
    for (let i = 0; i < n; i++) {
      const j = i * 4; if (!a[j + 3] || !b[j + 3]) continue;
      valid++;
      const d = (Math.abs(a[j] - b[j] * k) + Math.abs(a[j + 1] - b[j + 1] * k) + Math.abs(a[j + 2] - b[j + 2] * k)) / 3;
      const base = (0.299 * a[j] + 0.587 * a[j + 1] + 0.114 * a[j + 2]) * 0.3;
      if (d < thr) { out[j] = out[j + 1] = out[j + 2] = base; }
      else { changed++; const t = Math.min((d - thr) * gain / 128, 1); out[j] = 70 + 185 * t; out[j + 1] = 20 + 70 * t; out[j + 2] = 90 + 150 * t; }
      out[j + 3] = 255;
    }
    return { out, pct: valid ? changed / valid * 100 : 0 };
  }

  // vegetação pelo índice de excesso de verde normalizado: (2G - R - B) / (R + G + B)
  const isVeg = (d, j, thr) => (2 * d[j + 1] - d[j] - d[j + 2]) / (d[j] + d[j + 1] + d[j + 2] + 1) > thr;
  const VEG = { gain: [25, 158, 112, 235], loss: [217, 89, 38, 235], both: [25, 158, 112, 70] };
  function vegMap(a, b, n, thr) {
    const out = new Uint8ClampedArray(n * 4); let valid = 0, va = 0, vb = 0, gain = 0, loss = 0;
    for (let i = 0; i < n; i++) {
      const j = i * 4; if (!a[j + 3] || !b[j + 3]) continue;
      valid++;
      const x = isVeg(a, j, thr), y = isVeg(b, j, thr);
      if (x) va++; if (y) vb++;
      const c = x && y ? VEG.both : y ? (gain++, VEG.gain) : x ? (loss++, VEG.loss) : null;
      if (c) { out[j] = c[0]; out[j + 1] = c[1]; out[j + 2] = c[2]; out[j + 3] = c[3]; }
    }
    const p = v => valid ? v / valid * 100 : 0;
    return { out, a: p(va), b: p(vb), gain: p(gain), loss: p(loss) };
  }

  const CMP = { gray, computeAlign, exposure, diffMap, vegMap, VEG };
  if (typeof module !== 'undefined' && module.exports) module.exports = CMP; else root.CMP = CMP;
})(typeof window !== 'undefined' ? window : globalThis);
