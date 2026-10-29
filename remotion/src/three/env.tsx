import {useThree} from '@react-three/fiber';
import React, {useLayoutEffect, useMemo} from 'react';
import * as THREE from 'three';
import {cumulusTexture, noiseTexture, rng} from './textures';

// Sky, sun, image-based lighting, cloud deck and camera helpers shared by every 3D world.

export type SkySpec = {
  zenith: string;
  horizon: string;
  haze: string;
  ground: string;
  sunDir: [number, number, number];
  sunColor: string;
  glow: number;
};

export const SKY_CRUISE: SkySpec = {
  zenith: '#1B54A3',
  horizon: '#A9C8EA',
  haze: '#E2ECF6',
  ground: '#C9D6E6',
  sunDir: [0.45, 0.62, 0.64],
  sunColor: '#FFF1DC',
  glow: 1,
};

export const SKY_AIRPORT: SkySpec = {
  zenith: '#3471BC',
  horizon: '#B5D0EC',
  haze: '#E3ECF4',
  ground: '#B3B8AE',
  sunDir: [0.35, 0.55, 0.76],
  sunColor: '#FFF0D8',
  glow: 0.8,
};

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 haze;
uniform vec3 ground;
uniform vec3 sunDir;
uniform vec3 sunCol;
uniform float disk;
uniform float glow;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float hp = clamp(h, 0.0, 1.0);
  vec3 col = mix(horizon, zenith, 1.0 - pow(1.0 - hp, 4.0));
  col = mix(col, haze, exp(-hp * 30.0) * 0.85);
  if (h < 0.0) col = mix(haze, ground, pow(clamp(-h * 3.0, 0.0, 1.0), 0.6));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunCol * (disk * pow(s, 1400.0) * 9.0 + glow * (pow(s, 90.0) * 0.45 + pow(s, 8.0) * 0.12));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function skyMaterial(spec: SkySpec, disk: number) {
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: {value: new THREE.Color(spec.zenith)},
      horizon: {value: new THREE.Color(spec.horizon)},
      haze: {value: new THREE.Color(spec.haze)},
      ground: {value: new THREE.Color(spec.ground)},
      sunDir: {value: new THREE.Vector3(...spec.sunDir).normalize()},
      sunCol: {value: new THREE.Color(spec.sunColor)},
      disk: {value: disk},
      glow: {value: spec.glow},
    },
  });
}

/** Gradient sky dome with a sun disc, centred on the camera. */
export const Sky: React.FC<{spec: SkySpec; center: [number, number, number]; disk?: number}> = ({spec, center, disk = 1}) => {
  const mat = useMemo(() => skyMaterial(spec, disk), [spec, disk]);
  const geo = useMemo(() => new THREE.SphereGeometry(20000, 64, 32), []);
  return <mesh geometry={geo} material={mat} position={center} renderOrder={-10} frustumCulled={false} />;
};

/** Image-based lighting from the same sky, so the paint picks up sky reflections. */
export const SkyEnvironment: React.FC<{spec: SkySpec; intensity?: number}> = ({spec, intensity = 1}) => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const tex = useMemo(() => {
    const envScene = new THREE.Scene();
    const m = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), skyMaterial(spec, 0.25));
    envScene.add(m);
    const pm = new THREE.PMREMGenerator(gl);
    const rt = pm.fromScene(envScene, 0.015, 0.1, 100);
    pm.dispose();
    return rt.texture;
  }, [gl, spec]);
  useLayoutEffect(() => {
    scene.environment = tex;
    (scene as any).environmentIntensity = intensity;
    return () => {
      scene.environment = null;
    };
  }, [scene, tex, intensity]);
  return null;
};

/** Sun (shadow-casting directional light) + sky/ground fill. */
export const SunLight: React.FC<{spec: SkySpec; focus?: [number, number, number]; box?: number; intensity?: number}> = ({
  spec,
  focus = [0, 0, 0],
  box = 14,
  intensity = 3.0,
}) => {
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight();
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    l.shadow.bias = -0.0003;
    l.shadow.normalBias = 0.03;
    return l;
  }, []);
  const d = new THREE.Vector3(...spec.sunDir).normalize();
  useLayoutEffect(() => {
    const c = light.shadow.camera as THREE.OrthographicCamera;
    c.left = -box;
    c.right = box;
    c.top = box;
    c.bottom = -box;
    c.near = 1;
    c.far = 400;
    c.updateProjectionMatrix();
  }, [light, box]);
  light.color = new THREE.Color(spec.sunColor);
  light.intensity = intensity;
  light.position.set(focus[0] + d.x * 120, focus[1] + d.y * 120, focus[2] + d.z * 120);
  light.target.position.set(...focus);
  light.target.updateMatrixWorld();
  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
      <hemisphereLight args={[spec.haze, spec.ground, 0.55]} />
    </>
  );
};

