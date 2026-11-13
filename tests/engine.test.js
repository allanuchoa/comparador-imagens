// Teste do motor. Rodar: node tests/engine.test.js
const assert = require('assert');
const CMP = require('../engine.js');
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

// cena sintética suave e determinística
const gw = 192, gh = 108;
const scene = (x, y) => 128 + 60 * Math.sin(x * 0.11) * Math.cos(y * 0.17) + 40 * Math.sin((x + 2 * y) * 0.05) + 25 * Math.cos(x * 0.31 - y * 0.07);
const grid = (ox, oy) => { const g = new Float32Array(gw * gh); for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) g[y * gw + x] = scene(x - ox, y - oy); return g; };

// b é a deslocada de (+6, -4): o alinhamento precisa achar isso, sem inventar escala ou rotação
const r = CMP.computeAlign(grid(0, 0), grid(6, -4), gw, gh);
near(r.dx, 6, 0.6); near(r.dy, -4, 0.6); near(r.scale, 1, 0.011); near(r.rot, 0, 0.21);
// imagens iguais: nada a corrigir
const z = CMP.computeAlign(grid(0, 0), grid(0, 0), gw, gh);
near(z.dx, 0, 0.2); near(z.dy, 0, 0.2);

// RGBA de 4 pixels: [vegetação, vegetação, solo, transparente]
const px = (...c) => Uint8ClampedArray.from(c.flat());
const G = [40, 160, 40, 255], S = [150, 120, 90, 255], T = [0, 0, 0, 0];
const a = px(G, G, S, T), b = px(G, S, G, G);
const v = CMP.vegMap(a, b, 4, 0.08);
near(v.a, 200 / 3, 1e-6); near(v.b, 200 / 3, 1e-6); near(v.gain, 100 / 3, 1e-6); near(v.loss, 100 / 3, 1e-6);
assert.strictEqual(v.out[15], 0); // pixel sem par fica transparente
assert.deepStrictEqual([...v.out.slice(4, 8)], CMP.VEG.loss);

// diferença: iguais não acusam nada; o pixel trocado acusa; transparente não conta
assert.strictEqual(CMP.diffMap(a, a, 4, 20, 3, 1).pct, 0);
near(CMP.diffMap(a, b, 4, 20, 3, 1).pct, 200 / 3, 1e-6);
// exposição: b com metade do brilho pede ganho 2, e com esse ganho a diferença some
const dark = a.map((x, i) => i % 4 === 3 ? x : x / 2);
near(CMP.exposure(a, dark, 4), 2, 0.02);
assert.strictEqual(CMP.diffMap(a, dark, 4, 20, 3, CMP.exposure(a, dark, 4)).pct, 0);
assert.strictEqual(CMP.gray(T, 1)[0], 128);

console.log('engine.test.js: OK');
