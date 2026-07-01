import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const { sin, cos, sqrt, abs, min, max, round, PI } = Math;

// --- SVG Path Data (exact from reference) ---
const SVG_WIDTH = 1741;
const SVG_HEIGHT = 1306;

const SVG_PATHS = [
  "M0 600.572C60.7647 473.242 292.453 357.629 733.092 913.822C1173.73 1470.01 1587.86 1203.58 1739.84 1000.84",
  "M0 541.885C60.7647 414.555 362.935 352.844 803.573 909.036C1244.21 1465.23 1673.13 995.181 1825.12 792.439",
  "M0 473.393C60.7647 346.063 374.665 287.323 852.736 890.763C1293.37 1446.96 1697.93 767.203 1849.91 564.461",
  "M0 422.253C60.7647 294.923 365.458 201.614 911.905 892.502C1306.23 1391.06 1684.88 574.033 1836.86 371.291",
  "M0 353.622C60.7647 226.292 342.162 130.731 911.905 823.871C1351.32 1358.46 1672.84 363.024 1786.35 114.164",
  "M0 245.29C60.7647 117.96 360.672 36.7221 928.002 758.067C1355.8 1302 1587.94 107.638 1701.45 -141.221",
];

// Parse SVG path string into points — high resolution for smoothness
function parseSVGPath(d) {
  const nums = d.replace(/[MC]/g, ' ').trim().split(/[\s,]+/).map(Number);
  const points = [];
  let idx = 0;
  const mx = nums[idx++], my = nums[idx++];
  points.push({ x: mx, y: my });

  while (idx + 5 < nums.length) {
    const cp1x = nums[idx++], cp1y = nums[idx++];
    const cp2x = nums[idx++], cp2y = nums[idx++];
    const ex = nums[idx++], ey = nums[idx++];
    const p0 = points[points.length - 1];
    const STEPS = 200; // high resolution for smooth lines
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      const t2 = t * t, t3 = t2 * t;
      const mt = 1 - t, mt2 = mt * mt, mt3 = mt2 * mt;
      const x = mt3 * p0.x + 3 * mt2 * t * cp1x + 3 * mt * t2 * cp2x + t3 * ex;
      const y = mt3 * p0.y + 3 * mt2 * t * cp1y + 3 * mt * t2 * cp2y + t3 * ey;
      points.push({ x, y });
    }
  }
  return points;
}

// Parse all SVG paths once
const parsedSVGPaths = SVG_PATHS.map(parseSVGPath);
// Normalize all paths to same point count
const maxPtCount = Math.max(...parsedSVGPaths.map(p => p.length));
function resamplePath(pts, count) {
  if (pts.length === count) return pts;
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const idx = t * (pts.length - 1);
    const lo = Math.floor(idx), hi = Math.min(lo + 1, pts.length - 1);
    const f = idx - lo;
    out.push({ x: pts[lo].x + (pts[hi].x - pts[lo].x) * f, y: pts[lo].y + (pts[hi].y - pts[lo].y) * f });
  }
  return out;
}
const normalizedPaths = parsedSVGPaths.map(p => resamplePath(p, maxPtCount));

const SCENE_W = 174.1;
const SCENE_H = 130.6;

function svgToScene(px, py) {
  return {
    x: (px / SVG_WIDTH) * SCENE_W - SCENE_W / 2,
    y: -((py / SVG_HEIGHT) * SCENE_H - SCENE_H / 2),
  };
}

// Interpolate between two SVG paths
function lerpPath(pathA, pathB, t) {
  return pathA.map((p, i) => ({
    x: p.x + (pathB[i].x - p.x) * t,
    y: p.y + (pathB[i].y - p.y) * t,
  }));
}

// Generate N evenly distributed lines by interpolating SVG paths
function generateLinePaths(count) {
  const paths = [];
  const srcCount = normalizedPaths.length;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const mapped = t * (srcCount - 1);
    const lo = Math.floor(mapped), hi = Math.min(lo + 1, srcCount - 1);
    const f = mapped - lo;
    const interpolated = lerpPath(normalizedPaths[lo], normalizedPaths[hi], f);
    paths.push(interpolated.map(p => svgToScene(p.x, p.y)));
  }
  return paths;
}

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const aspect = innerWidth / innerHeight;
const boxAspect = SCENE_W / SCENE_H;
let camW, camH;
if (aspect > boxAspect) {
  camH = SCENE_H / 2;
  camW = camH * aspect;
} else {
  camW = SCENE_W / 2;
  camH = camW / aspect;
}
const camera = new THREE.OrthographicCamera(-camW, camW, camH, -camH, 0.1, 100);
camera.position.set(0, 0, 50);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const root = document.getElementById('root') ?? document.body;
Object.assign(root.style, { margin: '0', overflow: 'hidden', background: '#000' });
root.appendChild(renderer.domElement);

