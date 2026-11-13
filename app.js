// Interface: carrega imagens, alinha (CMP), desenha os modos de comparação num único canvas e exporta.
// Coordenadas: tudo é desenhado no sistema da imagem de referência (a primeira), depois levado à tela pela vista.
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const cv = $('#cv'), ctx = cv.getContext('2d'), stage = $('#stage');
  const LS = 'ci.opts', MAX = 12, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f1 = v => (+v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

  const MODES = {
    split: ['Cortina', 'Pegue a linha e arraste para revelar B. O ângulo inclina o corte.'],
    fade: ['Transparência', 'B por cima de A, com a opacidade que você escolher.'],
    flicker: ['Piscar', 'Alterna A e B no mesmo lugar: o olho pega na hora o que mudou.'],
    lens: ['Lupa', 'Passe o mouse: dentro do círculo aparece B, fora fica A.'],
    side: ['Lado a lado', 'A e B em painéis sincronizados: zoom, posição e cursor andam juntos.'],
    slices: ['Fatias', 'Tiras alternadas das imagens. Com mais de duas, cada tira é um momento.'],
    diff: ['Diferença', 'Mostra só o que mudou entre A e B, pixel a pixel.'],
    veg: ['Vegetação', 'Estima a área verde em cada imagem e o que cresceu ou secou.']
  };
  const FMT = { angle: v => v + '°', opacity: v => v + ' %', speed: v => f1(v), lens: v => v + ' px', slices: v => v, thr: v => v, gain: v => '×' + f1(v), vthr: v => (+v).toFixed(2) };
  const DEF = { mode: 'split', split: 0.5, angle: 10, opacity: 50, speed: 2, lens: 180, slices: 8, thr: 30, gain: 3, vthr: 0.08, labels: true, grid: false, match: false };
  function loadOpts() {
    let s = {}; try { s = JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { s = {}; }
    const o = { ...DEF };
    for (const k in DEF) if (typeof s[k] === typeof DEF[k] && (typeof s[k] !== 'number' || isFinite(s[k]))) o[k] = s[k];
    if (!MODES[o.mode]) o.mode = DEF.mode;
    return o;
  }
  const S = { imgs: [], a: 0, b: 1, view: { z: 1, x: 0, y: 0 }, o: loadOpts(), W: 0, H: 0, hover: null, peek: false, flip: false,
    layer: null, stats: null, k: 1, drag: null, moveB: false, anim: 0, clean: false, raf: 0, at: 0, ft: 0 };
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(S.o)); } catch (e) { /* sem armazenamento: segue sem lembrar */ } };
  const msg = t => { $('#st-msg').textContent = t; };
  const R = () => S.imgs[0], A = () => S.imgs[S.a], B = () => S.imgs[S.b] || S.imgs[S.a];

  // ---------- imagens ----------
  function addImage(url, name) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const it = { img, url, label: name.replace(/\.[^.]+$/, ''), w: img.naturalWidth, h: img.naturalHeight, al: { dx: 0, dy: 0, scale: 1, rot: 0 } };
        S.imgs.push(it);
        if (S.imgs.length > 1) autoAlign(it);
        res(it);
      };
      img.onerror = () => { URL.revokeObjectURL(url); msg('Não consegui abrir ' + name + '.'); res(null); };
      img.src = url;
    });
  }
  async function addFiles(files) {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      if (S.imgs.length >= MAX) { msg('Limite de ' + MAX + ' imagens.'); break; }
      await addImage(URL.createObjectURL(f), f.name || 'Imagem colada');
    }
    refresh();
  }
  function removeAt(i) {
    URL.revokeObjectURL(S.imgs[i].url); S.imgs.splice(i, 1);
    if (!i) S.imgs.forEach((it, j) => { it.al = { dx: 0, dy: 0, scale: 1, rot: 0 }; if (j) autoAlign(it); });   // nova referência
    S.a = Math.min(S.a > i ? S.a - 1 : S.a, Math.max(S.imgs.length - 1, 0));
    S.b = Math.min(S.b > i ? S.b - 1 : S.b, Math.max(S.imgs.length - 1, 0));
    if (S.a === S.b && S.imgs.length > 1) S.b = S.a ? 0 : 1;
    refresh();
  }

  // desenha uma imagem no sistema da referência, com o alinhamento dela
  function paint(x, it) {
    const r = R(), k = Math.min(r.w / it.w, r.h / it.h) * it.al.scale;
    x.save(); x.translate(r.w / 2 + it.al.dx, r.h / 2 + it.al.dy); x.rotate(it.al.rot * Math.PI / 180); x.scale(k, k);
    x.drawImage(it.img, -it.w / 2, -it.h / 2); x.restore();
  }
  const off = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  function autoAlign(it) {
    const r = R(); if (!it || it === r) return false;
    const gw = 192, gh = Math.round(192 * r.h / r.w);
    const grid = im => {
      const c = off(gw, gh), x = c.getContext('2d', { willReadFrequently: true }), s = Math.min(gw / im.w, gh / im.h);
      x.fillStyle = '#808080'; x.fillRect(0, 0, gw, gh); x.drawImage(im.img, (gw - im.w * s) / 2, (gh - im.h * s) / 2, im.w * s, im.h * s);
      return CMP.gray(x.getImageData(0, 0, gw, gh).data, gw * gh);
    };
    try {
      const res = CMP.computeAlign(grid(r), grid(it), gw, gh), k = r.w / gw;
      it.al = { dx: -res.dx * k, dy: -res.dy * k, scale: res.scale, rot: res.rot };
      return true;
    } catch (e) { console.error(e); msg('Não consegui alinhar ' + it.label + '.'); return false; }
  }

  // ---------- análise (diferença, vegetação, brilho) numa cópia reduzida ----------
  function analyze() {
    clearTimeout(S.at);
    S.at = setTimeout(() => {
      const a = A(), b = B(), m = S.o.mode;
      S.layer = null; S.stats = null; S.k = 1;
      if (a && b && a !== b) {
        const r = R(), aw = Math.min(r.w, 960), ah = Math.round(aw * r.h / r.w), q = aw / r.w, n = aw * ah;
        const px = it => { const x = off(aw, ah).getContext('2d', { willReadFrequently: true }); x.setTransform(q, 0, 0, q, 0, 0); paint(x, it); return x.getImageData(0, 0, aw, ah).data; };
        try {
          const da = px(a), db = px(b);
          S.k = CMP.exposure(da, db, n);
          const res = m === 'diff' ? CMP.diffMap(da, db, n, S.o.thr, S.o.gain, S.o.match ? S.k : 1) : m === 'veg' ? CMP.vegMap(da, db, n, S.o.vthr) : null;
          if (res) { const c = off(aw, ah); c.getContext('2d').putImageData(new ImageData(res.out, aw, ah), 0, 0); S.layer = c; S.stats = res; }
        } catch (e) { console.error(e); msg('Não consegui analisar estas imagens.'); }
      }
      stats(); draw();
    }, 120);
  }

  // ---------- vista ----------
  function vt(vp) { const r = R(), s = Math.min(vp.w / r.w, S.H / r.h) * S.view.z; return { s, x: vp.x + (vp.w - r.w * s) / 2 + S.view.x, y: (S.H - r.h * s) / 2 + S.view.y }; }
  const pane = p => S.o.mode === 'side' ? { x: p.x < S.W / 2 ? 0 : S.W / 2, w: S.W / 2 } : { x: 0, w: S.W };
  function zoomAt(p, f) {
    if (!R()) return;
    const vp = pane(p), r = R(), t = vt(vp), z = clamp(S.view.z * f, 0.2, 60), s = t.s / S.view.z * z, ix = (p.x - t.x) / t.s, iy = (p.y - t.y) / t.s;
    S.view.z = z; S.view.x = p.x - ix * s - vp.x - (vp.w - r.w * s) / 2; S.view.y = p.y - iy * s - (S.H - r.h * s) / 2;
    draw();
  }
  function fit() { S.view = { z: 1, x: 0, y: 0 }; draw(); }
  const center = () => ({ x: S.o.mode === 'side' ? S.W / 4 : S.W / 2, y: S.H / 2 });

  // geometria do corte: normal n, posição t ao longo dela, medida a partir do centro
  const ang = () => S.o.angle * Math.PI / 180;
  const span = () => Math.abs(S.W * Math.cos(ang())) + Math.abs(S.H * Math.sin(ang()));
  const tOf = p => (p - 0.5) * span();
  const proj = p => (p.x - S.W / 2) * Math.cos(ang()) + (p.y - S.H / 2) * Math.sin(ang());
  function band(t0, t1) {
    const nx = Math.cos(ang()), ny = Math.sin(ang()), L = S.W + S.H, cx = S.W / 2, cy = S.H / 2;
    ctx.beginPath();
    [[t0, -L], [t0, L], [t1, L], [t1, -L]].forEach(([t, u], i) => { const x = cx + nx * t - ny * u, y = cy + ny * t + nx * u; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath(); ctx.clip();
  }
  function tag(x, text, px, py, right, k) {
    k = k || 1; x.font = '600 ' + 13 * k + 'px Inter, system-ui, sans-serif';
    const w = x.measureText(text).width + 20 * k, h = 26 * k, X = right ? px - w : px;
    x.fillStyle = 'rgba(16,16,16,.78)'; x.beginPath(); if (x.roundRect) x.roundRect(X, py, w, h, 6 * k); else x.rect(X, py, w, h); x.fill();
    x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillText(text, X + 10 * k, py + h / 2 + 0.5);
  }

  function render() {
    const W = S.W, H = S.H, d = window.devicePixelRatio || 1;
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, W, H);
    if (!R() || !W) return;
    let a = A(), b = B(); const realB = b, m = S.o.mode, full = { x: 0, w: W };
    if (S.peek) [a, b] = [b, a];
    const put = (it, vp, alpha) => {
      vp = vp || full; const t = vt(vp);
      ctx.save(); ctx.beginPath(); ctx.rect(vp.x, 0, vp.w, H); ctx.clip();
      ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.transform(t.s, 0, 0, t.s, t.x, t.y);
      if (S.o.match && it === realB && a !== b && 'filter' in ctx) ctx.filter = 'brightness(' + S.k.toFixed(3) + ')';
      if (it.cv) ctx.drawImage(it.cv, 0, 0, R().w, R().h); else paint(ctx, it);
      ctx.restore();
    };
    const tags = []; // [texto, x, y, à direita]
    if (m === 'split') {
      const t = tOf(S.o.split), nx = Math.cos(ang()), ny = Math.sin(ang()), L = W + H, cx = W / 2 + nx * t, cy = H / 2 + ny * t;
      put(a); ctx.save(); band(t, L); put(b); ctx.restore();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.moveTo(cx + ny * L, cy - nx * L); ctx.lineTo(cx - ny * L, cy + nx * L); ctx.stroke(); ctx.shadowBlur = 0;
      if (!S.clean) {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 15, 0, 7); ctx.fill();
        ctx.fillStyle = '#101010'; ctx.font = '700 14px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('‹ ›', cx, cy + 0.5);
      }
      tags.push([a.label, 12, 12], [b.label, W - 12, 12, true]);
    } else if (m === 'fade') { put(a); put(b, full, S.o.opacity / 100); tags.push([a.label + ' + ' + b.label + ' a ' + S.o.opacity + ' %', 12, 12]); }
    else if (m === 'flicker') { const it = S.flip ? b : a; put(it); tags.push([it.label, 12, 12]); }
    else if (m === 'lens') {
      put(a); tags.push([a.label, 12, 12], [b.label + ' na lupa', W - 12, 12, true]);
      const h = S.hover || { x: W / 2, y: H / 2 }, r = S.o.lens / 2;
      ctx.save(); ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, 7); ctx.clip(); put(b); ctx.restore();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, 7); ctx.stroke();
    } else if (m === 'side') {
      put(a, { x: 0, w: W / 2 }); put(b, { x: W / 2, w: W / 2 });
      ctx.fillStyle = '#101010'; ctx.fillRect(W / 2 - 1, 0, 2, H);
      if (S.hover && !S.clean) {   // o mesmo ponto marcado nos dois painéis
        const hx = S.hover.x % (W / 2);
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1; ctx.beginPath();
        [hx, hx + W / 2].forEach(x => { ctx.moveTo(x - 12, S.hover.y); ctx.lineTo(x + 12, S.hover.y); ctx.moveTo(x, S.hover.y - 12); ctx.lineTo(x, S.hover.y + 12); });
        ctx.stroke();
      }
      tags.push([a.label, 12, 12], [b.label, W / 2 + 12, 12]);
    } else if (m === 'slices') {
      const list = S.imgs.length > 2 ? S.imgs : [a, b], n = Math.max(S.o.slices, list.length), sp = span();   // nunca menos fatias que imagens
      for (let i = 0; i < n; i++) { ctx.save(); band(-sp / 2 + sp * i / n - 0.5, -sp / 2 + sp * (i + 1) / n + 0.5); put(list[i % list.length]); ctx.restore(); }
      tags.push([list.map(it => it.label).join('  |  '), 12, 12]);
    } else if (m === 'diff') { put(S.layer ? { cv: S.layer } : a); tags.push(['Diferença: ' + a.label + ' × ' + b.label, 12, 12]); }
    else { put(realB); if (S.layer) put({ cv: S.layer }, full, 0.9); tags.push(['Vegetação: ' + A().label + ' → ' + realB.label, 12, 12]); }

    if (S.o.grid) {
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath();
      [1 / 3, 2 / 3].forEach(q => { ctx.moveTo(W * q, 0); ctx.lineTo(W * q, H); ctx.moveTo(0, H * q); ctx.lineTo(W, H * q); });
      ctx.stroke();
    }
    if (S.o.labels) tags.forEach(t => tag(ctx, t[0], t[1], t[2], t[3]));
  }
  function draw() {
    if (S.raf) return;
    S.raf = requestAnimationFrame(() => {
      S.raf = 0; render();
      if (R()) $('#st-zoom').textContent = 'Zoom ' + Math.round(vt(pane(S.hover || center())).s * 100) + ' %';
    });
  }

  // ---------- painel ----------
  function stats() {
    const s = S.stats, m = S.o.mode, b = B(); let h = '';
    if (S.imgs.length < 2) h = '<p class="hint">Adicione a segunda imagem para comparar.</p>';
    else if (m === 'diff' && s) h = '<p><strong>' + f1(s.pct) + ' %</strong> da área mudou acima do limiar.</p><p class="hint">Fundo escuro é a imagem A; em magenta, o que mudou. Se quase tudo acende, o alinhamento ou o brilho estão diferentes: tente "Igualar o brilho".</p>';
    else if (m === 'veg' && s) h = '<table class="tbl"><tr><td>Verde em A</td><td>' + f1(s.a) + ' %</td></tr><tr><td>Verde em B</td><td>' + f1(s.b) + ' %</td></tr><tr><td>Variação</td><td>' + (s.b >= s.a ? '+' : '−') + f1(Math.abs(s.b - s.a)) + ' p.p.</td></tr></table>' +
      '<ul class="legend"><li><i style="background:#199e70"></i>verde novo em B: ' + f1(s.gain) + ' %</li><li><i style="background:#d95926"></i>verde que sumiu: ' + f1(s.loss) + ' %</li><li><i style="background:#199e70;opacity:.35"></i>verde nas duas</li></ul>' +
      '<p class="hint">Estimativa pela cor dos pixels. Sombra, reflexo e luz diferente mudam o resultado.</p>';
    $('#stats').innerHTML = h;
    $('#al-read').textContent = !b || S.imgs.length < 2 ? '' : S.b === 0 ? 'B é a imagem de referência: o ajuste vale para a imagem A.'
      : 'Deslocamento ' + f1(b.al.dx) + ' px, ' + f1(b.al.dy) + ' px · escala ×' + b.al.scale.toFixed(3) + ' · giro ' + b.al.rot.toFixed(2) + '°' + (Math.abs(S.k - 1) > 0.02 ? ' · brilho de B: ×' + S.k.toFixed(2) : '');
  }
  function ui() {
    const m = S.o.mode;
    $('#empty').hidden = !!S.imgs.length; $('#work').hidden = !S.imgs.length;
    $$('#modes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
    $('#mode-title').textContent = MODES[m][0]; $('#mode-hint').textContent = MODES[m][1];
    $$('[data-for]').forEach(el => { el.hidden = !el.dataset.for.split(' ').includes(m); });
    $$('[data-o]').forEach(el => {
      const k = el.dataset.o;
      if (el.type === 'checkbox') el.checked = S.o[k];
      else { el.value = S.o[k]; el.previousElementSibling.textContent = FMT[k](S.o[k]); }
    });
    $('#move').setAttribute('aria-pressed', S.moveB);
    $('#anim').textContent = S.anim ? 'Parar' : 'Animar';
    stage.classList.toggle('moving', S.moveB);
  }
  function list() {
    $('#list').innerHTML = S.imgs.map((it, i) => '<div class="item"><img src="' + esc(it.url) + '" alt=""><div>' +
      '<input class="inp" data-lab="' + i + '" value="' + esc(it.label) + '" aria-label="Legenda da imagem ' + (i + 1) + '">' +
      '<small>' + it.w + ' × ' + it.h + (i ? '' : ' · referência') + '</small><div class="pick">' +
      '<button type="button" data-pick="a" data-i="' + i + '" aria-pressed="' + (S.a === i) + '">A</button>' +
      '<button type="button" data-pick="b" data-i="' + i + '" aria-pressed="' + (S.b === i && S.imgs.length > 1) + '">B</button>' +
      '<button type="button" data-del="' + i + '" aria-label="Remover ' + esc(it.label) + '">✕</button></div></div></div>').join('');
  }
  function flicker() { clearInterval(S.ft); if (S.o.mode === 'flicker') S.ft = setInterval(() => { S.flip = !S.flip; draw(); }, 1000 / S.o.speed); }
  function refresh() { ui(); list(); size(); flicker(); analyze(); draw(); }
  function setMode(m) { stopAnim(); S.o.mode = m; save(); ui(); flicker(); analyze(); draw(); }

  // o alvo do ajuste manual é B; se B for a referência, é A que se move
  const target = () => (S.b === 0 ? A() : B());
  function nudge(axis, dir, big) {
    const it = target(); if (!it || it === R()) return;
    const step = Math.max(1, Math.round(R().w / 1500)) * (big ? 10 : 1);
    if (axis === 'dx') it.al.dx += dir * step; else if (axis === 'dy') it.al.dy += dir * step;
    else if (axis === 'scale') it.al.scale = clamp(it.al.scale * (1 + 0.001 * dir), 0.5, 2);
    else it.al.rot = clamp(it.al.rot + 0.05 * dir, -15, 15);
    analyze(); draw();
  }

  // ---------- animação e exportação ----------
  function sweep(ms, loop, done) {
    const key = S.o.mode === 'fade' ? 'opacity' : 'split', max = key === 'opacity' ? 100 : 1, keep = S.o[key], t0 = performance.now();
    const step = now => {
      const u = (now - t0) / ms, tri = 1 - Math.abs(1 - 2 * (loop ? u % 1 : Math.min(u, 1)));
      S.o[key] = key === 'opacity' ? Math.round(tri * max) : 0.04 + tri * 0.92;
      ui(); render();
      if (!loop && u >= 1) { S.anim = 0; S.o[key] = keep; ui(); draw(); if (done) done(); return; }
      S.anim = requestAnimationFrame(step);
    };
    S.anim = requestAnimationFrame(step);
  }
  function stopAnim() { if (S.anim) { cancelAnimationFrame(S.anim); S.anim = 0; ui(); } }
  function dl(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  function viewPng() { S.clean = true; render(); cv.toBlob(b => dl(b, 'comparacao.png')); S.clean = false; render(); }
  function pairPng() {
    const r = R(), w = Math.min(r.w, 1920), q = w / r.w, h = Math.round(r.h * q), g = Math.round(w * 0.01), c = off(w * 2 + g, h), x = c.getContext('2d');
    x.fillStyle = '#101010'; x.fillRect(0, 0, c.width, h);
    [A(), B()].forEach((it, i) => {
      x.save(); x.beginPath(); x.rect(i * (w + g), 0, w, h); x.clip(); x.setTransform(q, 0, 0, q, i * (w + g), 0);
      if (i && S.o.match && 'filter' in x) x.filter = 'brightness(' + S.k.toFixed(3) + ')';
      paint(x, it); x.restore();
      if (S.o.labels) tag(x, it.label, i * (w + g) + 20, 20, false, 2);
    });
    c.toBlob(b => dl(b, 'lado-a-lado.png'));
  }
  function record() {
    const m = S.o.mode;
    if (!cv.captureStream || !window.MediaRecorder) return msg('Este navegador não grava vídeo.');
    if (!['split', 'fade', 'flicker'].includes(m)) return msg('Gravação disponível em Cortina, Transparência e Piscar.');
    stopAnim();
    const rec = new MediaRecorder(cv.captureStream(30)), parts = [];
    rec.ondataavailable = e => parts.push(e.data);
    rec.onstop = () => { S.clean = false; draw(); dl(new Blob(parts, { type: rec.mimeType }), 'comparacao.' + (/mp4/.test(rec.mimeType) ? 'mp4' : 'webm')); msg('Vídeo gravado.'); };
    S.clean = true; rec.start(); msg('Gravando...');
    if (m === 'flicker') setTimeout(() => rec.stop(), 5000); else sweep(6000, false, () => rec.stop());
  }

  // ---------- exemplo sintético: mesma cena em duas estações, a segunda um pouco fora de posição ----------
  function demoScene(dry) {
    const c = off(1280, 720), x = c.getContext('2d'); let seed = 11;
    const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    x.fillStyle = dry ? '#7d7455' : '#3d7f38'; x.fillRect(0, 0, 1280, 720);
    if (dry) { x.translate(640, 360); x.rotate(0.012); x.scale(1.02, 1.02); x.translate(-622, -372); }
    const sky = x.createLinearGradient(0, 0, 0, 330); sky.addColorStop(0, dry ? '#aab6c4' : '#dfe7ee'); sky.addColorStop(1, '#f2f4f5');
    x.fillStyle = sky; x.fillRect(-80, -80, 1440, 420);
    x.fillStyle = dry ? '#7d7455' : '#3d7f38'; x.fillRect(-80, 330, 1440, 480);
    for (let i = 0; i < 70; i++) {
      const tx = rnd() * 1380 - 50, ty = 250 + rnd() * 110, r = 28 + rnd() * 42, hue = 100 + rnd() * 35, lum = 26 + rnd() * 16, dead = rnd() < 0.6;
      x.strokeStyle = '#5b4632'; x.lineWidth = 5; x.beginPath(); x.moveTo(tx, ty + r); x.lineTo(tx, ty + r + 40); x.stroke();
      x.fillStyle = dry && dead ? 'hsl(' + (22 + hue / 12) + ',38%,' + (lum + 8) + '%)' : 'hsl(' + hue + ',48%,' + lum + '%)';
      x.beginPath(); x.arc(tx, ty, r, 0, 7); x.fill();
    }
    x.fillStyle = '#b9b4a8'; x.fillRect(500, 320, 260, 110); x.fillStyle = '#e4e2dc'; x.fillRect(490, 300, 280, 26);
    x.fillStyle = '#2f3440'; [[[40, 460], [560, 380], [640, 520], [60, 700]], [[720, 420], [980, 370], [1200, 700], [560, 700]]].forEach(p => {
      x.beginPath(); p.forEach((q, i) => (i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]))); x.closePath(); x.fill();
    });
    return new Promise(res => c.toBlob(res, 'image/jpeg', 0.92));
  }
  async function loadDemo() {
    S.imgs.forEach(it => URL.revokeObjectURL(it.url)); S.imgs = []; S.a = 0; S.b = 1; S.view = { z: 1, x: 0, y: 0 };
    await addImage(URL.createObjectURL(await demoScene(false)), 'Estação úmida (exemplo)');
    await addImage(URL.createObjectURL(await demoScene(true)), 'Estação seca (exemplo)');
    refresh();
  }

  // ---------- eventos ----------
  function size() {
    const rc = stage.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    if (!rc.width) return;
    S.W = rc.width; S.H = rc.height; cv.width = Math.round(rc.width * d); cv.height = Math.round(rc.height * d);
    render();
  }
  const pos = e => { const rc = stage.getBoundingClientRect(); return { x: e.clientX - rc.left, y: e.clientY - rc.top }; };
  const pts = new Map();
  const pinch = () => { const p = [...pts.values()]; return { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), c: { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 } }; };

  function init() {
    ui();
    new ResizeObserver(size).observe(stage);

    $('#file').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
    $('#demo').addEventListener('click', loadDemo);
    $('#empty').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } });
    ['dragenter', 'dragover'].forEach(n => window.addEventListener(n, e => { e.preventDefault(); document.body.classList.add('dropping'); }));
    ['dragleave', 'drop'].forEach(n => window.addEventListener(n, e => { e.preventDefault(); document.body.classList.remove('dropping'); }));
    window.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); });
    window.addEventListener('paste', e => { const fs = [...(e.clipboardData ? e.clipboardData.files : [])]; if (fs.length) addFiles(fs); });

    $('#modes').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
    document.addEventListener('input', e => {
      const el = e.target;
      if (el.dataset.o) {
        S.o[el.dataset.o] = el.type === 'checkbox' ? el.checked : +el.value; save(); ui();
        if (el.dataset.o === 'speed') flicker();
        if (['thr', 'gain', 'vthr', 'match'].includes(el.dataset.o)) analyze();
        draw();
      } else if (el.dataset.lab) { S.imgs[+el.dataset.lab].label = el.value; draw(); }
    });
    $('#list').addEventListener('click', e => {
      const p = e.target.closest('[data-pick]'), d = e.target.closest('[data-del]');
      if (d) return removeAt(+d.dataset.del);
      if (!p) return;
      const i = +p.dataset.i, k = p.dataset.pick, other = k === 'a' ? 'b' : 'a';
      if (S[other] === i) S[other] = S[k];   // escolher a mesma imagem nos dois lados troca as posições
      S[k] = i; list(); analyze(); draw();
    });
    $('#swap').addEventListener('click', () => { [S.a, S.b] = [S.b, S.a]; list(); analyze(); draw(); });
    $('#clear').addEventListener('click', () => { if (!confirm('Remover todas as imagens?')) return; S.imgs.forEach(it => URL.revokeObjectURL(it.url)); S.imgs = []; S.a = 0; S.b = 1; msg(''); refresh(); });
    $('#align').addEventListener('click', () => { const it = target(); if (autoAlign(it)) msg('Alinhado.'); else if (S.imgs.length < 2) msg('Adicione a segunda imagem.'); analyze(); draw(); });
    $('#zero').addEventListener('click', () => { const it = target(); if (it && it !== R()) it.al = { dx: 0, dy: 0, scale: 1, rot: 0 }; analyze(); draw(); });
    $('#move').addEventListener('click', () => { S.moveB = !S.moveB; ui(); });
    $('.nudge').addEventListener('click', e => { const b = e.target.closest('[data-n]'); if (!b) return; const [ax, d] = b.dataset.n.split(','); nudge(ax, +d, e.shiftKey); });
    $('#anim').addEventListener('click', () => { if (S.anim) stopAnim(); else { sweep(5000, true); ui(); } });
    $('#fit').addEventListener('click', fit);
    $('#real').addEventListener('click', () => { const c = center(); zoomAt(c, 1 / vt(pane(c)).s); });
    $('#full').addEventListener('click', fullscreen);
    $('#png').addEventListener('click', viewPng);
    $('#pair').addEventListener('click', pairPng);
    $('#rec').addEventListener('click', record);

    stage.addEventListener('pointerdown', e => {
      if (!R()) return;
      stage.setPointerCapture(e.pointerId); const p = pos(e); pts.set(e.pointerId, p);
      if (pts.size === 2) { S.drag = { k: 'pinch', d: pinch().d }; return; }
      S.drag = S.o.mode === 'split' && Math.abs(proj(p) - tOf(S.o.split)) < 24 ? { k: 'split' } : S.moveB || e.altKey ? { k: 'align', p } : { k: 'pan', p };
      if (S.drag.k === 'split') stopAnim();
    });
    stage.addEventListener('pointermove', e => {
      const p = pos(e); if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
      S.hover = p;
      const g = S.drag;
      if (g && g.k === 'pinch' && pts.size === 2) { const q = pinch(); zoomAt(q.c, q.d / g.d); g.d = q.d; }
      else if (g && g.k === 'split') S.o.split = clamp(proj(p) / span() + 0.5, 0, 1);
      else if (g && g.k === 'pan') { S.view.x += p.x - g.p.x; S.view.y += p.y - g.p.y; g.p = p; }
      else if (g && g.k === 'align') { const it = target(), s = vt(pane(p)).s; if (it && it !== R()) { it.al.dx += (p.x - g.p.x) / s; it.al.dy += (p.y - g.p.y) / s; } g.p = p; }
      if (R()) { const t = vt(pane(p)); $('#st-pos').textContent = 'x ' + Math.round((p.x - t.x) / t.s) + ', y ' + Math.round((p.y - t.y) / t.s); }
      draw();
    });
    const up = e => { pts.delete(e.pointerId); if (S.drag && S.drag.k === 'align') analyze(); if (S.drag && S.drag.k === 'split') save(); S.drag = null; };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('pointerleave', () => { S.hover = null; $('#st-pos').textContent = ''; draw(); });
    stage.addEventListener('wheel', e => { e.preventDefault(); zoomAt(pos(e), Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    stage.addEventListener('dblclick', fit);

    window.addEventListener('keydown', e => {
      const t = e.target; if (!R() || e.ctrlKey || e.metaKey || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const k = e.key, arrows = { ArrowLeft: ['dx', -1], ArrowRight: ['dx', 1], ArrowUp: ['dy', -1], ArrowDown: ['dy', 1] };
      if (k === ' ') { e.preventDefault(); if (!S.peek) { S.peek = true; draw(); } }
      else if (arrows[k] && e.shiftKey) { e.preventDefault(); nudge(arrows[k][0], arrows[k][1]); }
      else if ((k === 'ArrowLeft' || k === 'ArrowRight') && S.o.mode === 'split') { e.preventDefault(); S.o.split = clamp(S.o.split + (k === 'ArrowLeft' ? -0.02 : 0.02), 0, 1); draw(); }
      else if (k >= '1' && k <= '8') setMode(Object.keys(MODES)[+k - 1]);
      else if (k === '+' || k === '=') zoomAt(center(), 1.25);
      else if (k === '-') zoomAt(center(), 0.8);
      else if (k === '0') fit();
      else if (k === 'a') $('#align').click();
      else if (k === 's') $('#swap').click();
      else if (k === 'f') fullscreen();
      else if (k === 'g' || k === 'l') { const o = k === 'g' ? 'grid' : 'labels'; S.o[o] = !S.o[o]; save(); ui(); draw(); }
    });
    window.addEventListener('keyup', e => { if (e.key === ' ' && S.peek) { S.peek = false; draw(); } });
    window.addEventListener('blur', () => { S.peek = false; draw(); });

    const sb = typeof getSupabaseClient === 'function' && window.supabase ? getSupabaseClient() : null;
    if (sb) sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') window.location.href = CONFIG.PORTAL_URL; });
  }
  function fullscreen() { const w = $('#stage-wrap'); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen(); }
  init();
})();
