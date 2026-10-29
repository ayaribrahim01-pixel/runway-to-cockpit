import {useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import React, {useLayoutEffect, useMemo} from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {CLAMP, EASE_IN_OUT, lerp, prog} from '../anim';
import {alpha, F, Rich, useBrand} from '../theme';
import type {Scene} from '../types';
import {Airliner} from './Airliner';
import type {Livery} from './textures';

// "Who owns the sky?" — an original 3D diorama: land, coastline, 12 NM territorial sea, the airspace above both, high seas beyond.

const BELT = 56; // territorial sea width in scene units (12 NM, not to scale)
const ZR = 320;
const XMIN = -300;
const H = 120;
const coastX = (z: number) => 18 * Math.sin(0.018 * z + 0.6) + 7 * Math.sin(0.051 * z + 2.1) + 3 * Math.sin(0.13 * z);

function shapeFor(offset: number) {
  const s = new THREE.Shape();
  const N = 96;
  s.moveTo(XMIN, ZR);
  for (let i = 0; i <= N; i++) {
    const z = -ZR + (2 * ZR * i) / N;
    s.lineTo(coastX(z) + offset, -z);
  }
  s.lineTo(XMIN, -ZR);
  s.closePath();
  return s;
}

function camAt(f: number, dur: number) {
  const u = interpolate(f, [0, Math.max(1, dur)], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const a = (lerp(-38, -12, u) * Math.PI) / 180;
  const r = lerp(470, 430, u);
  const h = lerp(250, 220, u);
  const target: [number, number, number] = [10, 18, 0];
  const pos: [number, number, number] = [target[0] + Math.sin(a) * r, h, target[2] + Math.cos(a) * r];
  return {pos, target, fov: 38};
}

const WATER_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const WATER_FRAG = /* glsl */ `
uniform float uBelt;
uniform float uLine;
uniform float uHigh;
uniform float uTime;
uniform vec3 cBelt;
uniform vec3 cSea;
uniform vec3 cDeep;
uniform vec3 cBg;
uniform vec3 cLine;
varying vec3 vW;
float coastX(float z) { return 18.0 * sin(0.018 * z + 0.6) + 7.0 * sin(0.051 * z + 2.1) + 3.0 * sin(0.13 * z); }
void main() {
  float dx = vW.x - coastX(vW.z);
  vec3 col = mix(cSea, cDeep, smoothstep(90.0, 430.0, dx));
  float inBelt = step(0.0, dx) * (1.0 - smoothstep(${BELT.toFixed(1)} - 0.8, ${BELT.toFixed(1)} + 0.8, dx));
  col = mix(col, cBelt, inBelt * uBelt);
  // gentle ripples
  float rip = sin(vW.x * 0.33 + uTime * 1.3 + sin(vW.z * 0.21) * 2.0) * sin(vW.z * 0.27 - uTime * 0.9);
  col += rip * 0.022;
  // high seas: soft diagonal hatching
  float hs = step(${BELT.toFixed(1)} + 2.0, dx) * uHigh;
  float hatch = smoothstep(0.42, 0.5, abs(fract((vW.x + vW.z) / 16.0) - 0.5));
  col = mix(col, col * 1.12 + 0.03, hs * hatch * 0.6);
  // dashed 12 NM line, drawn front to back
  float ld = abs(dx - ${BELT.toFixed(1)});
  float dash = step(0.45, fract(vW.z / 14.0));
  float reveal = step(vW.z, mix(${(-ZR).toFixed(1)}, ${ZR.toFixed(1)}, uLine) );
  float lm = (1.0 - smoothstep(0.9, 1.9, ld)) * dash * reveal * step(0.001, uLine);
  col = mix(col, cLine, lm);
  // fade into the page colour
  float r = length(vW.xz - vec2(10.0, 0.0));
  col = mix(col, cBg, smoothstep(520.0, 980.0, r));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const Diorama: React.FC<{f: number; dur: number; cues: number[]; accent: string; livery: Livery; volU: number; fps: number}> = ({f, dur, cues, accent, livery, volU, fps}) => {
  const c = camAt(f, dur);
  const parts = useMemo(() => {
    const land = new THREE.ExtrudeGeometry(shapeFor(0), {depth: 6, bevelEnabled: false, steps: 1}).rotateX(-Math.PI / 2);
    const vol = new THREE.ExtrudeGeometry(shapeFor(BELT), {depth: H, bevelEnabled: false, steps: 1}).rotateX(-Math.PI / 2);
    const edges = new THREE.EdgesGeometry(vol, 30);
    const landMats = [
      new THREE.MeshStandardMaterial({color: '#A9CF8F', roughness: 1, toneMapped: false}),
      new THREE.MeshStandardMaterial({color: '#D8BE8C', roughness: 1, toneMapped: false}),
    ];
    const water = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      uniforms: {
        uBelt: {value: 0},
        uLine: {value: 0},
        uHigh: {value: 0},
        uTime: {value: 0},
        cBelt: {value: new THREE.Color('#7FD3E8')},
        cSea: {value: new THREE.Color('#4E9BDB')},
        cDeep: {value: new THREE.Color('#2C6FB4')},
        cBg: {value: new THREE.Color('#EEF4FA')},
        cLine: {value: new THREE.Color('#FFFFFF')},
      },
    });
    const waterGeo = new THREE.PlaneGeometry(2400, 2400, 1, 1).rotateX(-Math.PI / 2);
    // trees / towns on the land so it reads as "territory"
    const dots: [number, number][] = [];
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const z = -ZR * 0.85 + r() * ZR * 1.7;
      const x = XMIN * 0.85 + r() * (coastX(z) - 24 - XMIN * 0.85);
      dots.push([x, z]);
    }
    const tree = new THREE.ConeGeometry(4.2, 12, 7);
    const treeMat = new THREE.MeshStandardMaterial({color: '#6FA36A', roughness: 1, toneMapped: false});
    const house = new THREE.BoxGeometry(8, 6, 8);
    const houseMat = new THREE.MeshStandardMaterial({color: '#F3EDE2', roughness: 1, toneMapped: false});
    return {land, vol, edges, landMats, water, waterGeo, dots, tree, treeMat, house, houseMat};
  }, []);
  const volMat = useMemo(
    () => new THREE.MeshBasicMaterial({color: accent, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, toneMapped: false}),
    [accent],
  );
  const edgeMat = useMemo(() => new THREE.LineBasicMaterial({color: accent, transparent: true, opacity: 0.85, toneMapped: false}), [accent]);
  const at = (i: number) => (typeof cues[i] === 'number' ? cues[i] : 20 + i * 40);
  parts.water.uniforms.uBelt.value = prog(f, at(1), 18);
  parts.water.uniforms.uLine.value = prog(f, at(2), 26);
  parts.water.uniforms.uHigh.value = prog(f, at(4), 20);
  parts.water.uniforms.uTime.value = f / fps;
  volMat.opacity = 0.16 * Math.min(1, volU * 1.3);
  edgeMat.opacity = 0.85 * Math.min(1, volU * 1.3);

  // aircraft crossing from the high seas into national airspace
  const u = interpolate(f, [0, Math.max(1, dur)], [0, 1], CLAMP);
  const A = new THREE.Vector3(300, 52, 150);
  const B = new THREE.Vector3(-170, 52, -70);
  const P = A.clone().lerp(B, u);
  const yaw = Math.atan2(-(B.z - A.z), B.x - A.x);
  return (
    <>
      <CamSet pos={c.pos} target={c.target} fov={c.fov} />
      <color attach="background" args={['#EEF4FA']} />
      <hemisphereLight args={['#FFFFFF', '#B9C7D6', 1.25]} />
      <directionalLight position={[-200, 400, 260]} intensity={1.6} />
      <mesh geometry={parts.waterGeo} material={parts.water} position={[0, 0, 0]} />
      <mesh geometry={parts.land} material={parts.landMats} position={[0, -3, 0]} />
      {parts.dots.map(([x, z], i) =>
        i % 5 === 0 ? (
          <mesh key={i} geometry={parts.house} material={parts.houseMat} position={[x, 6, z]} />
        ) : (
          <mesh key={i} geometry={parts.tree} material={parts.treeMat} position={[x, 9, z]} />
        ),
      )}
      <group position={[0, 0.6, 0]} scale={[1, Math.max(0.001, volU), 1]}>
        <mesh geometry={parts.vol} material={volMat} renderOrder={3} />
        <lineSegments geometry={parts.edges} material={edgeMat} renderOrder={4} />
      </group>
      <group position={[P.x, P.y, P.z]} rotation={[0, yaw, 0]} scale={1.6}>
        <Airliner livery={livery} frame={f} fps={fps} gear={1} spin={(f / fps) * Math.PI * 2} lights={0.8} shadows={false} />
      </group>
    </>
  );
};

const CamSet: React.FC<{pos: [number, number, number]; target: [number, number, number]; fov: number}> = ({pos, target, fov}) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useLayoutEffect(() => {
    camera.position.set(...pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(...target);
    camera.fov = fov;
    camera.near = 1;
    camera.far = 5000;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  });
  return null;
};

/** project a world point to screen pixels with the same camera as the canvas */
function projector(f: number, dur: number, W: number, Hh: number) {
  const c = camAt(f, dur);
  const cam = new THREE.PerspectiveCamera(c.fov, W / Hh, 1, 5000);
  cam.position.set(...c.pos);
  cam.lookAt(...c.target);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return (x: number, y: number, z: number) => {
    const v = new THREE.Vector3(x, y, z).project(cam);
    return {x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * Hh};
  };
}

export const Airspace3D: React.FC<{scene: Scene}> = ({scene}) => {
  const f = useCurrentFrame();
  const {fps, width: W, height: Hh} = useVideoConfig();
  const b = useBrand();
  const d = scene.data || {};
  const cues = scene.cues || [];
  const at = (i: number) => (typeof cues[i] === 'number' ? cues[i] : 20 + i * 40);
  const volU = spring({frame: f - at(3), fps, config: {damping: 16, stiffness: 70, mass: 1}});
  const livery = useMemo<Livery>(() => ({accent: '#EE6A1A', navy: '#14305A', title: 'Runway To Cockpit', font: F.head}), []);
  const proj = projector(f, scene.dur, W, Hh);
  const labels: {t: string; p: {x: number; y: number}; i: number; color: string; dir?: 'up' | 'down'}[] = [
    {t: d.landLabel ?? 'Land territory', p: proj(-175, 14, 70), i: 0, color: '#3E7A3A'},
    {t: d.coastLabel ?? 'Coastline (baseline)', p: proj(coastX(205), 4, 205), i: 1, color: '#B07A2A', dir: 'down'},
    {t: d.beltLabel ?? '12 NM territorial sea', p: proj(coastX(150) + BELT / 2, 2, 150), i: 2, color: '#1A7FA0', dir: 'down'},
    {t: d.airLabel ?? 'Sovereign airspace', p: proj(-90, H * Math.max(0.001, volU) + 16, -40), i: 3, color: b.accent, dir: 'up'},
    {t: d.highLabel ?? 'High seas (no state owns it)', p: proj(230, 2, 40), i: 4, color: '#2C6FB4'},
  ];
  const chips: {t: string; sub?: string; cue?: number}[] = d.chips ?? [
    {t: 'Art. 1', sub: 'complete & exclusive sovereignty', cue: 0},
    {t: 'Art. 2', sub: 'territory = land + territorial waters', cue: 1},
    {t: 'Art. 12', sub: 'rules of the air', cue: 4},
  ];
  return (
    <AbsoluteFill style={{background: '#EEF4FA'}}>
      <ThreeCanvas width={W} height={Hh} gl={{antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, preserveDrawingBuffer: true}} camera={{fov: 38, near: 1, far: 5000, position: [0, 250, 470]}}>
        <Diorama f={f} dur={scene.dur} cues={cues} accent={b.accent} livery={livery} volU={volU} fps={fps} />
      </ThreeCanvas>
      {/* labels */}
      {labels.map((l) => {
        const t0 = at(l.i);
        const p = spring({frame: f - t0 - 4, fps, config: {damping: 14, stiffness: 180, mass: 0.6}});
        if (f < t0 + 4) return null;
        const up = l.dir === 'up';
        const stem = 46;
        return (
          <div key={l.i} style={{position: 'absolute', left: l.p.x, top: l.p.y, width: 0, height: 0}}>
            <div style={{position: 'absolute', left: -7, top: -7, width: 14, height: 14, borderRadius: 7, background: l.color, border: '3px solid #FFFFFF', transform: `scale(${p})`}} />
            <div
              style={{
                position: 'absolute',
                left: -1.5,
                top: up ? -stem : 0,
                width: 3,
                height: stem * p,
                background: l.color,
                transformOrigin: up ? 'bottom' : 'top',
                marginTop: up ? stem * (1 - p) : 0,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: up ? -stem - 54 : stem,
                transform: `translateX(-50%) scale(${p})`,
                transformOrigin: up ? 'bottom center' : 'top center',
                whiteSpace: 'nowrap',
                padding: '10px 20px',
                borderRadius: 14,
                background: '#FFFFFF',
                boxShadow: '0 10px 26px rgba(16,33,58,0.16)',
                fontFamily: F.head,
                fontWeight: 750 as any,
                fontSize: 28,
                color: '#10213A',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span style={{width: 12, height: 12, borderRadius: 6, background: l.color}} />
              {l.t}
            </div>
          </div>
        );
      })}
      {/* title */}
      <div style={{position: 'absolute', left: 120, top: 70, opacity: prog(f, 0, 12), transform: `translateY(${(1 - prog(f, 0, 16)) * 16}px)`}}>
        {d.kicker ? <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 24, letterSpacing: '0.2em', textTransform: 'uppercase', color: b.accent, marginBottom: 8}}>{d.kicker}</div> : null}
        <div style={{fontFamily: F.head, fontWeight: 850 as any, fontSize: 60, letterSpacing: '-0.03em', color: '#10213A', textShadow: '0 2px 0 rgba(255,255,255,0.6)'}}>
          <Rich text={d.title ?? 'Who owns the sky?'} />
        </div>
      </div>
      {/* article chips */}
      <div style={{position: 'absolute', right: 90, top: 80, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-end'}}>
        {chips.map((c, i) => {
          const t0 = typeof c.cue === 'number' ? at(c.cue) : 20 + i * 40;
          const p = spring({frame: f - t0, fps, config: {damping: 15, stiffness: 170, mass: 0.6}});
          if (f < t0) return null;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 20px 12px 12px',
                borderRadius: 18,
                background: 'rgba(255,255,255,0.95)',
                boxShadow: '0 10px 24px rgba(16,33,58,0.14)',
                transform: `translateX(${(1 - p) * 60}px)`,
                opacity: Math.min(1, p * 1.5),
              }}
            >
              <div style={{padding: '6px 14px', borderRadius: 10, background: b.accent, color: '#FFFFFF', fontFamily: F.head, fontWeight: 800 as any, fontSize: 26}}>{c.t}</div>
              {c.sub ? <div style={{fontFamily: F.head, fontWeight: 600, fontSize: 25, color: alpha('#10213A', 0.82)}}>{c.sub}</div> : null}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