// --- Built-in presets (locked, separate from localStorage) ---
const BUILT_IN_PRESETS = {
  'Essex': {
    bloomStrength: 0.55, bloomRadius: 0.77, glowIntensity: 1.5,
    energySpeed: 1.1, lineColor: { r: 0.3411764705882353, g: 0.3411764705882353, b: 0.3411764705882353 },
    lineBrightness: 0.45, energyColor: { r: 0.64, g: 0.56, b: 0.3 },
    energyDispersion: 0.8, energyQuantity: 7, flowDirection: 205, lineCount: 6,
    waveAmount: 0.4, bgColor: { r: 0, g: 0, b: 0 }, bgOpacity: 1,
  },
};

// Essex is the default on page load
const DEFAULT_PRESET = BUILT_IN_PRESETS['Essex'];

const MG = 20;

const P = JSON.parse(JSON.stringify(DEFAULT_PRESET));

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), P.bloomStrength, P.bloomRadius, 0.2);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const fRad = P.flowDirection * PI / 180;
const U = {
  uGlowIntensity: { value: P.glowIntensity },
  uEnergySpeed: { value: P.energySpeed },
  uTime: { value: 0 },
  uLineColor: { value: new THREE.Vector3(P.lineColor.r, P.lineColor.g, P.lineColor.b) },
  uLineBrightness: { value: P.lineBrightness },
  uEnergyColor: { value: new THREE.Vector3(P.energyColor.r, P.energyColor.g, P.energyColor.b) },
  uEnergyDispersion: { value: P.energyDispersion },
  uEnergyQuantity: { value: P.energyQuantity },
  uFlowDir: { value: new THREE.Vector2(cos(fRad), sin(fRad)) },
  uWaveAmount: { value: P.waveAmount },
};

// Ribbon line material — thick smooth lines via extruded mesh strips
const lineMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
  side: THREE.DoubleSide,
  vertexShader: `
    attribute float aAlpha, aArcLength, aLineId, aSide;
    uniform vec2 uFlowDir;
    uniform float uTime, uWaveAmount;
    varying float vAlpha, vArcLength, vLineId, vFlowPos, vEdge;
    void main(){
      vec3 pos = position;
      float wave = sin(pos.x * 0.04 + uTime * 0.15 + aLineId * 1.7) * uWaveAmount;
      wave += sin(pos.x * 0.02 - uTime * 0.1 + aLineId * 0.9) * uWaveAmount * 0.6;
      pos.y += wave;
      vAlpha = aAlpha;
      vArcLength = aArcLength;
      vLineId = aLineId;
      vEdge = aSide;
      vFlowPos = dot(pos.xy, uFlowDir) + 200.0;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uGlowIntensity, uEnergySpeed, uTime, uLineBrightness, uEnergyDispersion, uEnergyQuantity;
    uniform vec3 uLineColor, uEnergyColor;
    varying float vAlpha, vArcLength, vLineId, vFlowPos, vEdge;
    float hash(float n){ return fract(sin(n)*17503.4); }
    void main(){
      // Soft organic glow falloff — Gaussian curve from center to edges
      float dist = abs(vEdge); // 0 at center, 1 at edges
      float edgeFade = exp(-dist * dist * 2.0);
      vec3 base = uLineColor * uLineBrightness;
      float ga = 0.0;
      int qty = int(uEnergyQuantity);
      float wl = 600.0;
      for(int i = 0; i < ${MG}; i++){
        if(i >= qty) break;
        float fi = float(i), seed = vLineId * 7.31 + fi * 13.17, h = hash(seed);
        float spd = (18.0 + abs(sin(seed)) * 10.0 * uEnergyDispersion) * uEnergySpeed;
        float off = mix(fi * (wl / max(uEnergyQuantity, 1.0)), h * wl, uEnergyDispersion);
        float pw = sin(seed * 0.5 + uTime * (0.3 + h * 0.5)) * 12.0 * uEnergyDispersion;
        float p = mod(uTime * spd + off + pw, wl), d = abs(vFlowPos - p);
        d = min(d, wl - d);
        ga += exp(-d * d * 0.15);
      }
      float cg = min(ga, 1.0) * uGlowIntensity;
      vec3 fc = mix(base, uEnergyColor, cg * 0.9) + uEnergyColor * cg * 0.4;
      float ab = vAlpha * 0.4 * uLineBrightness;
      float af = max(ab, cg * 0.95 * vAlpha) * edgeFade;
      gl_FragColor = vec4(fc, af);
    }
  `,
});