const DECK_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const DECK_FRAG = /* glsl */ `
uniform sampler2D noise;
uniform vec3 lit;
uniform vec3 shade;
uniform vec3 gap;
uniform vec3 hazeCol;
uniform vec3 sunDir;
uniform float coverage;
uniform float hazeNear;
uniform float hazeFar;
uniform float offset;
uniform vec3 camPos;
varying vec3 vWorld;
float field(vec2 p) {
  return texture2D(noise, p * 0.00042).r * 0.55 + texture2D(noise, p * 0.0017 + 0.31).g * 0.3 + texture2D(noise, p * 0.0071 + 0.73).r * 0.15;
}
void main() {
  vec2 p = vWorld.xz + vec2(offset, 0.0);
  float n = field(p);
  float d = smoothstep(coverage - 0.06, coverage + 0.12, n);
  // light the tops toward the sun: sample a little toward the sun and compare
  vec2 sd = normalize(sunDir.xz + 1e-4) * 140.0;
  float n2 = field(p + sd);
  float light = clamp(0.62 + (n - n2) * 5.0 + (n - coverage) * 1.6, 0.0, 1.0);
  vec3 cloud = mix(shade, lit, light);
  vec3 col = mix(gap, cloud, d);
  float dist = length(vWorld.xz - camPos.xz);
  col = mix(col, hazeCol, smoothstep(hazeNear, hazeFar, dist));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Endless stratocumulus deck below the aircraft (scrolls with offsetX). */
export const CloudDeck: React.FC<{spec: SkySpec; y: number; cam: [number, number, number]; offsetX: number; coverage?: number}> = ({
  spec,
  y,
  cam,
  offsetX,
  coverage = 0.47,
}) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: DECK_VERT,
        fragmentShader: DECK_FRAG,
        fog: false,
        uniforms: {
          noise: {value: noiseTexture(512)},
          lit: {value: new THREE.Color('#FFFFFF')},
          shade: {value: new THREE.Color('#AEBED3')},
          gap: {value: new THREE.Color('#6E8CA8')},
          hazeCol: {value: new THREE.Color(spec.haze)},
          sunDir: {value: new THREE.Vector3(...spec.sunDir).normalize()},
          coverage: {value: coverage},
          hazeNear: {value: 900},
          hazeFar: {value: 9000},
          offset: {value: 0},
          camPos: {value: new THREE.Vector3()},
        },
      }),
    [spec, coverage],
  );
  const geo = useMemo(() => new THREE.PlaneGeometry(26000, 26000, 1, 1).rotateX(-Math.PI / 2), []);
  mat.uniforms.offset.value = offsetX;
  (mat.uniforms.camPos.value as THREE.Vector3).set(...cam);
  return <mesh geometry={geo} material={mat} position={[cam[0], y, cam[2]]} renderOrder={-5} frustumCulled={false} />;
};

/** Billboard cumulus towers scattered over the deck; they wrap around in X as the aircraft moves. */
export const CumulusField: React.FC<{
  count?: number;
  offsetX: number;
  baseY: number;
  span?: number;
  seed?: number;
  minDist?: number;
  scale?: number;
  cam?: [number, number, number];
}> = ({count = 46, offsetX, baseY, span = 16000, seed = 5, minDist = 900, scale = 1, cam = [0, 0, 0]}) => {
  const items = useMemo(() => {
    const r = rng(seed * 101 + 7);
    const out: {x: number; z: number; s: number; mat: THREE.SpriteMaterial}[] = [];
    for (let i = 0; i < count; i++) {
      const x = (r() - 0.5) * span;
      let z = (r() - 0.5) * span;
      if (Math.abs(z) < minDist * 0.5) z = Math.sign(z || 1) * (minDist * 0.5 + r() * minDist);
      const s = (380 + r() * 900) * scale;
      const mat = new THREE.SpriteMaterial({map: cumulusTexture(1 + ((seed + i) % 6)), fog: true, transparent: true, depthWrite: false});
      out.push({x, z, s, mat});
    }
    return out;
  }, [count, span, seed, minDist, scale]);
  return (
    <>
      {items.map((c, i) => {
        // wrap so the field always surrounds the camera
        let x = c.x - offsetX - cam[0];
        x = ((((x + span / 2) % span) + span) % span) - span / 2 + cam[0];
        const dist = Math.hypot(x - cam[0], c.z - cam[2]);
        const fadeNear = Math.min(1, Math.max(0, (dist - minDist * 0.5) / (minDist * 0.5)));
        const fadeEdge = Math.min(1, Math.max(0, (span / 2 - Math.abs(x - cam[0])) / (span * 0.08)));
        c.mat.opacity = fadeNear * fadeEdge;
        if (c.mat.opacity <= 0.01) return null;
        const h = c.s * 0.62;
        return <sprite key={i} material={c.mat} position={[x, baseY + h * 0.3, c.z]} scale={[c.s, h, 1]} />;
      })}
    </>
  );
};

/** Sets the default camera (position, aim, roll, lens, horizontal shift of the frame). */
export const Cam: React.FC<{
  pos: [number, number, number];
  target: [number, number, number];
  fov: number;
  roll?: number;
  shift?: number;
  near?: number;
  far?: number;
}> = ({pos, target, fov, roll = 0, shift = 0, near = 0.2, far = 60000}) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    camera.position.set(...pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(...target);
    if (roll) camera.rotateZ(roll);
    camera.fov = fov;
    camera.near = near;
    camera.far = far;
    const w = size.width;
    const h = size.height;
    if (shift) camera.setViewOffset(w, h, -shift * w * 0.5, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  });
  return null;
};
