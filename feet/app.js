import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const BG = 0x08080c;
const MAX_HOLES = 16;
const D2R = Math.PI / 180;

// ───────────────────────── data ─────────────────────────
const data = await (await fetch('./legs.json')).json();
const b64 = (s, T) => {
  const bin = atob(s), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new T(u8.buffer);
};
const NV = data.vertexCount, K = data.influences;
const rest0 = b64(data.positions, Float32Array);      // original rest pose
const rest = new Float32Array(rest0);                  // rest pose + shape morphs
const quads = b64(data.quads, Uint32Array);
const skinIdx = b64(data.skinIndex, Uint8Array);
const skinW = b64(data.skinWeight, Uint8Array);
const bones = data.bones;
const NB = bones.length;
const boneId = Object.fromEntries(bones.map((b, i) => [b.name, i]));

const legIndex = new Uint32Array(data.quadCount * 6);
const index = legIndex;
for (let q = 0, o = 0; q < data.quadCount; q++) {
  const a = quads[q * 4], b = quads[q * 4 + 1], c = quads[q * 4 + 2], d = quads[q * 4 + 3];
  index[o++] = a; index[o++] = b; index[o++] = c; index[o++] = a; index[o++] = c; index[o++] = d;
}

function computeNormals(pos, out, index = legIndex) {
  out.fill(0);
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3;
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
    const e1x = pos[b] - ax, e1y = pos[b + 1] - ay, e1z = pos[b + 2] - az;
    const e2x = pos[c] - ax, e2y = pos[c + 1] - ay, e2z = pos[c + 2] - az;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    out[a] += nx; out[a + 1] += ny; out[a + 2] += nz;
    out[b] += nx; out[b + 1] += ny; out[b + 2] += nz;
    out[c] += nx; out[c + 1] += ny; out[c + 2] += nz;
  }
  for (let i = 0; i < out.length; i += 3) {
    const l = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
    out[i] /= l; out[i + 1] /= l; out[i + 2] /= l;
  }
}

const positions = new Float32Array(NV * 3);
const normals = new Float32Array(NV * 3);
const restN = new Float32Array(NV * 3);
computeNormals(rest0, restN);

// per-vertex masks: x = blush, y = top fade, z = foot region
const isToe = bones.map(b => b.name.startsWith('toe'));
const isFoot = bones.map(b => b.name.startsWith('toe') || b.name.startsWith('foot'));
const mask = new Float32Array(NV * 3);
const toeAttr = new Float32Array(NV);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
for (let v = 0; v < NV; v++) {
  let toe = 0, foot = 0;
  for (let k = 0; k < K; k++) {
    const w = skinW[v * K + k] / 255, bi = skinIdx[v * K + k];
    if (isToe[bi]) toe += w;
    if (isFoot[bi]) foot += w;
  }
  const y = rest0[v * 3 + 1], z = rest0[v * 3 + 2], ny = restN[v * 3 + 1];
  const sole = smooth(0.1, -0.5, ny) * smooth(0.06, 0.02, y);
  const heel = smooth(0.02, -0.04, z) * smooth(0.07, 0.02, y);
  const tip = toe * smooth(0.14, 0.19, z);
  mask[v * 3] = Math.min(1, sole * 0.75 + heel * 0.6 + tip * 0.8 + toe * 0.25);
  mask[v * 3 + 1] = smooth(data.ycut - 0.005, data.ycut - 0.16, y);
  mask[v * 3 + 2] = foot;
  toeAttr[v] = toe;
}

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage));
geo.setAttribute('aRest', new THREE.BufferAttribute(rest0, 3));
geo.setAttribute('aMask', new THREE.BufferAttribute(mask, 3));
geo.setAttribute('aToe', new THREE.BufferAttribute(toeAttr, 1));
geo.setAttribute('aCap', new THREE.BufferAttribute(new Float32Array(NV), 1));
geo.setIndex(new THREE.BufferAttribute(index, 1));
geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 3);

// ───────────────────────── renderer / scene ─────────────────────────
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(32, 1, 0.02, 20);
camera.position.set(0.45, 0.32, 0.85);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.18;
controls.maxDistance = 3.2;
controls.target.set(0, 0.1, 0.08);

const key = new THREE.SpotLight(0xfff3e6, 7.5, 0, 0.55, 0.9, 1.4);
key.position.set(0.9, 1.9, 1.3);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0003;
key.shadow.normalBias = 0.005;
key.shadow.radius = 9;
key.shadow.blurSamples = 16;
key.shadow.camera.near = 0.5; key.shadow.camera.far = 5;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xdfe8ff, 1.5);   // back kicker
rim.position.set(-1.1, 1.0, -1.5);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xe6e9f5, 0.55); // broad soft fill
fill.position.set(-1.3, 0.7, 1.0);
scene.add(fill);
scene.add(new THREE.HemisphereLight(0x9aa0ad, 0x241a16, 0.55));

// floor: soft pool of light that fades into the background
{
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.55, '#777'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.9, 64),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.6, metalness: 0.0, alphaMap: tex, transparent: true, envMapIntensity: 0.15 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
}