// --- Build lines ---
const lineGroup = new THREE.Group();
lineGroup.name = 'lineGroup';
scene.add(lineGroup);

// Store base positions for wave animation
let lineBaseData = [];

// Build ribbon geometry from a polyline — extrudes each segment into a quad strip
function buildRibbonGeometry(pts, lineId, halfWidth) {
  const n = pts.length;
  // Compute normals at each point (perpendicular to tangent)
  const normals = [];
  for (let j = 0; j < n; j++) {
    let tx, ty;
    if (j === 0) { tx = pts[1].x - pts[0].x; ty = pts[1].y - pts[0].y; }
    else if (j === n - 1) { tx = pts[n-1].x - pts[n-2].x; ty = pts[n-1].y - pts[n-2].y; }
    else { tx = pts[j+1].x - pts[j-1].x; ty = pts[j+1].y - pts[j-1].y; }
    const len = sqrt(tx * tx + ty * ty) || 1;
    normals.push({ x: -ty / len, y: tx / len });
  }

  const vertCount = n * 2;
  const triCount = (n - 1) * 2;
  const pos = new Float32Array(vertCount * 3);
  const alp = new Float32Array(vertCount);
  const arc = new Float32Array(vertCount);
  const lid = new Float32Array(vertCount);
  const side = new Float32Array(vertCount);
  const idx = new Uint32Array(triCount * 3);

  let cum = 0;
  for (let j = 0; j < n; j++) {
    if (j > 0) {
      const dx = pts[j].x - pts[j-1].x, dy = pts[j].y - pts[j-1].y;
      cum += sqrt(dx * dx + dy * dy);
    }
    const nx = normals[j].x * halfWidth, ny = normals[j].y * halfWidth;
    const v0 = j * 2, v1 = j * 2 + 1;
    // Top side
    pos[v0 * 3]     = pts[j].x + nx;
    pos[v0 * 3 + 1] = pts[j].y + ny;
    pos[v0 * 3 + 2] = 0;
    // Bottom side
    pos[v1 * 3]     = pts[j].x - nx;
    pos[v1 * 3 + 1] = pts[j].y - ny;
    pos[v1 * 3 + 2] = 0;

    alp[v0] = 1; alp[v1] = 1;
    arc[v0] = cum; arc[v1] = cum;
    lid[v0] = lineId; lid[v1] = lineId;
    side[v0] = -1.0; side[v1] = 1.0; // -1 at top edge, +1 at bottom edge, interpolates through 0 at center
  }

  for (let j = 0; j < n - 1; j++) {
    const a = j * 2, b = a + 1, c = a + 2, d = a + 3;
    const ti = j * 6;
    idx[ti] = a; idx[ti+1] = b; idx[ti+2] = c;
    idx[ti+3] = c; idx[ti+4] = b; idx[ti+5] = d;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
  g.setAttribute('aArcLength', new THREE.BufferAttribute(arc, 1));
  g.setAttribute('aLineId', new THREE.BufferAttribute(lid, 1));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

const LINE_HALF_WIDTH = 0.35; // ribbon half-width in scene units

function buildLines(count) {
  while (lineGroup.children.length) {
    const c = lineGroup.children[0];
    c.geometry.dispose();
    lineGroup.remove(c);
  }
  lineBaseData = [];

  const paths = generateLinePaths(count);

  paths.forEach((pts, i) => {
    const g = buildRibbonGeometry(pts, i, LINE_HALF_WIDTH);
    const mesh = new THREE.Mesh(g, lineMat);
    mesh.name = `svgLine_${i}`;
    mesh.frustumCulled = false;
    lineGroup.add(mesh);
  });
}

buildLines(P.lineCount);

// --- UI Helpers ---
const BF = 'Inter,system-ui,-apple-system,sans-serif';
const toHex = v => round(v * 255).toString(16).padStart(2, '0');
const rgb2hex = (r, g, b) => '#' + toHex(r) + toHex(g) + toHex(b);
const hex2rgb = h => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });

const QS = k => new URLSearchParams(location.search).get(k);
const el = (t, s, txt) => { const e = document.createElement(t); if (s) Object.assign(e.style, s); if (txt) e.textContent = txt; return e; };
const sRefs = {}, pRefs = {};

