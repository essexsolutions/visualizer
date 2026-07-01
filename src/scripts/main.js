import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const { sin, cos, sqrt, abs, min, max, round, PI } = Math;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000005);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 800);
camera.position.set(0, 28, 68);
camera.lookAt(0, -2, -10);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const root = document.getElementById('root') ?? document.body;
Object.assign(root.style, { margin: '0', overflow: 'hidden', background: '#000' });
root.appendChild(renderer.domElement);

const P = {
  bloomStrength: 1.25, bloomRadius: 0.56, bloomThreshold: 0.2,
  glowIntensity: 0.6, energySpeed: 0.55, voidSize: 11, voidDent: 0.95,
  trailLength: 0, lineCount: 80, lineColor: { r: 0.44, g: 0.42, b: 0.36 }, lineBrightness: 0.6,
  energyColor: { r: 0.64, g: 0.56, b: 0.30 }, energyDispersion: 0.80,
  energyQuantity: 6, parallaxAmount: 0.08, voidSmoothing: 0.005, flowDirection: 0,
};
let panelVisible = true;

let LC = 80;
const LR = 250, EX = 90, VS = 10, MG = 20, TM = 40;
function calcSZ() { return 90 / Math.max(LC, 1); }
let SZ = calcSZ();
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), P.bloomStrength, P.bloomRadius, P.bloomThreshold);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const fRad = P.flowDirection * PI / 180;
const U = {
  uGlowIntensity: { value: P.glowIntensity }, uEnergySpeed: { value: P.energySpeed },
  uTime: { value: 0 }, uLineColor: { value: new THREE.Vector3(P.lineColor.r, P.lineColor.g, P.lineColor.b) },
  uLineBrightness: { value: P.lineBrightness }, uEnergyColor: { value: new THREE.Vector3(P.energyColor.r, P.energyColor.g, P.energyColor.b) },
  uEnergyDispersion: { value: P.energyDispersion }, uEnergyQuantity: { value: P.energyQuantity },
  uFlowDir: { value: new THREE.Vector2(cos(fRad), sin(fRad)) },
};
const lineMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
  vertexShader: `attribute float aAlpha,aArcLength,aLineId,aElevation,aDist;uniform vec2 uFlowDir;varying float vAlpha,vArcLength,vLineId,vElevation,vDist,vFlowPos;void main(){vAlpha=aAlpha;vArcLength=aArcLength;vLineId=aLineId;vElevation=aElevation;vDist=aDist;vFlowPos=dot(position.xz,uFlowDir)+100.0;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `uniform float uGlowIntensity,uEnergySpeed,uTime,uLineBrightness,uEnergyDispersion,uEnergyQuantity;uniform vec3 uLineColor,uEnergyColor;varying float vAlpha,vArcLength,vLineId,vElevation,vDist,vFlowPos;float hash(float n){return fract(sin(n)*17503.4);}void main(){float en=clamp((vElevation+5.0)/18.0,0.0,1.0);vec3 base=uLineColor*(0.5+en*0.5)*uLineBrightness;float ga=0.0;int qty=int(uEnergyQuantity);float wl=360.0;for(int i=0;i<${MG};i++){if(i>=qty)break;float fi=float(i),seed=vLineId*7.31+fi*13.17,h=hash(seed);float spd=(12.0+abs(sin(seed))*6.0*uEnergyDispersion)*uEnergySpeed;float off=mix(fi*(wl/max(uEnergyQuantity,1.0)),h*wl,uEnergyDispersion);float pw=sin(seed*0.5+uTime*(0.3+h*0.5))*8.0*uEnergyDispersion;float p=mod(uTime*spd+off+pw,wl),d=abs(vFlowPos-p);d=min(d,wl-d);ga+=exp(-d*d*0.35);}float cg=min(ga,1.0)*uGlowIntensity;vec3 fc=mix(base,uEnergyColor,cg*0.9)+uEnergyColor*cg*0.4;float ab=vAlpha*(0.15+en*0.35)*uLineBrightness;float af=max(ab,cg*0.95*vAlpha);float ef=1.0-clamp((vDist-48.0)/12.0,0.0,1.0);gl_FragColor=vec4(fc,af*ef);}`,
});

const lineGroup = new THREE.Group();
lineGroup.name = 'lineGroup';
let LD = [];

function buildLines() {
  // Dispose old
  for (const d of LD) d.g.dispose();
  while (lineGroup.children.length) lineGroup.remove(lineGroup.children[0]);
  LD = [];
  SZ = calcSZ();
  for (let i = 0; i < LC; i++) {
    const z = (i - LC / 2) * SZ, pos = new Float32Array(LR * 3), alp = new Float32Array(LR);
    const arc = new Float32Array(LR), lid = new Float32Array(LR), elv = new Float32Array(LR), dst = new Float32Array(LR);
    for (let j = 0; j < LR; j++) {
      pos[j * 3] = (j / (LR - 1)) * EX * 2 - EX; pos[j * 3 + 1] = 0; pos[j * 3 + 2] = z;
      alp[j] = 1; lid[j] = i;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
    g.setAttribute('aArcLength', new THREE.BufferAttribute(arc, 1));
    g.setAttribute('aLineId', new THREE.BufferAttribute(lid, 1));
    g.setAttribute('aElevation', new THREE.BufferAttribute(elv, 1));
    g.setAttribute('aDist', new THREE.BufferAttribute(dst, 1));
    const line = new THREE.Line(g, lineMat);
    line.name = `wl_${i}`; line.frustumCulled = false;
    lineGroup.add(line);
    LD.push({ z, pos, alp, arc, elv, dst, g });
  }
}
buildLines();
scene.add(lineGroup);

const xPos = new Float32Array(LR);
for (let j = 0; j < LR; j++) xPos[j] = (j / (LR - 1)) * EX * 2 - EX;

const vc = { x: 0, z: 0 }, vt = { x: 0, z: 0 };
const trail = Array.from({ length: TM }, () => ({ x: 0, z: 0 }));
let mNX = 0, mNY = 0, smNX = 0, smNY = 0, svmX = 0, svmY = 0, tCX = 0, tCY = 28;
addEventListener('mousemove', (e) => { mNX = (e.clientX / innerWidth - 0.5) * 2; mNY = (e.clientY / innerHeight - 0.5) * 2; });

function updateLines(t) {
  const vR = P.voidSize, dS = P.voidDent, cx = vc.x, cz = vc.z;
  const hasT = P.trailLength > 0.001, tLen = hasT ? (P.trailLength * TM) | 0 : 0;
  const e0 = vR - VS, e1 = vR + VS, invR = e1 - e0 > 0 ? 1 / (e1 - e0) : 0;
  let tX, tZ, tF, tR2, tE0, tIR;
  if (hasT) {
    tX = new Float64Array(tLen); tZ = new Float64Array(tLen); tF = new Float64Array(tLen);
    tR2 = new Float64Array(tLen); tE0 = new Float64Array(tLen); tIR = new Float64Array(tLen);
    for (let i = 0; i < tLen; i++) {
      const tr = trail[i]; tX[i] = tr.x; tZ[i] = tr.z;
      const f = 1 - i / TM; tF[i] = f;
      const r = vR * (0.3 + f * 0.7); tR2[i] = r;
      const te0 = r - 2, te1 = r + VS * 0.5; tE0[i] = te0;
      const rng = te1 - te0; tIR[i] = rng > 0 ? 1 / rng : 0;
    }
  }
  const w1t = t * 0.6, w2a = t * 0.35, w2b = t * 0.25, w3t = t * 0.4, w4t = t * 0.2;
  const lc = LD.length;
  for (let i = 0; i < lc; i++) {
    const l = LD[i], z = l.z, p = l.pos, a = l.alp, ac = l.arc, ev = l.elv, ds = l.dst;
    const dz = z - cz, dz2 = dz * dz, cZ = cos(z * 0.06 - w2b);
    let cum = 0, pX = 0, pY = 0;
    for (let j = 0; j < LR; j++) {
      const x = xPos[j], dx = x - cx, d2 = dx * dx + dz2, d = sqrt(d2);
      let s = (d - e0) * invR; s = s < 0 ? 0 : s > 1 ? 1 : s;
      const vf = s * s * (3 - 2 * s), df = (1 - vf) * dS;
      const w1 = sin(d * 0.12 - w1t) * 3.5, w2 = sin(x * 0.08 + w2a) * cZ * 2.5;
      const w3 = cos(d * 0.07 + w3t) * 2.0, w4 = sin(x * 0.04 - w4t) * 1.5;
      let er = (d - 20) * 0.02857142857; er = er < 0 ? 0 : er > 1 ? 1 : er;
      const y = (w1 + w2 + w3 + w4 + er * er * (3 - 2 * er) * 10) * vf - df * 6;
      p[j * 3] = x; p[j * 3 + 1] = y; ev[j] = y; ds[j] = sqrt(x * x + z * z);
      const aE0 = vR - 3, aE1 = vR + VS;
      let at = (d - aE0) / (aE1 - aE0); at = at < 0 ? 0 : at > 1 ? 1 : at;
      let al = at * at * (3 - 2 * at);
      if (hasT) for (let ti = 0; ti < tLen; ti++) {
        const tdx = x - tX[ti], tdz = z - tZ[ti], td = sqrt(tdx * tdx + tdz * tdz);
        let tt = (td - tE0[ti]) * tIR[ti]; tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
        const b = 1 - (1 - tt * tt * (3 - 2 * tt)) * tF[ti] * 0.6;
        if (b < al) al = b;
      }
      a[j] = al;
      if (j === 0) { ac[0] = 0; cum = 0; } else { const ddx = x - pX, ddy = y - pY; cum += sqrt(ddx * ddx + ddy * ddy); ac[j] = cum; }
      pX = x; pY = y;
    }
    const ga = l.g.attributes;
    ga.position.needsUpdate = ga.aAlpha.needsUpdate = ga.aArcLength.needsUpdate = ga.aElevation.needsUpdate = ga.aDist.needsUpdate = true;
  }
}

// --- Helpers ---
const toHex = v => round(v * 255).toString(16).padStart(2, '0');
const rgb2hex = (r, g, b) => '#' + toHex(r) + toHex(g) + toHex(b);
const hex2rgb = h => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });

// --- UI ---
const QS = k => new URLSearchParams(location.search).get(k);

const el = (t, s, txt) => { const e = document.createElement(t); if (s) Object.assign(e.style, s); if (txt) e.textContent = txt; return e; };
const sRefs = {}, pRefs = {};
const BF = 'Inter,system-ui,-apple-system,sans-serif';

const panel = el('div', {
  position: 'fixed', bottom: '16px', right: '16px', background: 'rgba(8,10,18,0.85)',
  border: '1px solid rgba(0,180,220,0.2)', borderRadius: '8px', padding: '16px 20px',
  fontFamily: BF, fontSize: '12px', color: 'rgba(160,210,230,0.9)', zIndex: '1000',
  minWidth: '220px', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', userSelect: 'none',
  display: 'block',
});

addEventListener('keydown', e => {
  if (e.key === 'c' || e.key === 'C') {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    panelVisible = !panelVisible;
    panel.style.display = panelVisible ? 'block' : 'none';
  }
});

document.head.appendChild(Object.assign(document.createElement('style'), {
  textContent: '#controlPanel::-webkit-scrollbar{width:4px}#controlPanel::-webkit-scrollbar-track{background:transparent}#controlPanel::-webkit-scrollbar-thumb{background:rgba(0,180,220,0.2);border-radius:2px}#presetList::-webkit-scrollbar{width:3px}#presetList::-webkit-scrollbar-track{background:transparent}#presetList::-webkit-scrollbar-thumb{background:rgba(0,180,220,0.15);border-radius:2px}'
}));

function hoverBtn(b, hBg, hBc, hC, nBg, nBc, nC) {
  b.onmouseenter = () => { b.style.background = hBg; if (hBc) b.style.borderColor = hBc; if (hC) b.style.color = hC; };
  b.onmouseleave = () => { b.style.background = nBg; if (nBc) b.style.borderColor = nBc; if (nC) b.style.color = nC; };
}

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

panel.appendChild(el('div', { fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(0,200,240,0.6)', marginBottom: '14px', borderBottom: '1px solid rgba(0,180,220,0.1)', paddingBottom: '8px' }, 'Controls'));

// Build sections data-driven
const sections = [
  ['Bloom', [
    ['Strength', 0, 3, 0.05, 'bloomStrength', v => { P.bloomStrength = v; bloomPass.strength = v; }],
    ['Radius', 0.1, 1.0, 0.01, 'bloomRadius', v => { P.bloomRadius = v; bloomPass.radius = v; }],
  ]],
  ['Wave Lines', [
    ['Lines', 10, 200, 1, 'lineCount', v => { P.lineCount = LC = round(v); buildLines(); }],
    ['Brightness', 0.05, 1.5, 0.05, 'lineBrightness', v => { P.lineBrightness = v; U.uLineBrightness.value = v; }],
    ['$lineColor'],
  ]],
  ['Energy Lights', [
    ['Glow', 0.1, 2.5, 0.05, 'glowIntensity', v => { P.glowIntensity = v; U.uGlowIntensity.value = v; }],
    ['Speed', 0.0, 3.0, 0.05, 'energySpeed', v => { P.energySpeed = v; U.uEnergySpeed.value = v; }],
    ['Quantity', 1, MG, 1, 'energyQuantity', v => { P.energyQuantity = round(v); U.uEnergyQuantity.value = P.energyQuantity; }],
    ['Dispersion', 0.0, 1.0, 0.02, 'energyDispersion', v => { P.energyDispersion = v; U.uEnergyDispersion.value = v; }],
    ['Direction', 0, 360, 1, 'flowDirection', v => { P.flowDirection = v; const r = v * PI / 180; U.uFlowDir.value.set(cos(r), sin(r)); }],
    ['$energyColor'],
  ]],
  ['Void', [
    ['Size', 5, 40, 0.5, 'voidSize', v => { P.voidSize = v; }],
    ['Dent', 0.0, 3.0, 0.05, 'voidDent', v => { P.voidDent = v; }],
    ['Trail', 0.0, 1.0, 0.02, 'trailLength', v => { P.trailLength = v; }],
    ['Smoothing', 0.005, 0.050, 0.001, 'voidSmoothing', v => { P.voidSmoothing = v; }],
  ]],
  ['Camera', [
    ['Parallax', 0.0, 1.0, 0.02, 'parallaxAmount', v => { P.parallaxAmount = v; }],
  ]],
];

const colorMap = {
  '$lineColor': ['Line Color', () => rgb2hex(P.lineColor.r, P.lineColor.g, P.lineColor.b), h => { const c = hex2rgb(h); P.lineColor = c; U.uLineColor.value.set(c.r, c.g, c.b); }, 'lineColor'],
  '$energyColor': ['Light Color', () => rgb2hex(P.energyColor.r, P.energyColor.g, P.energyColor.b), h => { const c = hex2rgb(h); P.energyColor = c; U.uEnergyColor.value.set(c.r, c.g, c.b); }, 'energyColor'],
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

// --- Built-in Presets (protected, no delete) ---
const BUILTIN_PRESETS = {
  'Essex': {
    bloomStrength:1.25,bloomRadius:0.56,glowIntensity:0.6,energySpeed:0.55,voidSize:11,voidDent:0.95,
    trailLength:0,lineCount:64,lineColor:{r:0.44,g:0.42,b:0.36},lineBrightness:0.6,
    energyColor:{r:0.64,g:0.56,b:0.3},energyDispersion:0.8,energyQuantity:6,
    parallaxAmount:0.08,voidSmoothing:0.005,flowDirection:0,
  },
  'Copper': {
    bloomStrength:0.6,bloomRadius:0.69,glowIntensity:1.15,energySpeed:0.55,voidSize:18,voidDent:1.55,
    trailLength:0.42,lineCount:80,lineColor:{r:0.15294117647058825,g:0.11372549019607843,b:0.047058823529411764},lineBrightness:0.9,
    energyColor:{r:0.45098039215686275,g:0.4,b:0.14901960784313725},energyDispersion:0.8,energyQuantity:4,
    parallaxAmount:0.08,voidSmoothing:0.005,flowDirection:0,
  },
  'Blue': {
    bloomStrength:0.75,bloomRadius:0.95,glowIntensity:0.7,energySpeed:0.85,voidSize:18,voidDent:1.55,
    trailLength:0.42,lineCount:80,lineColor:{r:0.16470588235294117,g:0.1803921568627451,b:0.2549019607843137},lineBrightness:0.9,
    energyColor:{r:0.1,g:0.9,b:1},energyDispersion:0,energyQuantity:11,
    parallaxAmount:0.08,voidSmoothing:0.005,flowDirection:0,
  },
  'Void': {
    bloomStrength:0.9,bloomRadius:0.95,glowIntensity:0.7,energySpeed:0.85,voidSize:40,voidDent:3,
    trailLength:0,lineCount:80,lineColor:{r:0.27058823529411763,g:0.27058823529411763,b:0.27058823529411763},lineBrightness:0.65,
    energyColor:{r:0.1,g:0.9,b:1},energyDispersion:1,energyQuantity:1,
    parallaxAmount:0.08,voidSmoothing:0.005,flowDirection:0,
  },
  'Green': {
    bloomStrength:2.6,bloomRadius:0.57,glowIntensity:0.8,energySpeed:0.65,voidSize:5,voidDent:0,
    trailLength:0.36,lineCount:23,lineColor:{r:0.27058823529411763,g:0.27058823529411763,b:0.27058823529411763},lineBrightness:1,
    energyColor:{r:0.4,g:1,b:0.4117647058823529},energyDispersion:1,energyQuantity:6,
    parallaxAmount:0,voidSmoothing:0.05,flowDirection:255,
  },
  'Flash': {
    bloomStrength:3,bloomRadius:0.95,glowIntensity:0.6,energySpeed:3,voidSize:5,voidDent:0,
    trailLength:0,lineCount:64,lineColor:{r:0.27058823529411763,g:0.27058823529411763,b:0.27058823529411763},lineBrightness:0.65,
    energyColor:{r:0.1,g:0.9,b:1},energyDispersion:1,energyQuantity:1,
    parallaxAmount:0,voidSmoothing:0.05,flowDirection:255,
  },
  'Electric': {
    bloomStrength:0.6,bloomRadius:0.69,glowIntensity:1.15,energySpeed:0.55,voidSize:18,voidDent:1.55,
    trailLength:0.42,lineCount:64,lineColor:{r:0.16470588235294117,g:0.1803921568627451,b:0.2549019607843137},lineBrightness:0.9,
    energyColor:{r:0.1,g:0.9,b:1},energyDispersion:0.8,energyQuantity:4,
    parallaxAmount:0.08,voidSmoothing:0.005,flowDirection:0,
  },
};

// --- Presets ---
const PKEY = 'waveVoidPresets';
const snap = () => JSON.parse(JSON.stringify({
  bloomStrength: P.bloomStrength, bloomRadius: P.bloomRadius, glowIntensity: P.glowIntensity,
  energySpeed: P.energySpeed, voidSize: P.voidSize, voidDent: P.voidDent, trailLength: P.trailLength,
  lineCount: P.lineCount, lineColor: P.lineColor, lineBrightness: P.lineBrightness, energyColor: P.energyColor,
  energyDispersion: P.energyDispersion, energyQuantity: P.energyQuantity,
  parallaxAmount: P.parallaxAmount, voidSmoothing: P.voidSmoothing, flowDirection: P.flowDirection,
}));
const loadP = () => { try { const r = localStorage.getItem(PKEY); return r ? JSON.parse(r) : {}; } catch { return {}; } };
const saveP = p => localStorage.setItem(PKEY, JSON.stringify(p));
const isBuiltin = n => Object.prototype.hasOwnProperty.call(BUILTIN_PRESETS, n) || Object.keys(BUILTIN_PRESETS).some(k => k.toLowerCase() === n.toLowerCase());

function applyPreset(s) {
  Object.assign(P, s);
  if (s.lineCount !== undefined && s.lineCount !== LC) { LC = round(s.lineCount); buildLines(); }
  U.uGlowIntensity.value = s.glowIntensity; U.uEnergySpeed.value = s.energySpeed;
  U.uLineBrightness.value = s.lineBrightness; U.uLineColor.value.set(s.lineColor.r, s.lineColor.g, s.lineColor.b);
  U.uEnergyColor.value.set(s.energyColor.r, s.energyColor.g, s.energyColor.b);
  U.uEnergyDispersion.value = s.energyDispersion; U.uEnergyQuantity.value = s.energyQuantity;
  if (s.flowDirection !== undefined) { const r = s.flowDirection * PI / 180; U.uFlowDir.value.set(cos(r), sin(r)); }
  bloomPass.strength = s.bloomStrength; bloomPass.radius = s.bloomRadius;
  syncUI();
}

function syncUI() {
  const m = {
    bloomStrength: P.bloomStrength, bloomRadius: P.bloomRadius, lineCount: P.lineCount, lineBrightness: P.lineBrightness,
    glowIntensity: P.glowIntensity, energySpeed: P.energySpeed, energyQuantity: P.energyQuantity,
    energyDispersion: P.energyDispersion, voidSize: P.voidSize, voidDent: P.voidDent,
    trailLength: P.trailLength, voidSmoothing: P.voidSmoothing, parallaxAmount: P.parallaxAmount,
    flowDirection: P.flowDirection,
  };
  for (const [k, v] of Object.entries(m)) {
    const r = sRefs[k];
    if (r) { r.slider.value = v; const s = parseFloat(r.slider.step); r.display.textContent = s >= 1 ? round(v).toString() : v.toFixed(2); }
  }
  if (pRefs.lineColor) pRefs.lineColor.value = rgb2hex(P.lineColor.r, P.lineColor.g, P.lineColor.b);
  if (pRefs.energyColor) pRefs.energyColor.value = rgb2hex(P.energyColor.r, P.energyColor.g, P.energyColor.b);
}

function toast(msg) {
  document.getElementById('toast')?.remove();
  const t = el('div', { position: 'fixed', bottom: '70px', right: '16px', background: 'rgba(0,200,240,0.15)', border: '1px solid rgba(0,200,240,0.3)', borderRadius: '6px', padding: '8px 16px', fontFamily: BF, fontSize: '11px', fontWeight: '500', color: 'rgba(0,230,255,0.9)', zIndex: '2000', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', opacity: '0', transform: 'translateY(8px)', transition: 'opacity 0.25s,transform 0.25s', pointerEvents: 'none' }, msg);
  t.id = 'toast'; document.body.append(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; setTimeout(() => t.remove(), 300); }, 1600);
}

const pSec = mkSection('Presets');
const pList = el('div', { marginBottom: '10px', maxHeight: '140px', overflowY: 'auto', overflowX: 'hidden' }); pList.id = 'presetList';

function miniPreview(data) {
  const w = 48, h = 16;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const lc = data.lineColor || { r: 0.44, g: 0.42, b: 0.36 };
  const ec = data.energyColor || { r: 0.64, g: 0.56, b: 0.30 };
  const bg = 'rgb(4,5,12)';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const lines = min(data.lineCount || 80, 12);
  const bright = data.lineBrightness || 0.6;
  ctx.globalAlpha = min(bright, 1);
  ctx.strokeStyle = 'rgb(' + round(lc.r * 255) + ',' + round(lc.g * 255) + ',' + round(lc.b * 255) + ')';
  ctx.lineWidth = 0.6;
  for (let i = 0; i < lines; i++) {
    const y = 2 + (i / max(lines - 1, 1)) * (h - 4);
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const py = y + sin(x * 0.4 + i * 0.8) * 1.5;
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = min((data.glowIntensity || 0.6) * 0.8, 1);
  const grd = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 12);
  grd.addColorStop(0, 'rgba(' + round(ec.r * 255) + ',' + round(ec.g * 255) + ',' + round(ec.b * 255) + ',0.7)');
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  return c.toDataURL();
}

function renderList() {
  pList.innerHTML = '';
  const userPresets = loadP();
  const allEntries = [
    ...Object.keys(BUILTIN_PRESETS).map(n => ({ n, data: BUILTIN_PRESETS[n], builtin: true })),
    ...Object.keys(userPresets).map(n => ({ n, data: userPresets[n], builtin: false })),
  ];
  if (!allEntries.length) { pList.append(el('div', { color: 'rgba(100,140,160,0.5)', fontSize: '11px', fontStyle: 'italic', padding: '4px 0' }, 'No presets')); return; }

  let lastBuiltin = true;
  allEntries.forEach(({ n, data, builtin }) => {
    if (!builtin && lastBuiltin) {
      const sep = el('div', { fontSize: '9px', letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(100,150,170,0.4)', padding: '6px 0 3px 0', borderTop: '1px solid rgba(0,180,220,0.08)' }, 'Saved');
      pList.append(sep);
    }
    lastBuiltin = builtin;

    const row = el('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px', gap: '6px' });
    const lb = el('button', { flex: '1', display: 'flex', alignItems: 'center', gap: '8px', background: builtin ? 'rgba(0,180,220,0.12)' : 'rgba(0,180,220,0.08)', border: '1px solid ' + (builtin ? 'rgba(0,180,220,0.28)' : 'rgba(0,180,220,0.2)'), borderRadius: '4px', color: 'rgba(160,220,240,0.9)', fontFamily: BF, fontSize: '11px', padding: '5px 8px', cursor: 'pointer', textAlign: 'left', transition: 'background 0.2s,border-color 0.2s', overflow: 'hidden', whiteSpace: 'nowrap' });
    const thumb = el('img', { width: '48px', height: '16px', borderRadius: '2px', flex: '0 0 48px', imageRendering: 'pixelated' });
    thumb.src = miniPreview(data);
    const lbl = el('span', { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1' }, n);
    const meta = el('span', { fontSize: '9px', color: 'rgba(100,160,180,0.5)', flex: '0 0 auto', whiteSpace: 'nowrap' }, (data.lineCount || 80) + 'L');
    lb.append(thumb, lbl, meta);
    hoverBtn(lb, 'rgba(0,180,220,0.18)', 'rgba(0,210,255,0.4)', null, builtin ? 'rgba(0,180,220,0.12)' : 'rgba(0,180,220,0.08)', builtin ? 'rgba(0,180,220,0.28)' : 'rgba(0,180,220,0.2)', null);
    lb.onclick = () => { applyPreset(data); toast('Loaded "' + n + '"'); };

    if (!builtin) {
      const db = el('button', { flex: '0 0 auto', background: 'transparent', border: '1px solid rgba(255,80,80,0.2)', borderRadius: '4px', color: 'rgba(255,100,100,0.6)', fontFamily: BF, fontSize: '11px', padding: '4px 7px', cursor: 'pointer', transition: 'background 0.2s,color 0.2s' }, '\u2715');
      hoverBtn(db, 'rgba(255,60,60,0.15)', null, 'rgba(255,120,120,0.9)', 'transparent', null, 'rgba(255,100,100,0.6)');
      db.onclick = () => { const p = loadP(); delete p[n]; saveP(p); renderList(); toast('Deleted "' + n + '"'); };
      row.append(lb, db);
    } else {
      const lock = el('span', { flex: '0 0 auto', fontSize: '10px', color: 'rgba(0,180,220,0.3)', padding: '0 4px', userSelect: 'none', title: 'Built-in preset' }, '\uD83D\uDD12');
      row.append(lb, lock);
    }
    pList.append(row);
  });
}
pSec.c.appendChild(pList);

const saveRow = el('div', { display: 'flex', gap: '6px', marginBottom: '4px' });
const nameIn = el('input', { flex: '1', background: 'rgba(0,180,220,0.06)', border: '1px solid rgba(0,180,220,0.2)', borderRadius: '4px', color: 'rgba(180,230,245,0.9)', fontFamily: BF, fontSize: '11px', padding: '5px 8px', outline: 'none' });
nameIn.type = 'text'; nameIn.placeholder = 'Preset name…'; nameIn.maxLength = 24;
nameIn.onfocus = () => nameIn.style.borderColor = 'rgba(0,210,255,0.5)';
nameIn.onblur = () => nameIn.style.borderColor = 'rgba(0,180,220,0.2)';

function utilBtn(txt) {
  const b = el('button', { width: '100%', marginTop: '4px', background: 'rgba(0,200,240,0.06)', border: '1px solid rgba(0,200,240,0.15)', borderRadius: '4px', color: 'rgba(0,200,240,0.6)', fontFamily: BF, fontSize: '10px', fontWeight: '600', padding: '5px 12px', cursor: 'pointer', letterSpacing: '0.5px', transition: 'background 0.2s,border-color 0.2s,color 0.2s' }, txt);
  hoverBtn(b, 'rgba(0,200,240,0.15)', 'rgba(0,220,255,0.3)', 'rgba(0,220,255,0.9)', 'rgba(0,200,240,0.06)', 'rgba(0,200,240,0.15)', 'rgba(0,200,240,0.6)');
  return b;
}

const saveBtn = el('button', { flex: '0 0 auto', background: 'rgba(0,200,240,0.12)', border: '1px solid rgba(0,200,240,0.3)', borderRadius: '4px', color: 'rgba(0,220,255,0.9)', fontFamily: BF, fontSize: '11px', fontWeight: '600', padding: '5px 12px', cursor: 'pointer', letterSpacing: '0.5px', transition: 'background 0.2s,border-color 0.2s' }, 'Save');
hoverBtn(saveBtn, 'rgba(0,200,240,0.25)', 'rgba(0,220,255,0.5)', null, 'rgba(0,200,240,0.12)', 'rgba(0,200,240,0.3)', null);
saveBtn.onclick = () => {
  const n = nameIn.value.trim();
  if (!n) { toast('Enter a preset name'); nameIn.focus(); return; }
  const p = loadP(); p[n] = snap(); saveP(p); nameIn.value = ''; renderList(); toast(`Saved "${n}"`);
};
nameIn.onkeydown = e => { if (e.key === 'Enter') saveBtn.click(); };
saveRow.append(nameIn, saveBtn);
pSec.c.append(saveRow);

const copyBtn = utilBtn('Copy JSON');
copyBtn.style.marginTop = '8px';
copyBtn.onclick = () => {
  const j = JSON.stringify(snap(), null, 2);
  navigator.clipboard.writeText(j).then(() => toast('JSON copied')).catch(() => {
    const ta = el('textarea', { position: 'fixed', opacity: '0' }); ta.value = j;
    document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('JSON copied');
  });
};
pSec.c.append(copyBtn);

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
  try { const p = JSON.parse(raw); if (!['bloomStrength', 'lineColor', 'energyColor'].some(k => k in p)) { toast('Invalid config'); return; } applyPreset({ ...snap(), ...p }); closeImp(); toast('Config applied'); } catch { toast('Invalid JSON'); }
};
impRow.append(impCancel, impApply); impMod.append(impRow); impOv.append(impMod);
document.body.append(impOv);
impBtn.onclick = () => { impOv.style.display = 'flex'; setTimeout(() => impTA.focus(), 50); };
pSec.c.append(impBtn);
panel.append(pSec.w);
renderList();
document.body.appendChild(panel);

const ctrlParam = QS('controls');
if (ctrlParam === 'false' || ctrlParam === '0') { panelVisible = false; panel.style.display = 'none'; }
else if (ctrlParam === 'true' || ctrlParam === '1') { panelVisible = true; panel.style.display = 'block'; }

const urlPN = QS('preset');
if (urlPN) {
  const allP = { ...BUILTIN_PRESETS, ...loadP() };
  const match = allP[urlPN] || Object.entries(allP).find(([k]) => k.toLowerCase() === urlPN.toLowerCase())?.[1];
  if (match) { applyPreset(match); toast('Loaded "' + urlPN + '"'); }
  else toast('Preset "' + urlPN + '" not found');
}

document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap' }));

let fpsEl = null, fpsFr = 0, fpsTm = 0;
if (QS('fps') === 'true') {
  fpsEl = el('div', { position: 'fixed', top: '10px', left: '10px', fontFamily: 'Inter,monospace,system-ui,sans-serif', fontSize: '11px', fontWeight: '600', color: 'rgba(0,220,255,0.7)', background: 'rgba(8,10,18,0.7)', border: '1px solid rgba(0,180,220,0.15)', borderRadius: '5px', padding: '5px 10px', zIndex: '2000', pointerEvents: 'none', letterSpacing: '0.5px', fontVariantNumeric: 'tabular-nums', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }, '-- FPS');
  document.body.append(fpsEl);
}

const clock = new THREE.Clock();
let trailTm = 0, lastT = 0;

function animate() {
  const t = clock.getElapsedTime(), dt = t - lastT; lastT = t;
  trailTm += dt;
  if (trailTm > 0.08) {
    trailTm = 0;
    for (let i = TM - 1; i > 0; i--) { trail[i].x = trail[i - 1].x; trail[i].z = trail[i - 1].z; }
    trail[0].x = vc.x; trail[0].z = vc.z;
  }
  const vs = P.voidSmoothing, df = min(dt * 60, 3);
  svmX += (mNX - svmX) * vs * df; svmY += (mNY - svmY) * vs * df;
  vt.x = svmX * 22; vt.z = svmY * -18;
  vc.x += (vt.x - vc.x) * vs * 2.5 * df; vc.z += (vt.z - vc.z) * vs * 2.5 * df;
  updateLines(t);
  U.uTime.value = t;
  smNX += (mNX - smNX) * 0.012 * df; smNY += (mNY - smNY) * 0.012 * df;
  const pA = P.parallaxAmount;
  tCX = smNX * 4 * pA; tCY = 28 + smNY * -2 * pA;
  camera.position.x += (tCX - camera.position.x) * 0.02 * df;
  camera.position.y += (tCY - camera.position.y) * 0.02 * df;
  camera.lookAt(0, -2, -10);
  composer.render();
  if (fpsEl) { fpsFr++; fpsTm += dt; if (fpsTm >= 0.5) { const f = round(fpsFr / fpsTm); fpsEl.textContent = f + ' FPS'; fpsEl.style.color = f >= 55 ? 'rgba(0,220,180,0.7)' : f >= 30 ? 'rgba(255,200,60,0.8)' : 'rgba(255,80,80,0.8)'; fpsFr = 0; fpsTm = 0; } }
}
renderer.setAnimationLoop(animate);

let resizeTm;
addEventListener('resize', () => {
  clearTimeout(resizeTm);
  resizeTm = setTimeout(() => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
    bloomPass.resolution.set(innerWidth / 2, innerHeight / 2);
  }, 100);
});