// ───────────────────────── shaders ─────────────────────────
const NOISE = /* glsl */`
float hash31(vec3 p){ p = fract(p * vec3(.1031,.1030,.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(mix(hash31(i), hash31(i+vec3(1,0,0)), f.x), mix(hash31(i+vec3(0,1,0)), hash31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i+vec3(0,0,1)), hash31(i+vec3(1,0,1)), f.x), mix(hash31(i+vec3(0,1,1)), hash31(i+vec3(1,1,1)), f.x), f.y), f.z);
}`;

const bgSRGB = new THREE.Color(BG).convertLinearToSRGB();
const U = {
  uBg: { value: bgSRGB },
  uDamp: { value: 0.15 },
  uLift: { value: 0 },
  uBlush: { value: 0.6 },
  uNailC: { value: [] }, uNailA: { value: [] }, uNailS: { value: [] }, uNailU: { value: [] },
  uNailColor: { value: new THREE.Color(0xf3b9b4) },
  uNailMix: { value: 0.45 },
  // hosiery
  uSheer: { value: 0.4 },
  uGrab: { value: new THREE.Vector3(0, -9, 0) },
  uPull: { value: new THREE.Vector3() },
  uGrabR: { value: 0.05 },
  uHoles: { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector4(0, -9, 0, 0)) },
  uHoleN: { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector3(0, 0, 1)) },
  uRunDir: { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector3(0, 1, 0)) },
  uRunLen: { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector2()) },
  uHoleCount: { value: 0 },
};
for (const t of data.toes) {
  U.uNailC.value.push(new THREE.Vector3(...t.center));
  U.uNailA.value.push(new THREE.Vector3(...t.axis).multiplyScalar(1 / t.halfLen));
  U.uNailS.value.push(new THREE.Vector3(...t.sideAxis).multiplyScalar(1 / t.halfWidth));
  U.uNailU.value.push(new THREE.Vector3(...t.up));
}

const VERT_HEAD = /* glsl */`
attribute vec3 aRest; attribute vec3 aMask; attribute float aToe; attribute float aCap; varying float vCap;
uniform float uLift;
varying vec3 vRest; varying vec3 vMask; varying float vToe; varying float vWY;
`;
const FRAG_HEAD = /* glsl */`
varying vec3 vRest; varying vec3 vMask; varying float vToe; varying float vWY; varying float vCap;
uniform vec3 uBg; uniform float uDamp;
` + NOISE;