function hoverBtn(b, hBg, hBc, hC, nBg, nBc, nC) {
  b.onmouseenter = () => { b.style.background = hBg; if (hBc) b.style.borderColor = hBc; if (hC) b.style.color = hC; };
  b.onmouseleave = () => { b.style.background = nBg; if (nBc) b.style.borderColor = nBc; if (nC) b.style.color = nC; };
}

const panel = el('div', {
  position: 'fixed', bottom: '16px', right: '16px', background: 'rgba(8,10,18,0.85)',
  border: '1px solid rgba(0,180,220,0.2)', borderRadius: '8px', padding: '16px 20px',
  fontFamily: BF, fontSize: '12px', color: 'rgba(160,210,230,0.9)', zIndex: '1000',
  minWidth: '220px', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', userSelect: 'none',
  display: 'block',
});

let panelVisible = true;
addEventListener('keydown', e => {
  if (e.key === 'c' || e.key === 'C') {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    panelVisible = !panelVisible;
    panel.style.display = panelVisible ? 'block' : 'none';
  }
});

document.head.appendChild(Object.assign(document.createElement('style'), {
  textContent: '#controlPanel::-webkit-scrollbar{width:4px}#controlPanel::-webkit-scrollbar-track{background:transparent}#controlPanel::-webkit-scrollbar-thumb{background:rgba(0,180,220,0.2);border-radius:2px}'
}));

function mkSection(text) {
  const w = el('div', { marginTop: '4px' });
  const h = el('div', {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontSize: '10px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase',
    color: 'rgba(0,200,240,0.4)', padding: '10px 0 8px 0',
    borderTop: '1px solid rgba(0,180,220,0.08)', cursor: 'pointer', userSelect: 'none', transition: 'color 0.2s',
  });
  h.onmouseenter = () => h.style.color = 'rgba(0,200,240,0.7)';
  h.onmouseleave = () => h.style.color = 'rgba(0,200,240,0.4)';
  const ar = el('span', { fontSize: '10px', transition: 'transform 0.25s ease', transform: 'rotate(0deg)', lineHeight: '1' }, '▸');
  h.append(el('span', null, text), ar);
  const c = el('div', { overflow: 'hidden', maxHeight: '0', transition: 'max-height 0.3s ease' });
  let open = false;
  h.onclick = () => { open = !open; ar.style.transform = open ? 'rotate(90deg)' : 'rotate(0deg)'; c.style.maxHeight = open ? c.scrollHeight + 'px' : '0'; };
  w.append(h, c);
  return { w, c };
}

