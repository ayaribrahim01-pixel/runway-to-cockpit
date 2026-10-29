import React, {useMemo} from 'react';
import * as THREE from 'three';
import {Airliner} from './Airliner';
import {GROUND_Y, MAIN_GEAR} from './airliner';
import {Cam, CloudDeck, CumulusField, Sky, SKY_AIRPORT, SKY_CRUISE, SkyEnvironment, SunLight} from './env';
import {facadeTexture, grassTexture, Livery, noiseTexture, rng, runwayTexture, thresholdTexture, treeTexture} from './textures';

// The two original 3D "locations": cruise above a cloud deck, and a take-off from an airport.

type V3 = [number, number, number];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const D2R = Math.PI / 180;

/** gentle hand-held camera wobble */
export function drift(t: number, k: number): V3 {
  return [
    k * (Math.sin(t * 0.83) * 0.6 + Math.sin(t * 2.1 + 1.3) * 0.22),
    k * (Math.sin(t * 0.61 + 0.4) * 0.5 + Math.sin(t * 1.7 + 2.2) * 0.18),
    k * (Math.sin(t * 0.47 + 2.0) * 0.45 + Math.sin(t * 1.3 + 0.7) * 0.15),
  ];
}
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** camera on a sphere around the aircraft: azimuth from the nose toward the right wing, distance, elevation (deg) */
function orbitPos(azDeg: number, dist: number, elDeg: number): V3 {
  const az = azDeg * D2R;
  const el = elDeg * D2R;
  return [dist * Math.cos(el) * Math.cos(az), dist * Math.sin(el), dist * Math.cos(el) * Math.sin(az)];
}

export type CamSpec = {pos: V3; target: V3; fov: number; roll?: number};

/** u = 0..1 through the shot, t = seconds */
export function cruiseCamera(view: string, u: number, t: number): CamSpec {
  const e = smooth(u) * 0.35 + u * 0.65;
  switch (view) {
    case 'front':
      return {pos: add(orbitPos(lerp(40, 27, e), 31, lerp(3.6, 2.6, e)), drift(t, 0.35)), target: [0.5, -0.5, 0], fov: 30};
    case 'rear':
      return {pos: add(orbitPos(lerp(152, 140, e), 33, lerp(8.5, 7, e)), drift(t, 0.4)), target: [1.5, -0.3, 0], fov: 32};
    case 'below':
      return {pos: add([lerp(15, 7, e), -10.5, 23], drift(t, 0.3)), target: [0, -0.4, 0], fov: 33};
    case 'wing':
      return {pos: add([3.75, 0.42, 1.07], drift(t, 0.2).map((v) => v * 0.15) as V3), target: [lerp(-0.6, -0.2, e), -0.95, 9.2], fov: 58, roll: -0.05};
    case 'chase':
      return {pos: add([lerp(-46, -40, e), lerp(6.5, 5.5, e), lerp(4, 9, e)], drift(t, 1.5)), target: [0, 0.4, 0], fov: 25};
    case 'top':
      return {pos: add([lerp(6, 0, e), 36, lerp(16, 12, e)], drift(t, 0.3)), target: [0, -0.5, 0], fov: 33};
    case 'orbit':
      return {pos: add(orbitPos(lerp(15, 75, e), 30, lerp(3, 8, e)), drift(t, 0.3)), target: [0, -0.4, 0], fov: 31};
    case 'side':
    default:
      return {pos: add([lerp(-5, 5, e), 2.4, 31], drift(t, 0.35)), target: [lerp(-1, 1, e) + 0.5, -0.3, 0], fov: 30};
  }
}

const LIGHTS_ON = 0.75;