const skinMat = new THREE.MeshPhysicalMaterial({
  color: 0xf0c9ae, roughness: 0.5, metalness: 0, clearcoat: 0.1, clearcoatRoughness: 0.2,
  sheen: 0.35, sheenRoughness: 0.5, sheenColor: 0xffb0a0, envMapIntensity: 0.9,
});
skinMat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest; vMask = aMask; vToe = aToe; vWY = position.y + uLift;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_HEAD + /* glsl */`
      uniform float uBlush; uniform vec3 uNailColor; uniform float uNailMix;
      uniform vec3 uNailC[10]; uniform vec3 uNailA[10]; uniform vec3 uNailS[10]; uniform vec3 uNailU[10];
    `)
    .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
      float nailM = 0.0, nailTip = 0.0;
      for (int i = 0; i < 10; i++) {
        vec3 d = vRest - uNailC[i];
        float u = dot(d, uNailA[i]), v = dot(d, uNailS[i]), h = dot(d, uNailU[i]);
        float r = pow(pow(abs(u), 2.6) + pow(abs(v), 2.6), 1.0 / 2.6);
        float m = (1.0 - smoothstep(0.9, 1.0, r)) * smoothstep(-0.0045, -0.002, h);
        nailM = max(nailM, m);
        nailTip = max(nailTip, m * smoothstep(0.62, 0.8, u));
      }
      vec3 skinC = diffuseColor.rgb;
      // soft tonal variation + rosy soles / toes / heels
      float mott = vnoise(vRest * 55.0) * 0.6 + vnoise(vRest * 140.0) * 0.4;
      skinC *= 0.96 + 0.07 * mott;
      vec3 rosy = skinC * vec3(1.06, 0.70, 0.68) + vec3(0.07, 0.0, 0.005);
      skinC = mix(skinC, rosy, clamp(vMask.x * uBlush * (0.75 + 0.5 * mott), 0.0, 1.0));
      skinC *= mix(1.0, 0.93, uDamp);
      skinC *= mix(0.5, 1.0, smoothstep(0.0, 0.028, vWY));
      vec3 nailC = mix(skinC * vec3(1.08, 0.9, 0.9) + 0.06, uNailColor, uNailMix);
      nailC = mix(nailC, mix(nailC, vec3(0.97, 0.94, 0.92), 0.75), nailTip * (1.0 - uNailMix));
      diffuseColor.rgb = mix(skinC, nailC, nailM);
    `)
    .replace('#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
      roughnessFactor *= mix(1.0, 0.8 + 0.4 * vnoise(vRest * 34.0), uDamp * 0.5);
      roughnessFactor = mix(roughnessFactor, 0.1, nailM);
    `)
    .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
      float ndv = clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0);
      totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.42, 0.34) * pow(1.0 - ndv, 3.0) * 0.07 * (1.0 - nailM);
    `)
    .replace('#include <dithering_fragment>', /* glsl */`#include <dithering_fragment>
      gl_FragColor.rgb = mix(uBg, gl_FragColor.rgb, vMask.y);
    `);
};

const hoseMat = new THREE.MeshPhysicalMaterial({
  color: 0x0c0c10, roughness: 0.5, metalness: 0, sheen: 0.2, sheenRoughness: 0.3, sheenColor: 0x9090a8,
  transparent: true, side: THREE.DoubleSide, envMapIntensity: 0.45, depthWrite: true,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
});
const t1 = bones[boneId['toe1-1.L']].head, t5 = bones[boneId['toe5-1.L']].head;
const CUT = `#define CUT_X ${t1[0].toFixed(5)}\n#define CUT_Z ${(t1[2] + 0.004).toFixed(5)}\n#define CUT_K ${((t5[2] - t1[2]) / (t5[0] - t1[0])).toFixed(5)}\n`;
hoseMat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_HEAD + /* glsl */`
      uniform vec3 uGrab; uniform vec3 uPull; uniform float uGrabR;
      varying float vStretch;
    `)
    .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
      vRest = aRest; vMask = aMask; vToe = aToe; vWY = position.y + uLift; vCap = aCap;
      float gd = length(aRest - uGrab) / uGrabR;
      float gw = exp(-gd * gd * 0.9) * 0.45 + exp(-gd * 1.6) * 0.55;
      float pl = length(uPull);
      transformed += normal * (0.0011 + 0.004 * gw * min(pl * 20.0, 1.0)) + uPull * gw;
      vStretch = gw * pl * 11.0;
    `);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_HEAD + /* glsl */`
      uniform float uSheer; varying float vStretch;
      ${CUT}
      uniform vec4 uHoles[${MAX_HOLES}]; uniform vec3 uHoleN[${MAX_HOLES}]; uniform vec3 uRunDir[${MAX_HOLES}];
      uniform vec2 uRunLen[${MAX_HOLES}]; uniform int uHoleCount;
    `)
    .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
      // the leg fabric stops at the forefoot; the sock-like toe cap takes over from there
      float cut = vRest.z - (CUT_Z + (abs(vRest.x) - CUT_X) * CUT_K);
      if (vCap < 0.5 ? cut > 0.0008 : cut < -0.0008) discard;
      float hEdge = 0.0, ladder = 0.0, ladT = 0.0;
      float nA = vnoise(vRest * 95.0), nB = vnoise(vRest * 300.0);
      for (int i = 0; i < ${MAX_HOLES}; i++) {
        if (i >= uHoleCount) break;
        vec4 h = uHoles[i];
        vec3 d = vRest - h.xyz;
        float dist = length(d);
        if (dist > h.w * 1.6 + max(uRunLen[i].x, uRunLen[i].y)) continue;
        float r = h.w * (0.7 + 0.42 * nA + 0.1 * nB);
        if (dist < r) discard;
        hEdge = max(hEdge, 1.0 - smoothstep(r, r * 1.07 + 0.0009, dist));
        vec3 rd = uRunDir[i];
        float t = dot(d, rd);
        vec3 pp = d - rd * t; pp -= uHoleN[i] * dot(pp, uHoleN[i]);
        float L = t > 0.0 ? uRunLen[i].x : uRunLen[i].y;
        float tt = abs(t) / max(L, 1e-4);
        if (tt < 1.0 && abs(dot(d, uHoleN[i])) < 0.03) {
          float wd = h.w * 0.5 * (1.0 - tt * tt) * (0.8 + 0.4 * nA);
          float m = 1.0 - smoothstep(wd * 0.75, wd, length(pp));
          if (m > ladder) { ladder = m; ladT = t; }
        }
      }
      float ndvH = clamp(abs(dot(normalize(vViewPosition), normalize(vNormal))), 0.0, 1.0);
      float a = mix(uSheer, 1.0, pow(1.0 - ndvH, 1.5) * 0.9);
      a *= 1.0 - 0.7 * clamp(vStretch, 0.0, 1.0);
      // knit
      vec3 q = vRest * 9000.0;
      float kf = 1.0 - smoothstep(0.35, 1.3, fwidth(q.y) + fwidth(q.x) * 0.5);
      a *= 1.0 + 0.2 * kf * sin(q.x + q.z) * sin(q.y);
      // faint course lines and yarn irregularity
      a *= 1.0 + 0.05 * sin(vRest.y * 2600.0 + nA * 6.0) * (1.0 - smoothstep(0.2, 0.9, fwidth(vRest.y * 2600.0)));
      a *= 0.97 + 0.06 * vnoise(vRest * vec3(900.0, 60.0, 900.0));
      a *= 0.985 + 0.03 * nA;
      // ladders: only the cross threads remain
      float lt = ladT * 520.0;
      float thread = smoothstep(0.55, 0.75, abs(fract(lt) - 0.5) * 2.0);
      float lf = 1.0 - smoothstep(0.3, 1.0, fwidth(lt));
      a = mix(a, a * mix(0.3, 0.12 + 0.75 * thread, lf), ladder);
      a = mix(a, min(1.0, a * 1.5 + 0.2), hEdge);
      // reinforced toe with seam, and a denser welt band at the top
      float cap = vCap * smoothstep(0.0, 0.004, cut);
      float seam = 1.0 - smoothstep(0.0006, 0.0022, abs(cut));
      a = mix(a, min(1.0, a * 1.1 + 0.03), cap);
      a = mix(a, min(1.0, a * 1.2 + 0.05), seam * 0.5);
      float welt = 1.0 - smoothstep(0.86, 0.985, vMask.y);
      a = mix(a, min(1.0, a * 1.9 + 0.3), welt);
      // fabric thins where it is stretched over the heel and the ball of the foot
      a *= 1.0 - 0.18 * vMask.x * (1.0 - cap);
      a *= mix(1.0, 1.15, uDamp);
      diffuseColor.a = clamp(a, 0.0, 1.0) * vMask.y;
    `)
    .replace('#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
      roughnessFactor *= mix(1.0, 0.6, uDamp);
    `);
};

const skin = new THREE.Mesh(geo, skinMat);
skin.castShadow = skin.receiveShadow = true;
skin.frustumCulled = false;
const hose = new THREE.Mesh(geo, hoseMat);
hose.receiveShadow = true;
hose.frustumCulled = false;
hose.renderOrder = 2;
const capD = data.cap, NC = capD.vertexCount;
const capRest = b64(capD.positions, Float32Array), capIndex = b64(capD.index, Uint32Array);
const capSI = b64(capD.skinIndex, Uint8Array), capSW = b64(capD.skinWeight, Uint8Array);
const capPos = new Float32Array(NC * 3), capNrm = new Float32Array(NC * 3);
const capGeo = new THREE.BufferGeometry();
capGeo.setAttribute('position', new THREE.BufferAttribute(capPos, 3).setUsage(THREE.DynamicDrawUsage));
capGeo.setAttribute('normal', new THREE.BufferAttribute(capNrm, 3).setUsage(THREE.DynamicDrawUsage));
capGeo.setAttribute('aRest', new THREE.BufferAttribute(capRest, 3));
capGeo.setAttribute('aMask', new THREE.BufferAttribute(new Float32Array(NC * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
capGeo.setAttribute('aToe', new THREE.BufferAttribute(b64(capD.toe, Uint8Array), 1, true));
capGeo.setAttribute('aCap', new THREE.BufferAttribute(new Float32Array(NC).fill(1), 1));
capGeo.setIndex(new THREE.BufferAttribute(capIndex, 1));
capGeo.boundingSphere = geo.boundingSphere;
const toeCap = new THREE.Mesh(capGeo, hoseMat);
toeCap.receiveShadow = true; toeCap.frustumCulled = false; toeCap.renderOrder = 2;
const body = new THREE.Group();
body.add(skin, hose, toeCap);
scene.add(body);

// ───────────────────────── rig ─────────────────────────
const P_KEYS = ['hipX', 'hipY', 'hipZ', 'knee', 'ankX', 'ankY', 'ankZ', 'curl', 'spread', 'big'];
const LEG0 = Object.fromEntries(P_KEYS.map(k => [k, 0]));
const mkPose = (p) => {
  const L = { ...LEG0, ...(p.L || {}) };
  const R = { ...LEG0, ...(p.R || p.L || {}) };
  return { root: p.root || [0, 0, 0], L, R, cam: (p.cam || [0.42, 0.26, 0.8]).map(x => x * 1.5), look: p.look || 0.5 };
};
// angles in degrees. hipX<0 = leg forward, knee>0 = bend, ankX>0 = point, curl>0 = toes curl down
const CLOSE = { hipZ: -7.3, ankZ: 7.3 };
const POSES = {
  'Standing': mkPose({ L: { ...CLOSE, hipY: 6, spread: 2 }, cam: [0.4, 0.24, 0.78] }),
  'Tiptoe': mkPose({ L: { ...CLOSE, ankX: 50, curl: -52 }, cam: [0.5, 0.16, 0.7] }),
  'Pointe': mkPose({
    L: { ...CLOSE, hipX: -30, hipZ: -5, ankX: 58, curl: 22, hipY: 14 },
    R: { ...CLOSE, hipY: 12 }, cam: [0.62, 0.22, 0.62],
  }),
  'Stride': mkPose({
    L: { ...CLOSE, hipX: -24, knee: 6, ankX: -12, curl: -8 },
    R: { ...CLOSE, hipX: 14, knee: 32, ankX: 22, curl: -48 }, cam: [0.8, 0.2, 0.35],
  }),
  'Soles': mkPose({
    root: [-84, 0, 0],
    L: { ...CLOSE, hipZ: -5.5, ankZ: 4, ankX: 14, curl: -6, spread: 9, hipY: 5 },
    cam: [0.1, 0.16, 0.72], look: 0.55,
  }),
  'Crossed': mkPose({
    root: [-80, 0, 0],
    L: { hipZ: -13.5, hipX: -5, ankX: 30, curl: 12, ankZ: 4, hipY: -6 },
    R: { hipZ: -11.5, hipX: 2.5, ankX: 22, curl: 6, hipY: 4 },
    cam: [0.42, 0.3, 0.6], look: 0.55,
  }),
  'Feet up': mkPose({
    root: [90, 0, 0],
    L: { ...CLOSE, hipZ: -5, knee: 104, ankX: 34, curl: 16, spread: 4 },
    R: { ...CLOSE, hipZ: -5, knee: 82, ankX: 20, curl: -4, spread: 6 },
    cam: [0.5, 0.34, -0.72], look: 0.6,
  }),
  'Scrunch': mkPose({
    L: { ...CLOSE, hipX: -16, knee: 34, ankX: 30, curl: 44, hipY: 8 },
    R: { ...CLOSE, curl: 30, hipY: 8 }, cam: [0.45, 0.22, 0.62],
  }),
};

const TOE_TYPES = {
  'Egyptian': [1.10, 0.98, 0.95, 0.92, 0.90],
  'Greek': [0.98, 1.15, 1.04, 0.95, 0.90],
  'Roman': [1.04, 1.05, 1.11, 0.97, 0.90],
  'Square': [0.99, 1.03, 1.12, 1.16, 1.12],
};

const state = {
  pose: 'Standing', toeType: 'Egyptian', width: 0, arch: 0.2, toeLen: 0, wiggle: true,
};
const flat = (p) => [...p.root, ...P_KEYS.map(k => p.L[k]), ...P_KEYS.map(k => p.R[k])];
let cur = flat(POSES[state.pose]), from = cur.slice(), to = cur.slice(), tPose = 1;
let toeScale = TOE_TYPES[state.toeType].slice(), toeScaleTo = toeScale.slice();
let camGoal = null;

const HIP = new THREE.Vector3(0, bones[boneId['upperleg01.L']].head[1], bones[boneId['upperleg01.L']].head[2]);
const boneM = bones.map(() => new THREE.Matrix4());
const mats = new Float32Array(NB * 12);
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _e = new THREE.Euler(), _s = new THREE.Matrix4();
const pivot = (out, head, rx, ry, rz, scaleAxis, scale) => {
  out.makeTranslation(head[0], head[1], head[2]);
  _r.makeRotationFromEuler(_e.set(rx * D2R, ry * D2R, rz * D2R, 'ZYX'));
  out.multiply(_r);
  if (scaleAxis) {
    const [x, y, z] = scaleAxis, k = scale - 1;
    _s.set(1 + k * x * x, k * x * y, k * x * z, 0, k * x * y, 1 + k * y * y, k * y * z, 0, k * x * z, k * y * z, 1 + k * z * z, 0, 0, 0, 0, 1);
    out.multiply(_s);
  }
  out.multiply(_m.makeTranslation(-head[0], -head[1], -head[2]));
  return out;
};
const toeAxis = {};
for (const b of bones) if (/toe\d-1/.test(b.name)) {
  const a = new THREE.Vector3(b.tail[0] - b.head[0], 0, b.tail[2] - b.head[2]).normalize();
  toeAxis[b.name] = [a.x, a.y, a.z];
}
const local = new THREE.Matrix4();

function solve(time) {
  const p = cur;
  pivot(boneM[0], [HIP.x, HIP.y, HIP.z], p[0], p[1], p[2]);
  for (let i = 1; i < NB; i++) {
    const b = bones[i], nm = b.name, L = nm.endsWith('.L');
    const s = L ? 1 : -1, o = 3 + (L ? 0 : P_KEYS.length);
    const g = (k) => p[o + P_KEYS.indexOf(k)];
    let rx = 0, ry = 0, rz = 0, ax = null, sc = 1;
    if (nm.startsWith('upperleg01')) { rx = g('hipX'); ry = s * g('hipY'); rz = s * g('hipZ'); }
    else if (nm.startsWith('lowerleg01')) { rx = g('knee'); }
    else if (nm.startsWith('foot')) {
      rx = g('ankX'); ry = s * g('ankY'); rz = s * g('ankZ');
      ax = [1, 0, 0]; sc = 1 + state.width * 0.13;
    } else if (nm.startsWith('toe')) {
      const n = +nm[3], seg = +nm[5], curl = g('curl');
      const wig = state.wiggle ? Math.sin(time * 1.1 + n * 0.9 + (L ? 0 : 1.7)) * 2.2 + Math.sin(time * 0.37 + n) * 1.5 : 0;
      if (seg === 1) {
        rx = (curl > 0 ? curl * 0.75 : curl) + wig - (n === 1 ? g('big') : 0);
        ry = s * (g('spread') + (state.wiggle ? Math.sin(time * 0.5 + (L ? 0 : 2)) * 1.2 : 0)) * (n - 3) * 0.55;
        ax = toeAxis[nm]; sc = toeScale[n - 1] * (1 + state.toeLen * 0.14);
      } else rx = Math.max(curl, 0) * (seg === 2 ? 0.85 : 0.6) + wig * 0.6;
    }
    pivot(local, b.head, rx, ry, rz, ax, sc);
    boneM[i].multiplyMatrices(boneM[b.parent], local);
  }
  for (let i = 0; i < NB; i++) {
    const e = boneM[i].elements, o = i * 12;
    mats[o] = e[0]; mats[o + 1] = e[4]; mats[o + 2] = e[8]; mats[o + 3] = e[12];
    mats[o + 4] = e[1]; mats[o + 5] = e[5]; mats[o + 6] = e[9]; mats[o + 7] = e[13];
    mats[o + 8] = e[2]; mats[o + 9] = e[6]; mats[o + 10] = e[10]; mats[o + 11] = e[14];
  }
}

const m12 = new Float32Array(12);
function skinVerts() {
  let minY = 1e9;
  for (let v = 0; v < NV; v++) {
    m12.fill(0);
    let ws = 0;
    for (let k = 0; k < K; k++) {
      const w = skinW[v * K + k];
      if (!w) break;
      const o = skinIdx[v * K + k] * 12;
      ws += w;
      for (let j = 0; j < 12; j++) m12[j] += mats[o + j] * w;
    }
    ws = 1 / ws;
    for (let j = 0; j < 12; j++) m12[j] *= ws;
    const x = rest[v * 3], y = rest[v * 3 + 1], z = rest[v * 3 + 2];
    positions[v * 3] = m12[0] * x + m12[1] * y + m12[2] * z + m12[3];
    const py = positions[v * 3 + 1] = m12[4] * x + m12[5] * y + m12[6] * z + m12[7];
    positions[v * 3 + 2] = m12[8] * x + m12[9] * y + m12[10] * z + m12[11];
    if (py < minY && mask[v * 3 + 1] > 0.5) minY = py;
  }
  computeNormals(positions, normals);
  if (hose.visible) {
    for (let v = 0; v < NC; v++) {
      m12.fill(0);
      let ws = 0;
      for (let k = 0; k < K; k++) {
        const w = capSW[v * K + k];
        if (!w) break;
        const o = capSI[v * K + k] * 12;
        ws += w;
        for (let j = 0; j < 12; j++) m12[j] += mats[o + j] * w;
      }
      ws = 1 / ws;
      const x = capRest[v * 3], y = capRest[v * 3 + 1], z = capRest[v * 3 + 2];
      capPos[v * 3] = (m12[0] * x + m12[1] * y + m12[2] * z + m12[3]) * ws;
      capPos[v * 3 + 1] = (m12[4] * x + m12[5] * y + m12[6] * z + m12[7]) * ws;
      capPos[v * 3 + 2] = (m12[8] * x + m12[9] * y + m12[10] * z + m12[11]) * ws;
    }
    computeNormals(capPos, capNrm, capIndex);
    capGeo.attributes.position.needsUpdate = true;
    capGeo.attributes.normal.needsUpdate = true;
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.normal.needsUpdate = true;
  body.position.y = -minY;
  U.uLift.value = -minY;
}

// arch morph (applied to the rest pose)
const ank = bones[boneId['foot.L']].head, ball = bones[boneId['toe1-1.L']].head;
function applyShape() {
  const z0 = ank[2] - 0.035, z1 = ball[2] + 0.005;
  for (let v = 0; v < NV; v++) {
    const f = mask[v * 3 + 2];
    let dy = 0;
    if (f > 0.01) {
      const x = Math.abs(rest0[v * 3]), y = rest0[v * 3 + 1], z = rest0[v * 3 + 2];
      const u = Math.min(1, Math.max(0, (z - z0) / (z1 - z0)));
      const bump = Math.sin(Math.PI * u) ** 2;
      const medial = smooth(ank[0] + 0.03, ank[0] - 0.035, x);
      dy = state.arch * 0.013 * bump * (0.25 + 0.75 * medial) * smooth(0.06, 0.0, y) * f;
    }
    rest[v * 3 + 1] = rest0[v * 3 + 1] + dy;
  }
}
applyShape();

// ───────────────────────── hosiery pull / rip ─────────────────────────
const holes = [];   // {p:Vector3 (rest), n, dir, r, up, down}
const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
let grab = null;    // {restP, world, plane, vert}
const pull = new THREE.Vector3(), pullVel = new THREE.Vector3(), pullGoal = new THREE.Vector3();
const RIP_AT = 0.085;

function syncHoles() {
  holes.forEach((h, i) => {
    U.uHoles.value[i].set(h.p.x, h.p.y, h.p.z, h.rNow);
    U.uHoleN.value[i].copy(h.n);
    U.uRunDir.value[i].copy(h.dir);
    U.uRunLen.value[i].set(h.upNow, h.downNow);
  });
  U.uHoleCount.value = holes.length;
  document.getElementById('ripCount').textContent = holes.length ? `${holes.length} rip${holes.length > 1 ? 's' : ''}` : '';
}
function inHole(p) { return holes.some(h => h.p.distanceTo(p) < h.rNow * 0.8); }

function rip(g, strength) {
  const p = g.restP;
  let h = holes.find(h => h.p.distanceTo(p) < h.r * 1.7 + 0.01);
  if (h) {
    h.p.lerp(p, 0.35);
    h.r = Math.min(0.075, h.r + 0.008 + strength * 0.25);
    h.up = Math.min(0.5, h.up * 1.3 + 0.03); h.down = Math.min(0.5, h.down * 1.3 + 0.03);
  } else {
    if (holes.length >= MAX_HOLES) holes.shift();
    const r = 0.011 + strength * 0.2 + Math.random() * 0.004;
    h = { p: p.clone(), n: g.restN.clone(), dir: g.dir.clone(), r, rNow: r * 0.2,
      up: 0.03 + Math.random() * 0.12, down: 0.02 + Math.random() * 0.09, upNow: 0, downNow: 0 };
    holes.push(h);
  }
  syncHoles();
}

function pick(ev) {
  const rc = canvas.getBoundingClientRect();
  ptr.set(((ev.clientX - rc.left) / rc.width) * 2 - 1, -((ev.clientY - rc.top) / rc.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
}
const _v = new THREE.Vector3();
canvas.addEventListener('pointerdown', (ev) => {
  if (!hose.visible || ev.button !== 0) return;
  pick(ev);
  const hit = ray.intersectObject(skin, false)[0];
  if (!hit) return;
  // nearest vertex of the hit face → rest-space anchor
  const f = hit.face; let best = f.a, bd = 1e9;
  for (const vi of [f.a, f.b, f.c]) {
    _v.fromArray(positions, vi * 3).add(body.position);
    const d = _v.distanceTo(hit.point); if (d < bd) { bd = d; best = vi; }
  }
  const restP = new THREE.Vector3().fromArray(rest0, best * 3);
  if (inHole(restP) || mask[best * 3 + 1] < 0.25) return;
  const b = bones[skinIdx[best * K]];
  const dir = new THREE.Vector3(b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]).normalize();
  const restNn = new THREE.Vector3().fromArray(restN, best * 3);
  dir.addScaledVector(restNn, -dir.dot(restNn)).normalize();
  grab = {
    restP, restN: restNn, dir, world: hit.point.clone(), ripped: false,
    plane: new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), hit.point),
  };
  U.uGrab.value.copy(restP);
  pull.set(0, 0, 0); pullVel.set(0, 0, 0); pullGoal.set(0, 0, 0);
  controls.enabled = false;
  canvas.classList.add('pull');
  canvas.setPointerCapture(ev.pointerId);
  ev.stopPropagation();
}, true);
canvas.addEventListener('pointermove', (ev) => {
  if (!grab || grab.ripped) return;
  pick(ev);
  if (!ray.ray.intersectPlane(grab.plane, _v)) return;
  pullGoal.copy(_v).sub(grab.world);
  const len = pullGoal.length();
  pullGoal.addScaledVector(grab.plane.normal, len * 0.55);
  const total = pullGoal.length();
  if (total > 0.2) pullGoal.multiplyScalar(0.2 / total);
  if (total > RIP_AT) {
    rip(grab, Math.min(0.1, total - RIP_AT));
    grab.ripped = true;         // fabric tears out of the fingers and snaps back
    pullVel.copy(pullGoal).multiplyScalar(-6);
    pullGoal.set(0, 0, 0);
  }
});
const release = () => {
  if (!grab) return;
  grab = null; pullGoal.set(0, 0, 0);
  controls.enabled = true;
  canvas.classList.remove('pull');
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

// ───────────────────────── UI ─────────────────────────
const $ = (id) => document.getElementById(id);
const group = (host, items, onPick, initial, swatch) => {
  const el = $(host);
  items.forEach(([name, val]) => {
    const b = document.createElement('button');
    if (swatch) { b.style.background = val.css; b.title = name; } else b.textContent = name;
    if (name === initial) b.classList.add('on');
    b.onclick = () => { [...el.children].forEach(c => c.classList.remove('on')); b.classList.add('on'); onPick(name, val); };
    el.appendChild(b);
  });
};
function setPose(name) {
  state.pose = name;
  from = cur.slice(); to = flat(POSES[name]); tPose = 0;
  camGoal = { off: new THREE.Vector3(...POSES[name].cam), t: 0 };
}
group('poses', Object.keys(POSES).map(k => [k]), setPose, state.pose);
group('types', Object.keys(TOE_TYPES).map(k => [k]), (n) => { state.toeType = n; toeScaleTo = TOE_TYPES[n].slice(); }, state.toeType);

const TONES = [['Porcelain', 0xf7dfd0], ['Fair', 0xf0c9ae], ['Warm', 0xe2b08c], ['Tan', 0xc68e66], ['Brown', 0x94603f], ['Deep', 0x5b3826]];
group('tones', TONES.map(([n, c]) => [n, { css: '#' + c.toString(16).padStart(6, '0'), c }]), (_, v) => skinMat.color.setHex(v.c), 'Fair', true);

const NAILS = [['Natural', 0xf3b9b4, 0.45], ['Pink', 0xff7fa5, 1], ['Red', 0xc0122c, 1], ['Wine', 0x4d0b1c, 1], ['Black', 0x0b0b0e, 1], ['White', 0xf4f1ee, 1], ['Lilac', 0xb69cf0, 1]];
group('nails', NAILS.map(([n, c, m]) => [n, { css: '#' + c.toString(16).padStart(6, '0'), c, m }]),
  (_, v) => { U.uNailColor.value.setHex(v.c); U.uNailMix.value = v.m; }, 'Natural', true);

const HOSE = [['Black', 0x0c0c10, 0x9090a8], ['Smoke', 0x34343e, 0xa0a0b4], ['Nude', 0xb4855f, 0xffd9b8], ['White', 0xe6e2dd, 0xffffff], ['Wine', 0x520d1c, 0xff8098], ['Navy', 0x0e1636, 0x8fa4ff]];
group('hoseColors', HOSE.map(([n, c, s]) => [n, { css: '#' + c.toString(16).padStart(6, '0'), c, s }]),
  (_, v) => { hoseMat.color.setHex(v.c); hoseMat.sheenColor.setHex(v.s); }, 'Black', true);

const toggle = (id, fn) => {
  const b = $(id);
  b.onclick = () => { const on = !b.classList.contains('on'); b.classList.toggle('on', on); b.querySelector('i').textContent = on ? 'on' : 'off'; fn(on); };
};
toggle('hoseOn', (on) => { hose.visible = toeCap.visible = on; dirty = true; });
toggle('wiggle', (on) => { state.wiggle = on; dirty = true; });
const setDamp = (v) => {
  U.uDamp.value = v;
  skinMat.roughness = 0.5 - 0.34 * v;
  skinMat.clearcoat = Math.min(1, 0.05 + 1.1 * v);
  skinMat.clearcoatRoughness = 0.26 - 0.22 * v;
  skinMat.envMapIntensity = 0.9 + 0.9 * v;
  skinMat.sheen = 0.35 * (1 - v);
};
const setDenier = (v) => { U.uSheer.value = 0.22 + 0.76 * v; };
$('damp').oninput = (e) => setDamp(+e.target.value);
$('blush').oninput = (e) => { U.uBlush.value = +e.target.value; };
$('denier').oninput = (e) => setDenier(+e.target.value);
$('width').oninput = (e) => { state.width = +e.target.value; dirty = true; };
$('toeLen').oninput = (e) => { state.toeLen = +e.target.value; dirty = true; };
$('arch').oninput = (e) => { state.arch = +e.target.value; applyShape(); dirty = true; };
$('mend').onclick = () => { holes.length = 0; syncHoles(); };
$('panelBtn').onclick = () => $('panel').classList.toggle('closed');
setDamp(0.15); setDenier(0.4);

// ───────────────────────── loop ─────────────────────────
let dirty = true;
const feetCenter = new THREE.Vector3();
const footBones = ['foot.L', 'foot.R', 'toe3-1.L', 'toe3-1.R'].map(n => boneId[n]);
function updateFeetCenter() {
  feetCenter.set(0, 0, 0);
  for (const i of footBones) { _v.fromArray(bones[i].head).applyMatrix4(boneM[i]); feetCenter.add(_v); }
  feetCenter.multiplyScalar(1 / footBones.length).add(body.position);
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 44 : 32;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clock = new THREE.Clock();
let time = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;

  if (tPose < 1) {
    tPose = Math.min(1, tPose + dt / 1.1);
    const k = ease(tPose);
    for (let i = 0; i < cur.length; i++) cur[i] = from[i] + (to[i] - from[i]) * k;
    dirty = true;
  }
  for (let i = 0; i < 5; i++) {
    const d = toeScaleTo[i] - toeScale[i];
    if (Math.abs(d) > 1e-4) { toeScale[i] += d * Math.min(1, dt * 6); dirty = true; }
  }
  if (dirty || state.wiggle) {
    solve(time); skinVerts(); updateFeetCenter(); dirty = false;
  }

  // pull spring
  if (grab && !grab.ripped) { pull.lerp(pullGoal, Math.min(1, dt * 22)); pullVel.set(0, 0, 0); }
  else {
    pullVel.addScaledVector(pull, -420 * dt).multiplyScalar(Math.exp(-11 * dt));
    pull.addScaledVector(pullVel, dt);
  }
  U.uPull.value.copy(pull);
  // holes open up + ladders run
  let ch = false;
  for (const h of holes) {
    for (const [a, b, sp] of [['rNow', 'r', 14], ['upNow', 'up', 2.2], ['downNow', 'down', 2.2]]) {
      const d = h[b] - h[a];
      if (Math.abs(d) > 1e-5) { h[a] += d * Math.min(1, dt * sp); ch = true; }
    }
  }
  if (ch) syncHoles();

  if (camGoal) {
    camGoal.t = Math.min(1, camGoal.t + dt / 1.3);
    const k = Math.min(1, dt * 4);
    const look = _v.copy(feetCenter);
    controls.target.lerp(look, k);
    camera.position.lerp(look.clone().add(camGoal.off), k);
    if (camGoal.t >= 1) camGoal = null;
  }
  key.target.position.copy(feetCenter);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
solve(0); skinVerts(); updateFeetCenter();
controls.target.copy(feetCenter);
camera.position.copy(feetCenter).add(new THREE.Vector3(...POSES[state.pose].cam));
$('load').style.opacity = 0; setTimeout(() => $('load').remove(), 600);
requestAnimationFrame(frame);

// debug / automation hook
window.__feet = { skinMat, hoseMat, scene, THREE, skin,  setPose, POSES, state, holes, rip, syncHoles, hose, U, camera, controls, rest0, restN, skinIdx, bones, mask,
  jump() { tPose = 1; cur = to.slice(); camGoal = null; solve(time); skinVerts(); updateFeetCenter();
    controls.target.copy(feetCenter); camera.position.copy(feetCenter).add(new THREE.Vector3(...POSES[state.pose].cam)); } };