function mkSlider(label, mn, mx, step, val, cb, key) {
  const row = el('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '10px' });
  const vD = el('span', { flex: '0 0 36px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'rgba(0,210,255,0.8)' }, step >= 1 ? round(val).toString() : val.toFixed(2));
  const s = el('input', { flex: '1 1 80px', accentColor: '#00c8e0', height: '3px', cursor: 'pointer' });
  s.type = 'range'; s.min = mn; s.max = mx; s.step = step; s.value = val;
  s.oninput = () => { const v = parseFloat(s.value); vD.textContent = step >= 1 ? round(v).toString() : v.toFixed(2); cb(v); };
  if (key) sRefs[key] = { slider: s, display: vD };
  row.append(el('span', { flex: '0 0 auto', letterSpacing: '0.3px' }, label), s, vD);
  return row;
}

function mkColor(label, hex, cb, key) {
  const row = el('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '10px' });
  const p = el('input', { flex: '0 0 32px', height: '22px', border: '1px solid rgba(0,180,220,0.3)', borderRadius: '4px', background: 'transparent', cursor: 'pointer', padding: '0' });
  p.type = 'color'; p.value = hex; p.oninput = () => cb(p.value);
  if (key) pRefs[key] = p;
  row.append(el('span', { flex: '0 0 auto', letterSpacing: '0.3px' }, label), p);
  return row;
}

function toast(msg) {
  document.getElementById('toast')?.remove();
  const t = el('div', { position: 'fixed', bottom: '70px', right: '16px', background: 'rgba(0,200,240,0.15)', border: '1px solid rgba(0,200,240,0.3)', borderRadius: '6px', padding: '8px 16px', fontFamily: BF, fontSize: '11px', fontWeight: '500', color: 'rgba(0,230,255,0.9)', zIndex: '2000', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', opacity: '0', transform: 'translateY(8px)', transition: 'opacity 0.25s,transform 0.25s', pointerEvents: 'none' }, msg);
  t.id = 'toast'; document.body.append(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; setTimeout(() => t.remove(), 300); }, 1600);
}

// --- Build control panel ---
panel.appendChild(el('div', { fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(0,200,240,0.6)', marginBottom: '14px', borderBottom: '1px solid rgba(0,180,220,0.1)', paddingBottom: '8px' }, 'Controls'));

const sections = [
  ['Bloom', [
    ['Strength', 0, 3, 0.05, 'bloomStrength', v => { P.bloomStrength = v; bloomPass.strength = v; }],
    ['Radius', 0.1, 1.0, 0.01, 'bloomRadius', v => { P.bloomRadius = v; bloomPass.radius = v; }],
  ]],
  ['Lines', [
    ['Count', 1, 24, 1, 'lineCount', v => { P.lineCount = round(v); buildLines(P.lineCount); }],
    ['Brightness', 0.05, 1.5, 0.05, 'lineBrightness', v => { P.lineBrightness = v; U.uLineBrightness.value = v; }],
    ['Wave Motion', 0.0, 2.0, 0.05, 'waveAmount', v => { P.waveAmount = v; U.uWaveAmount.value = v; }],
    ['$lineColor'],
    ['$bgColor'],
    ['Bg Opacity', 0.0, 1.0, 0.05, 'bgOpacity', v => { P.bgOpacity = v; applyBackground(); }],
  ]],
  ['Energy Lights', [
    ['Glow', 0.1, 2.5, 0.05, 'glowIntensity', v => { P.glowIntensity = v; U.uGlowIntensity.value = v; }],
    ['Speed', 0.0, 3.0, 0.05, 'energySpeed', v => { P.energySpeed = v; U.uEnergySpeed.value = v; }],
    ['Quantity', 1, MG, 1, 'energyQuantity', v => { P.energyQuantity = round(v); U.uEnergyQuantity.value = P.energyQuantity; }],
    ['Dispersion', 0.0, 1.0, 0.02, 'energyDispersion', v => { P.energyDispersion = v; U.uEnergyDispersion.value = v; }],
    ['Direction', 0, 360, 1, 'flowDirection', v => { P.flowDirection = v; const r = v * PI / 180; U.uFlowDir.value.set(cos(r), sin(r)); }],
    ['$energyColor'],
  ]],
];

const colorMap = {
  '$lineColor': ['Line Color', () => rgb2hex(P.lineColor.r, P.lineColor.g, P.lineColor.b), h => { const c = hex2rgb(h); P.lineColor = c; U.uLineColor.value.set(c.r, c.g, c.b); }, 'lineColor'],
  '$energyColor': ['Light Color', () => rgb2hex(P.energyColor.r, P.energyColor.g, P.energyColor.b), h => { const c = hex2rgb(h); P.energyColor = c; U.uEnergyColor.value.set(c.r, c.g, c.b); }, 'energyColor'],
  '$bgColor': ['Background', () => rgb2hex(P.bgColor.r, P.bgColor.g, P.bgColor.b), h => { const c = hex2rgb(h); P.bgColor = c; applyBackground(); }, 'bgColor'],
};

sections.forEach(([name, controls]) => {
  const sec = mkSection(name);
  controls.forEach(ctrl => {
    if (typeof ctrl[0] === 'string' && ctrl[0].startsWith('$')) {
      const cm = colorMap[ctrl[0]];
      sec.c.appendChild(mkColor(cm[0], cm[1](), cm[2], cm[3]));
    } else {
      const [label, mn, mx, step, key, cb] = ctrl;
      sec.c.appendChild(mkSlider(label, mn, mx, step, P[key], cb, key));
    }
  });
  panel.appendChild(sec.w);
});

// --- Snap & Apply ---
function applyBackground() {
  const bgCol = new THREE.Color(P.bgColor.r, P.bgColor.g, P.bgColor.b);
  scene.background = bgCol;
  renderer.setClearColor(bgCol, 1);
}
applyBackground();

const snap = () => JSON.parse(JSON.stringify({
  bloomStrength: P.bloomStrength, bloomRadius: P.bloomRadius, glowIntensity: P.glowIntensity,
  energySpeed: P.energySpeed, lineColor: P.lineColor, lineBrightness: P.lineBrightness,
  energyColor: P.energyColor, energyDispersion: P.energyDispersion, energyQuantity: P.energyQuantity,
  flowDirection: P.flowDirection, lineCount: P.lineCount, waveAmount: P.waveAmount,
  bgColor: P.bgColor, bgOpacity: P.bgOpacity,
}));

const LS_KEY = 'wavyPresets_v3';
function loadPresets() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } }
function savePresets(p) { localStorage.setItem(LS_KEY, JSON.stringify(p)); }

function syncUI() {
  const m = {
    bloomStrength: P.bloomStrength, bloomRadius: P.bloomRadius, lineBrightness: P.lineBrightness,
    glowIntensity: P.glowIntensity, energySpeed: P.energySpeed, energyQuantity: P.energyQuantity,
    energyDispersion: P.energyDispersion, flowDirection: P.flowDirection, lineCount: P.lineCount,
    waveAmount: P.waveAmount, bgOpacity: P.bgOpacity,
  };
  for (const [k, v] of Object.entries(m)) {
    const r = sRefs[k];
    if (r) { r.slider.value = v; const s = parseFloat(r.slider.step); r.display.textContent = s >= 1 ? round(v).toString() : v.toFixed(2); }
  }
  if (pRefs.lineColor) pRefs.lineColor.value = rgb2hex(P.lineColor.r, P.lineColor.g, P.lineColor.b);
  if (pRefs.energyColor) pRefs.energyColor.value = rgb2hex(P.energyColor.r, P.energyColor.g, P.energyColor.b);
  if (pRefs.bgColor) pRefs.bgColor.value = rgb2hex(P.bgColor.r, P.bgColor.g, P.bgColor.b);
}

function applyPreset(s) {
  const prev = P.lineCount;
  Object.assign(P, s);
  if (P.waveAmount === undefined) P.waveAmount = 0.3;
  if (P.lineCount === undefined) P.lineCount = 6;
  U.uGlowIntensity.value = P.glowIntensity; U.uEnergySpeed.value = P.energySpeed;
  U.uLineBrightness.value = P.lineBrightness; U.uLineColor.value.set(P.lineColor.r, P.lineColor.g, P.lineColor.b);
  U.uEnergyColor.value.set(P.energyColor.r, P.energyColor.g, P.energyColor.b);
  U.uEnergyDispersion.value = P.energyDispersion; U.uEnergyQuantity.value = P.energyQuantity;
  U.uWaveAmount.value = P.waveAmount;
  if (P.flowDirection !== undefined) { const r = P.flowDirection * PI / 180; U.uFlowDir.value.set(cos(r), sin(r)); }
  bloomPass.strength = P.bloomStrength; bloomPass.radius = P.bloomRadius;
  if (P.bgColor === undefined) P.bgColor = { r: 0, g: 0, b: 0 };
  if (P.bgOpacity === undefined) P.bgOpacity = 1.0;
  applyBackground();
  if (P.lineCount !== prev) buildLines(P.lineCount);
  syncUI();
}

// --- Presets section ---
const presetSec = mkSection('Presets');

const presetList = el('div', { marginBottom: '8px' });

function renderPresetList() {
  presetList.innerHTML = '';

  // Built-in presets (locked, not editable/deletable)
  Object.keys(BUILT_IN_PRESETS).forEach(name => {
    const row = el('div', {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '5px 8px', marginBottom: '4px', borderRadius: '4px',
      background: 'rgba(0,180,220,0.08)', border: '1px solid rgba(0,180,220,0.18)',
      cursor: 'pointer', transition: 'background 0.15s',
    });
    row.onmouseenter = () => row.style.background = 'rgba(0,180,220,0.15)';
    row.onmouseleave = () => row.style.background = 'rgba(0,180,220,0.08)';

    const nameEl = el('span', { fontSize: '11px', color: 'rgba(180,230,245,0.85)', flex: '1' }, name);
    nameEl.onclick = () => { applyPreset(JSON.parse(JSON.stringify(BUILT_IN_PRESETS[name]))); toast(`Loaded "${name}"`); };

    const lockIcon = el('span', { fontSize: '10px', color: 'rgba(0,200,240,0.35)', flexShrink: '0', paddingLeft: '8px' }, '🔒');

    row.append(nameEl, lockIcon);
    presetList.append(row);
  });

  // Custom presets
  const presets = loadPresets();
  const names = Object.keys(presets);
  names.forEach(name => {
    const row = el('div', {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '5px 8px', marginBottom: '4px', borderRadius: '4px',
      background: 'rgba(0,180,220,0.05)', border: '1px solid rgba(0,180,220,0.12)',
      cursor: 'pointer', transition: 'background 0.15s',
    });
    row.onmouseenter = () => row.style.background = 'rgba(0,180,220,0.12)';
    row.onmouseleave = () => row.style.background = 'rgba(0,180,220,0.05)';

    const nameEl = el('span', { fontSize: '11px', color: 'rgba(180,230,245,0.85)', flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, name);
    nameEl.onclick = () => { applyPreset(presets[name]); toast(`Loaded "${name}"`); };

    const delBtn = el('button', {
      background: 'none', border: 'none', color: 'rgba(120,160,180,0.4)',
      fontFamily: BF, fontSize: '13px', lineHeight: '1', cursor: 'pointer',
      padding: '0 0 0 8px', flexShrink: '0', transition: 'color 0.15s',
    }, '×');
    delBtn.onmouseenter = () => delBtn.style.color = 'rgba(255,100,100,0.7)';
    delBtn.onmouseleave = () => delBtn.style.color = 'rgba(120,160,180,0.4)';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      const all = loadPresets();
      delete all[name];
      savePresets(all);
      renderPresetList();
      toast(`Deleted "${name}"`);
    };

    row.append(nameEl, delBtn);
    presetList.append(row);
  });
}
renderPresetList();
presetSec.c.append(presetList);

// Name input + Save button
const saveRow = el('div', { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' });
const nameInput = el('input', {
  flex: '1', background: 'rgba(0,180,220,0.06)', border: '1px solid rgba(0,180,220,0.2)',
  borderRadius: '4px', color: 'rgba(180,230,245,0.9)', fontFamily: BF, fontSize: '11px',
  padding: '5px 8px', outline: 'none', boxSizing: 'border-box',
});
nameInput.type = 'text';
nameInput.placeholder = 'Preset name...';

const saveBtn = el('button', {
  flexShrink: '0', background: 'rgba(0,200,240,0.12)', border: '1px solid rgba(0,200,240,0.3)',
  borderRadius: '4px', color: 'rgba(0,220,255,0.85)', fontFamily: BF, fontSize: '11px',
  fontWeight: '600', padding: '5px 14px', cursor: 'pointer',
  transition: 'background 0.2s,border-color 0.2s,color 0.2s', letterSpacing: '0.3px',
}, 'Save');
hoverBtn(saveBtn, 'rgba(0,200,240,0.22)', 'rgba(0,220,255,0.4)', 'rgba(0,230,255,0.95)',
  'rgba(0,200,240,0.12)', 'rgba(0,200,240,0.3)', 'rgba(0,220,255,0.85)');

saveBtn.onclick = () => {
  const name = nameInput.value.trim();
  if (!name) { toast('Enter a preset name'); nameInput.focus(); return; }
  if (BUILT_IN_PRESETS[name]) { toast(`Cannot overwrite "${name}"`); return; }
  const all = loadPresets();
  all[name] = snap();
  savePresets(all);
  nameInput.value = '';
  renderPresetList();
  toast(`Saved "${name}"`);
};

nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click(); });

saveRow.append(nameInput, saveBtn);
presetSec.c.append(saveRow);
panel.append(presetSec.w);

// --- Utilities section ---
const utilSec = mkSection('Utilities');

function utilBtn(txt) {
  const b = el('button', { width: '100%', marginTop: '4px', background: 'rgba(0,200,240,0.06)', border: '1px solid rgba(0,200,240,0.15)', borderRadius: '4px', color: 'rgba(0,200,240,0.6)', fontFamily: BF, fontSize: '10px', fontWeight: '600', padding: '5px 12px', cursor: 'pointer', letterSpacing: '0.5px', transition: 'background 0.2s,border-color 0.2s,color 0.2s', whiteSpace: 'nowrap' }, txt);
  hoverBtn(b, 'rgba(0,200,240,0.15)', 'rgba(0,220,255,0.3)', 'rgba(0,220,255,0.9)', 'rgba(0,200,240,0.06)', 'rgba(0,200,240,0.15)', 'rgba(0,200,240,0.6)');
  return b;
}

const copyBtn = utilBtn('Copy JSON');
copyBtn.onclick = () => {
  const j = JSON.stringify(snap(), null, 2);
  navigator.clipboard.writeText(j).then(() => toast('JSON copied')).catch(() => {
    const ta = el('textarea', { position: 'fixed', opacity: '0' }); ta.value = j;
    document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('JSON copied');
  });
};
utilSec.c.append(copyBtn);

const impBtn = utilBtn('Import JSON');
const impOv = el('div', { position: 'fixed', top: '0', left: '0', width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: '3000', display: 'none', alignItems: 'center', justifyContent: 'center' });
const impMod = el('div', { background: 'rgba(8,10,18,0.95)', border: '1px solid rgba(0,180,220,0.25)', borderRadius: '10px', padding: '20px', width: '360px', maxWidth: '90vw', fontFamily: BF });
impMod.append(el('div', { fontSize: '11px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(0,200,240,0.6)', marginBottom: '12px' }, 'Import JSON Config'));
const impTA = el('textarea', { width: '100%', height: '180px', background: 'rgba(0,180,220,0.04)', border: '1px solid rgba(0,180,220,0.2)', borderRadius: '6px', color: 'rgba(180,230,245,0.9)', fontFamily: 'monospace', fontSize: '11px', padding: '10px', resize: 'vertical', outline: 'none', boxSizing: 'border-box' });
impTA.placeholder = 'Paste JSON here…'; impTA.spellcheck = false;
impMod.append(impTA);
const impRow = el('div', { display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' });
const impCancel = el('button', { background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', color: 'rgba(160,180,200,0.7)', fontFamily: BF, fontSize: '11px', padding: '6px 14px', cursor: 'pointer' }, 'Cancel');
const impApply = el('button', { background: 'rgba(0,200,240,0.15)', border: '1px solid rgba(0,200,240,0.3)', borderRadius: '4px', color: 'rgba(0,220,255,0.9)', fontFamily: BF, fontSize: '11px', fontWeight: '600', padding: '6px 18px', cursor: 'pointer' }, 'Apply');
const closeImp = () => { impOv.style.display = 'none'; impTA.value = ''; };
impCancel.onclick = closeImp;
impOv.onclick = e => { if (e.target === impOv) closeImp(); };
impApply.onclick = () => {
  const raw = impTA.value.trim();
  if (!raw) { toast('Paste a JSON config first'); return; }
  try { const p = JSON.parse(raw); applyPreset({ ...snap(), ...p }); closeImp(); toast('Config applied'); } catch { toast('Invalid JSON'); }
};
impRow.append(impCancel, impApply); impMod.append(impRow); impOv.append(impMod);
document.body.append(impOv);
impBtn.onclick = () => { impOv.style.display = 'flex'; setTimeout(() => impTA.focus(), 50); };
utilSec.c.append(impBtn);
panel.append(utilSec.w);

document.body.appendChild(panel);

const ctrlParam = QS('controls');
if (ctrlParam === 'false' || ctrlParam === '0') { panelVisible = false; panel.style.display = 'none'; }

// Also handle hash-based params for published URLs: #controls=0&preset=Name
function getHashParam(k) {
  const h = location.hash.replace(/^#/, '');
  const p = new URLSearchParams(h);
  return p.get(k);
}
const ctrlHash = getHashParam('controls');
if (ctrlHash === 'false' || ctrlHash === '0') { panelVisible = false; panel.style.display = 'none'; }

// Handle ?bg=transparent shorthand
const bgParam = QS('bg');
if (bgParam && bgParam.toLowerCase() === 'transparent') {
  P.bgOpacity = 0;
  applyBackground();
  syncUI();
}

// Load preset from URL param ?preset=Name
const presetParam = QS('preset');
if (presetParam) {
  if (BUILT_IN_PRESETS[presetParam]) {
    applyPreset(JSON.parse(JSON.stringify(BUILT_IN_PRESETS[presetParam])));
  } else {
    const allPresets = loadPresets();
    if (allPresets[presetParam]) {
      applyPreset(allPresets[presetParam]);
    }
  }
  // Re-apply bg=transparent after preset load (preset might override bgOpacity)
  if (bgParam && bgParam.toLowerCase() === 'transparent') {
    P.bgOpacity = 0;
    applyBackground();
    syncUI();
  }
}

document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap' }));

// --- Animation loop ---
const clock = new THREE.Clock();

function animate() {
  const t = clock.getElapsedTime();
  U.uTime.value = t;
  composer.render();
}
renderer.setAnimationLoop(animate);

addEventListener('resize', () => {
  const aspect = innerWidth / innerHeight;
  const boxAspect = SCENE_W / SCENE_H;
  if (aspect > boxAspect) {
    camera.top = SCENE_H / 2;
    camera.bottom = -SCENE_H / 2;
    camera.left = -camera.top * aspect;
    camera.right = camera.top * aspect;
  } else {
    camera.left = -SCENE_W / 2;
    camera.right = SCENE_W / 2;
    camera.top = camera.right / aspect;
    camera.bottom = -camera.right / aspect;
  }
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloomPass.resolution.set(innerWidth / 2, innerHeight / 2);
});