/** Cruise: the aircraft holds the centre; clouds stream past underneath. */
export const CruiseWorld: React.FC<{livery: Livery; frame: number; dur: number; view: string; shift?: number; fps?: number}> = ({
  livery,
  frame,
  dur,
  view,
  shift = 0,
  fps = 30,
}) => {
  const t = frame / fps;
  const u = clamp01(frame / Math.max(1, dur));
  const speed = 115; // units/s (≈ 230 m/s true airspeed)
  const offsetX = t * speed;
  const c = cruiseCamera(view, u, t);
  const bank = 1.3 * D2R * Math.sin(t * 0.35 + 0.6);
  const bob = 0.16 * Math.sin(t * 0.8) + 0.06 * Math.sin(t * 2.3 + 1);
  const pitch = 0.4 * D2R * Math.sin(t * 0.5 + 1.2);
  const spec = SKY_CRUISE;
  return (
    <>
      <Cam pos={c.pos} target={c.target} fov={c.fov} roll={c.roll} shift={shift} />
      <color attach="background" args={[spec.horizon]} />
      <fog attach="fog" args={[spec.haze, 3500, 17000]} />
      <Sky spec={spec} center={c.pos} />
      <SkyEnvironment spec={spec} intensity={0.9} />
      <SunLight spec={spec} box={13} intensity={3.1} />
      <CloudDeck spec={spec} y={-340} cam={c.pos} offsetX={offsetX} />
      <CumulusField offsetX={offsetX} baseY={-340} seed={11} count={34} minDist={2600} span={22000} cam={c.pos} />
      <group position={[0, bob, 0]} rotation={[bank, 0, pitch]}>
        <Airliner livery={livery} frame={frame} fps={fps} gear={1} spin={t * Math.PI * 2 * 1.1} lights={LIGHTS_ON} />
      </group>
    </>
  );
};

// ─── take-off ───────────────────────────────────────────────────────────────────────────

const X0 = 76.5;
const T_ROT = 5.0;
const T_LO = 6.7;

export function takeoffState(tau: number) {
  const x = X0 + 28 * tau + 0.8 * tau * tau;
  const pitchDeg = smooth((tau - T_ROT) / 2.4) * 8.5 + smooth((tau - T_ROT - 2.4) / 3) * 3;
  // climb: vertical speed ramps up to 7.5 units/s over 3.2 s after lift-off
  const dt = tau - T_LO;
  const ramp = 3.2;
  const vs = 7.5;
  const h = dt <= 0 ? 0 : dt < ramp ? (vs * dt * dt) / (2 * ramp) : (vs * ramp) / 2 + vs * (dt - ramp);
  const gear = smooth((tau - T_LO - 2) / 4);
  const roll = (x - X0) / MAIN_GEAR.tire;
  return {x, h, pitch: pitchDeg * D2R, gear, roll};
}

export function airportCamera(view: string, ac: V3, u: number, t: number): CamSpec {
  switch (view) {
    case 'head-on':
      return {pos: add([560, 1.6, 4], drift(t, 0.06)), target: [ac[0], ac[1] + 2.2, ac[2]], fov: lerp(16, 30, smooth(u))};
    case 'low':
      return {pos: add([300, 0.9, 30], drift(t, 0.05)), target: ac, fov: lerp(30, 38, u)};
    case 'spotter':
      return {pos: add([335, 3.6, 66], drift(t, 0.12)), target: [ac[0], ac[1] + 0.4, ac[2]], fov: lerp(22, 27, u)};
    case 'follow':
    default:
      return {pos: add([ac[0] - 14, 3.2 + ac[1] * 0.4, 44], drift(t, 0.25)), target: ac, fov: 34};
  }
}

const RW = 22.5; // runway width (45 m)
const RWY_START = -55;
const RWY_LEN = 1655;
const THR_LEN = 45;
const TWY_Z = -92;

/** a flat strip lying on the ground: `along` = length along +X, `across` = width along Z; v runs along +X */
function strip(along: number, across: number) {
  const g = new THREE.PlaneGeometry(across, along);
  g.rotateX(-Math.PI / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

/** merge many crossed-quad billboards (trees) into one geometry */
function mergeQuads(items: {x: number; z: number; s: number; a: number}[]) {
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  let v = 0;
  for (const it of items) {
    for (const rot of [it.a, it.a + Math.PI / 2]) {
      const dx = (Math.cos(rot) * it.s) / 2;
      const dz = (Math.sin(rot) * it.s) / 2;
      const h = it.s;
      pos.push(it.x - dx, 0, it.z - dz, it.x + dx, 0, it.z + dz, it.x + dx, h, it.z + dz, it.x - dx, h, it.z - dz);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      for (let k = 0; k < 4; k++) nor.push(0, 1, 0);
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** a ring of low hills around the airport (hides the edge of the world) */
function hillRing(radius: number, height: number, seed: number, cx: number) {
  const n = 240;
  const r = rng(seed);
  const knots = Array.from({length: 24}, () => r());
  const hAt = (k: number) => {
    const p = (k / n) * knots.length;
    const i = Math.floor(p);
    const f = p - i;
    const a = knots[i % knots.length];
    const b = knots[(i + 1) % knots.length];
    const s = f * f * (3 - 2 * f);
    return height * (0.35 + 0.65 * (a + (b - a) * s)) * (0.85 + 0.15 * Math.sin(k * 0.9));
  };
  const pos: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const ro = radius + 450;
    pos.push(cx + c * ro, -2, s * ro, cx + c * radius, hAt(k), s * radius, cx + c * (radius - 260), -2, s * (radius - 260));
  }
  for (let k = 0; k < n; k++) {
    const a = k * 3;
    const b = (k + 1) * 3;
    idx.push(a, b, a + 1, b, b + 1, a + 1, a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export const Airport: React.FC = React.memo(() => {
  const parts = useMemo(() => {
    // ground: tiled grass with large-scale tone variation and mowing stripes beside the runway
    const grass = grassTexture();
    grass.repeat.set(300, 300);
    const noise = noiseTexture(512);
    const groundMat = new THREE.MeshStandardMaterial({map: grass, roughness: 1, metalness: 0});
    groundMat.onBeforeCompile = (shader) => {
      shader.uniforms.noiseMap = {value: noise};
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D noiseMap;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          float m1 = texture2D(noiseMap, vWPos.xz * 0.0011).r;
          float m2 = texture2D(noiseMap, vWPos.xz * 0.0043 + 0.5).g;
          diffuseColor.rgb *= 1.0 + (m1 - 0.5) * 0.55 + (m2 - 0.5) * 0.3;
          float band = smoothstep(150.0, 70.0, abs(vWPos.z));
          float stripe = step(0.5, fract(vWPos.x / 36.0));
          diffuseColor.rgb *= 1.0 + band * (stripe - 0.5) * 0.12;`,
        );
    };
    groundMat.customProgramCacheKey = () => 'ground-v1';
    const ground = new THREE.PlaneGeometry(15000, 15000).rotateX(-Math.PI / 2);

    const rwyTex = runwayTexture();
    rwyTex.repeat.set(1, (RWY_LEN - THR_LEN) / 25);
    const rwyMat = new THREE.MeshStandardMaterial({map: rwyTex, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4});
    const thrMat = new THREE.MeshStandardMaterial({map: thresholdTexture('09'), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4});
    const asphalt = new THREE.MeshStandardMaterial({color: '#6A7079', roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
    const shoulder = new THREE.MeshStandardMaterial({color: '#8C9198', roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1});
    const yellow = new THREE.MeshBasicMaterial({color: '#E9B620', polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6});

    // edge + threshold lights
    const bulb = new THREE.SphereGeometry(0.1, 8, 6);
    const edgeMat = new THREE.MeshBasicMaterial({color: '#FFF7E6'});
    const edgePos: V3[] = [];
    for (let x = RWY_START; x <= RWY_START + RWY_LEN; x += 30) for (const z of [-11.9, 11.9]) edgePos.push([x, 0.25, z]);
    const edge = new THREE.InstancedMesh(bulb, edgeMat, edgePos.length);
    const m4 = new THREE.Matrix4();
    edgePos.forEach((p, i) => edge.setMatrixAt(i, m4.makeTranslation(p[0], p[1], p[2])));
    const thrMatL = new THREE.MeshBasicMaterial({color: '#3DFF8A'});
    const thr = new THREE.InstancedMesh(bulb, thrMatL, 9);
    for (let i = 0; i < 9; i++) thr.setMatrixAt(i, m4.makeTranslation(RWY_START - 0.6, 0.25, -10 + i * 2.5));

    // buildings
    const facade = facadeTexture();
    facade.repeat.set(20, 1);
    const facadeMat = new THREE.MeshStandardMaterial({map: facade, roughness: 0.6, metalness: 0.1});
    const roofMat = new THREE.MeshStandardMaterial({color: '#D9DCE0', roughness: 0.8});
    const terminalMats = [facadeMat, facadeMat, roofMat, roofMat, facadeMat, facadeMat];
    const glassMat = new THREE.MeshPhysicalMaterial({color: '#86A9CC', roughness: 0.12, metalness: 0.35, clearcoat: 1});
    const hangarMat = new THREE.MeshStandardMaterial({color: '#C9CED6', roughness: 0.7, metalness: 0.2});
    const doorMat = new THREE.MeshStandardMaterial({color: '#7D8794', roughness: 0.6, metalness: 0.3});
    const concrete = new THREE.MeshStandardMaterial({color: '#E6E3DD', roughness: 0.85});
    const towerGlass = new THREE.MeshPhysicalMaterial({color: '#3E6A7E', roughness: 0.08, metalness: 0.4, clearcoat: 1});
    const hangarRoof = new THREE.CylinderGeometry(35, 35, 110, 36, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.32, 1);

    // trees: three merged batches with different canopy textures
    const r = rng(42);
    const batches: {x: number; z: number; s: number; a: number}[][] = [[], [], []];
    const bands: [number, number, number][] = [
      [240, 540, 300],
      [560, 1460, 420],
      [-1360, -460, 380],
    ];
    for (const [z0, z1, n] of bands) {
      for (let i = 0; i < n; i++) {
        const x = -2200 + r() * 6200;
        const z = z0 + r() * (z1 - z0);
        // keep the terminal area clear
        if (z < 0 && x > 300 && x < 1300 && z > -560) continue;
        batches[i % 3].push({x, z, s: 14 + r() * 16, a: r() * Math.PI});
      }
    }
    const treeMats = [1, 2, 3].map((s) => new THREE.MeshStandardMaterial({map: treeTexture(s), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1}));
    const trees = batches.map((b) => mergeQuads(b));

    const hills = [
      {g: hillRing(6200, 230, 210, 600), c: '#6F8C7A'},
      {g: hillRing(3400, 70, 60, 600), c: '#6E8D5C'},
    ].map((h) => ({geo: h.g, mat: new THREE.MeshStandardMaterial({color: h.c, roughness: 1, flatShading: false})}));

    const rwyMain = RWY_LEN - THR_LEN;
    const geo = {
      rwy: strip(rwyMain, RW),
      thr: strip(THR_LEN, RW),
      shoulder: strip(RWY_LEN, 3.5),
      twy: strip(1500, 11.5),
      twyLine: strip(1500, 0.3),
      link: new THREE.PlaneGeometry(11.5, 80).rotateX(-Math.PI / 2),
      linkLine: new THREE.PlaneGeometry(0.3, 80).rotateX(-Math.PI / 2),
      apron: strip(360, 120),
    };

    return {
      geo,
      ground,
      groundMat,
      rwyMat,
      thrMat,
      asphalt,
      shoulder,
      yellow,
      edge,
      thr,
      terminalMats,
      glassMat,
      roofMat,
      hangarMat,
      doorMat,
      concrete,
      towerGlass,
      hangarRoof,
      treeMats,
      trees,
      hills,
    };
  }, []);

  const P = parts;
  const rwyMain = RWY_LEN - THR_LEN;
  return (
    <group>
      <mesh geometry={P.ground} material={P.groundMat} position={[600, 0, 0]} receiveShadow />
      {P.hills.map((h, i) => (
        <mesh key={i} geometry={h.geo} material={h.mat} receiveShadow={false} />
      ))}

      {/* runway */}
      <mesh geometry={P.geo.rwy} material={P.rwyMat} position={[RWY_START + THR_LEN + rwyMain / 2, 0.06, 0]} receiveShadow />
      <mesh geometry={P.geo.thr} material={P.thrMat} position={[RWY_START + THR_LEN / 2, 0.06, 0]} receiveShadow />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={P.geo.shoulder} material={P.shoulder} position={[RWY_START + RWY_LEN / 2, 0.045, s * (RW / 2 + 1.75)]} receiveShadow />
      ))}

      {/* parallel taxiway + links */}
      <mesh geometry={P.geo.twy} material={P.asphalt} position={[650, 0.05, TWY_Z]} receiveShadow />
      <mesh geometry={P.geo.twyLine} material={P.yellow} position={[650, 0.08, TWY_Z]} />
      {[180, 620, 1180].map((x) => (
        <group key={x}>
          <mesh geometry={P.geo.link} material={P.asphalt} position={[x, 0.05, -51.5]} receiveShadow />
          <mesh geometry={P.geo.linkLine} material={P.yellow} position={[x, 0.08, -51.5]} />
        </group>
      ))}

      {/* lights */}
      <primitive object={P.edge} />
      <primitive object={P.thr} />

      {/* terminal */}
      <mesh position={[520, 9, -300]} material={P.terminalMats} castShadow receiveShadow>
        <boxGeometry args={[320, 18, 48]} />
      </mesh>
      <mesh position={[520, 13, -296]} material={P.glassMat} castShadow>
        <boxGeometry args={[60, 26, 40]} />
      </mesh>
      <mesh position={[520, 18.6, -300]} material={P.roofMat} castShadow receiveShadow>
        <boxGeometry args={[330, 1.2, 54]} />
      </mesh>
      {/* apron */}
      <mesh geometry={P.geo.apron} material={P.asphalt} position={[520, 0.04, -215]} receiveShadow />

      {/* hangar */}
      <mesh position={[1150, 11, -270]} material={P.hangarMat} castShadow receiveShadow>
        <boxGeometry args={[110, 22, 70]} />
      </mesh>
      <mesh geometry={P.hangarRoof} material={P.hangarMat} position={[1150, 22, -270]} castShadow />
      <mesh position={[1150, 9, -234.9]} material={P.doorMat}>
        <boxGeometry args={[90, 18, 0.4]} />
      </mesh>

      {/* control tower */}
      <mesh position={[840, 4, -205]} material={P.concrete} castShadow receiveShadow>
        <boxGeometry args={[20, 8, 20]} />
      </mesh>
      <mesh position={[840, 23, -205]} material={P.concrete} castShadow>
        <cylinderGeometry args={[3.2, 4, 46, 20]} />
      </mesh>
      <mesh position={[840, 49, -205]} material={P.towerGlass} castShadow>
        <cylinderGeometry args={[7, 5.5, 6, 8]} />
      </mesh>
      <mesh position={[840, 52.5, -205]} material={P.concrete} castShadow>
        <cylinderGeometry args={[7.6, 7.6, 1, 8]} />
      </mesh>
      <mesh position={[840, 57, -205]} material={P.concrete}>
        <cylinderGeometry args={[0.25, 0.25, 8, 6]} />
      </mesh>

      {/* trees */}
      {P.trees.map((g, i) => (
        <mesh key={i} geometry={g} material={P.treeMats[i]} />
      ))}
    </group>
  );
});

/** Take-off roll, rotation, lift-off and gear retraction. */
export const TakeoffWorld: React.FC<{livery: Livery; frame: number; dur: number; view: string; shift?: number; tau0?: number; fps?: number}> = ({
  livery,
  frame,
  dur,
  view,
  shift = 0,
  tau0,
  fps = 30,
}) => {
  const t = frame / fps;
  const u = clamp01(frame / Math.max(1, dur));
  const t0 = tau0 ?? (view === 'head-on' ? 4.2 : view === 'follow' ? 3.2 : 2.8);
  const s = takeoffState(t0 + t);
  const ac: V3 = [s.x, s.h - GROUND_Y, 0];
  const c = airportCamera(view, ac, u, t);
  const spec = SKY_AIRPORT;
  return (
    <>
      <Cam pos={c.pos} target={c.target} fov={c.fov} roll={c.roll} shift={shift} near={0.5} far={30000} />
      <color attach="background" args={[spec.horizon]} />
      <fog attach="fog" args={[spec.haze, 1400, 9500]} />
      <Sky spec={spec} center={c.pos} />
      <SkyEnvironment spec={spec} intensity={0.85} />
      <SunLight spec={spec} focus={[s.x - 2, 0, 0]} box={24} intensity={3.4} />
      <Airport />
      <CumulusField offsetX={0} baseY={950} seed={3} count={30} span={18000} minDist={2500} scale={1.3} cam={[600, 0, 0]} />
      <group position={[s.x + MAIN_GEAR.x, s.h, 0]} rotation={[0, 0, s.pitch]}>
        <group position={[-MAIN_GEAR.x, -GROUND_Y, 0]}>
          <Airliner livery={livery} frame={frame} fps={fps} gear={s.gear} roll={s.roll} spin={t * Math.PI * 2 * 1.6} lights={0.8} landing={1} />
        </group>
      </group>
    </>
  );
};
