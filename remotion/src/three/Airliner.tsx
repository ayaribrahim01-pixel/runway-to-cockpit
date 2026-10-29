import React, {useMemo} from 'react';
import * as THREE from 'three';
import {
  bellyFairingGeometry,
  ENG,
  fanGeometry,
  finGeometry,
  finTop,
  flapFairings,
  fuselageGeometry,
  hStabGeometry,
  L,
  MAIN_GEAR,
  nacelleParts,
  NOSE_GEAR,
  pylonGeometry,
  wingAt,
  wingGeometry,
  wingletTop,
  wingTip,
  XN,
} from './airliner';
import {glowTexture, liveryTexture, Livery, spinnerTexture, tailTexture, wingTexture} from './textures';

// One procedural airliner (original design). Geometry + materials are built once per livery.

type Props = {
  livery: Livery;
  frame: number;
  fps?: number;
  /** 0 = gear down, 1 = fully retracted */
  gear?: number;
  /** fan rotation (radians) */
  spin?: number;
  /** wheel rotation (radians) */
  roll?: number;
  /** nav / beacon / strobe brightness */
  lights?: number;
  /** landing + taxi lights 0..1 */
  landing?: number;
  shadows?: boolean;
};

function useAirlinerParts(lv: Livery) {
  return useMemo(() => {
    const M = {
      body: new THREE.MeshPhysicalMaterial({map: liveryTexture(lv), roughness: 0.33, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.25}),
      paint: new THREE.MeshPhysicalMaterial({color: '#F4F6F8', roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.3}),
      belly: new THREE.MeshPhysicalMaterial({color: '#D3D9E2', roughness: 0.38, clearcoat: 0.4}),
      wing: new THREE.MeshStandardMaterial({map: wingTexture(), roughness: 0.36, metalness: 0.42}),
      fairing: new THREE.MeshStandardMaterial({color: '#C9D0DA', roughness: 0.4, metalness: 0.4}),
      tail: new THREE.MeshPhysicalMaterial({map: tailTexture(lv), roughness: 0.34, clearcoat: 0.55}),
      navy: new THREE.MeshPhysicalMaterial({color: lv.navy, roughness: 0.32, clearcoat: 0.6}),
      accent: new THREE.MeshPhysicalMaterial({color: lv.accent, roughness: 0.32, clearcoat: 0.6}),
      lip: new THREE.MeshStandardMaterial({color: '#DCE1E8', metalness: 0.85, roughness: 0.22}),
      duct: new THREE.MeshStandardMaterial({color: '#2A3140', roughness: 0.6, side: THREE.DoubleSide}),
      core: new THREE.MeshStandardMaterial({color: '#8C939E', metalness: 0.6, roughness: 0.4}),
      plug: new THREE.MeshStandardMaterial({color: '#5B616B', metalness: 0.5, roughness: 0.5}),
      dark: new THREE.MeshStandardMaterial({color: '#10151D', roughness: 0.85, side: THREE.DoubleSide}),
      fan: new THREE.MeshStandardMaterial({color: '#A2AAB5', metalness: 0.8, roughness: 0.3}),
      spinner: new THREE.MeshStandardMaterial({map: spinnerTexture(), metalness: 0.4, roughness: 0.35}),
      gear: new THREE.MeshStandardMaterial({color: '#BCC3CC', metalness: 0.7, roughness: 0.35}),
      tire: new THREE.MeshStandardMaterial({color: '#1E2126', roughness: 0.92}),
      hub: new THREE.MeshStandardMaterial({color: '#C8CDD3', metalness: 0.6, roughness: 0.4}),
      bulb: new THREE.MeshBasicMaterial({color: '#FFFFFF'}),
    };
    const G = {
      fuselage: fuselageGeometry(72),
      belly: bellyFairingGeometry(),
      wingR: wingGeometry(1),
      wingL: wingGeometry(-1),
      hR: hStabGeometry(1),
      hL: hStabGeometry(-1),
      fin: finGeometry(),
      nacelle: nacelleParts(),
      fan: fanGeometry(22),
      pylon: pylonGeometry(),
      canoe: new THREE.SphereGeometry(1, 18, 10),
      ring: new THREE.CylinderGeometry(0.537, 0.537, 0.1, 56, 1, true).rotateZ(Math.PI / 2),
      exit: new THREE.RingGeometry(0.36, 0.435, 48).rotateY(-Math.PI / 2),
      face: new THREE.CircleGeometry(0.41, 40).rotateY(Math.PI / 2),
      tireMain: new THREE.CylinderGeometry(MAIN_GEAR.tire, MAIN_GEAR.tire, 0.2, 28).rotateX(Math.PI / 2),
      hubMain: new THREE.CylinderGeometry(MAIN_GEAR.tire * 0.55, MAIN_GEAR.tire * 0.55, 0.205, 20).rotateX(Math.PI / 2),
      tireNose: new THREE.CylinderGeometry(NOSE_GEAR.tire, NOSE_GEAR.tire, 0.13, 24).rotateX(Math.PI / 2),
      hubNose: new THREE.CylinderGeometry(NOSE_GEAR.tire * 0.55, NOSE_GEAR.tire * 0.55, 0.135, 16).rotateX(Math.PI / 2),
      strut: new THREE.CylinderGeometry(0.075, 0.075, 1, 12),
      bulb: new THREE.SphereGeometry(0.07, 10, 8),
    };
    const glow = new THREE.SpriteMaterial({map: glowTexture(), color: '#FFFFFF', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending});
    return {M, G, glow};
  }, [lv.accent, lv.navy, lv.title, lv.font]);
}

/** additive glow sprite */
const Glow: React.FC<{pos: [number, number, number] | THREE.Vector3; color: string; size: number; k: number; base: THREE.SpriteMaterial}> = ({pos, color, size, k, base}) => {
  const mat = useMemo(() => {
    const m = base.clone();
    m.color = new THREE.Color(color);
    return m;
  }, [base, color]);
  mat.opacity = Math.max(0, Math.min(1, k));
  const p = pos instanceof THREE.Vector3 ? ([pos.x, pos.y, pos.z] as [number, number, number]) : pos;
  if (k <= 0.002) return null;
  return <sprite position={p} scale={[size, size, 1]} material={mat} renderOrder={5} />;
};

export const Airliner: React.FC<Props> = ({livery, frame, fps = 30, gear = 1, spin = 0, roll = 0, lights = 0.7, landing = 0, shadows = true}) => {
  const {M, G, glow} = useAirlinerParts(livery);
  const t = frame / fps;
  const g = Math.max(0, Math.min(1, gear));

  // light timing: beacon ~1 Hz, strobes double-flash every 1.3 s
  const bPh = t % 1.0;
  const beacon = bPh < 0.12 ? Math.sin((bPh / 0.12) * Math.PI) : 0;
  const sPh = t % 1.3;
  const strobe = sPh < 0.05 || (sPh > 0.13 && sPh < 0.18) ? 1 : 0;

  const cs = shadows;
  const wing125 = wingAt(1.25);

  const engine = (side: 1 | -1) => (
    <group key={`eng${side}`} position={[0, 0, ENG.z * side]}>
      <mesh geometry={G.nacelle.cowl} material={M.navy} castShadow={cs} receiveShadow={cs} />
      <mesh geometry={G.ring} material={M.accent} position={[ENG.x - 0.42, ENG.y, 0]} castShadow={cs} />
      <mesh geometry={G.nacelle.lip} material={M.lip} castShadow={cs} />
      <mesh geometry={G.nacelle.inner} material={M.duct} />
      <mesh geometry={G.nacelle.core} material={M.core} castShadow={cs} />
      <mesh geometry={G.nacelle.plug} material={M.plug} castShadow={cs} />
      <mesh geometry={G.exit} material={M.dark} position={[ENG.x - ENG.len + 0.01, ENG.y, 0]} />
      <mesh geometry={G.face} material={M.dark} position={[ENG.x - 0.6, ENG.y, 0]} />
      <group position={[ENG.x, ENG.y, 0]} rotation={[-spin, 0, 0]}>
        <mesh geometry={G.nacelle.spinner} material={M.spinner} />
        <mesh geometry={G.fan} material={M.fan} position={[-0.5, 0, 0]} />
      </group>
      <mesh geometry={G.pylon} material={M.paint} castShadow={cs} receiveShadow={cs} />
    </group>
  );

  const mainGear = (side: 1 | -1) => {
    const len = MAIN_GEAR.top - MAIN_GEAR.axle;
    return (
      <group key={`mg${side}`} position={[MAIN_GEAR.x, MAIN_GEAR.top, MAIN_GEAR.z * side]} rotation={[side * g * (Math.PI / 2), 0, 0]}>
        <mesh geometry={G.strut} material={M.gear} position={[0, -len / 2, 0]} scale={[1, len, 1]} castShadow={cs} />
        <mesh geometry={G.strut} material={M.gear} position={[0.18, -len * 0.45, 0]} rotation={[0, 0, 0.32]} scale={[0.5, len * 0.8, 0.5]} castShadow={cs} />
        <mesh geometry={G.strut} material={M.gear} position={[0, -len, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.8, 0.62, 0.8]} castShadow={cs} />
        {[-0.24, 0.24].map((dz) => (
          <group key={dz} position={[0, -len, dz]} rotation={[0, 0, -roll]}>
            <mesh geometry={G.tireMain} material={M.tire} castShadow={cs} />
            <mesh geometry={G.hubMain} material={M.hub} />
          </group>
        ))}
      </group>
    );
  };

  const noseLen = NOSE_GEAR.top - NOSE_GEAR.axle;
  const gearDown = 1 - g;

  return (
    <group>
      {/* fuselage + fairings */}
      <mesh geometry={G.fuselage} material={M.body} castShadow={cs} receiveShadow={cs} />
      <mesh geometry={G.belly} material={M.belly} castShadow={cs} receiveShadow={cs} />

      {/* wings, tail */}
      <mesh geometry={G.wingR} material={M.wing} castShadow={cs} receiveShadow={cs} />
      <mesh geometry={G.wingL} material={M.wing} castShadow={cs} receiveShadow={cs} />
      <mesh geometry={G.hR} material={M.wing} castShadow={cs} receiveShadow={cs} />
      <mesh geometry={G.hL} material={M.wing} castShadow={cs} receiveShadow={cs} />
      <mesh geometry={G.fin} material={M.tail} castShadow={cs} receiveShadow={cs} />

      {/* flap-track canoes */}
      {([1, -1] as const).flatMap((side) =>
        flapFairings(side).map((c, i) => (
          <mesh key={`c${side}${i}`} geometry={G.canoe} material={M.fairing} position={c.pos} scale={[c.len / 2, 0.11, 0.085]} castShadow={cs} />
        )),
      )}

      {engine(1)}
      {engine(-1)}

      {/* landing gear */}
      {gearDown > 0.001 ? (
        <>
          {mainGear(1)}
          {mainGear(-1)}
          <group position={[NOSE_GEAR.x, NOSE_GEAR.top, 0]} rotation={[0, 0, g * (Math.PI / 2)]}>
            <mesh geometry={G.strut} material={M.gear} position={[0, -noseLen / 2, 0]} scale={[0.8, noseLen, 0.8]} castShadow={cs} />
            <group position={[0, -noseLen, 0]} rotation={[0, 0, -roll * (MAIN_GEAR.tire / NOSE_GEAR.tire)]}>
              {[-0.1, 0.1].map((dz) => (
                <group key={dz} position={[0, 0, dz]}>
                  <mesh geometry={G.tireNose} material={M.tire} castShadow={cs} />
                  <mesh geometry={G.hubNose} material={M.hub} />
                </group>
              ))}
            </group>
            {/* taxi light on the nose strut */}
            <Glow pos={[0.12, -noseLen * 0.55, 0]} color="#FFF4E0" size={1.6} k={landing * gearDown * 0.9} base={glow} />
          </group>
        </>
      ) : null}

      {/* navigation lights: green right, red left, white tail */}
      <mesh geometry={G.bulb} material={M.bulb} position={wingTip(1)} />
      <mesh geometry={G.bulb} material={M.bulb} position={wingTip(-1)} />
      <Glow pos={wingTip(1)} color="#39FF7A" size={1.1} k={lights * 0.9} base={glow} />
      <Glow pos={wingTip(-1)} color="#FF2A2A" size={1.1} k={lights * 0.9} base={glow} />
      <Glow pos={[XN - L - 0.05, 0.35, 0]} color="#FFFFFF" size={0.9} k={lights * 0.7} base={glow} />

      {/* strobes (wingtips + tail) */}
      <Glow pos={wingTip(1)} color="#FFFFFF" size={3.2} k={strobe * lights * 1.2} base={glow} />
      <Glow pos={wingTip(-1)} color="#FFFFFF" size={3.2} k={strobe * lights * 1.2} base={glow} />
      <Glow pos={wingletTop(1)} color="#FFFFFF" size={1.4} k={strobe * lights * 0.6} base={glow} />
      <Glow pos={wingletTop(-1)} color="#FFFFFF" size={1.4} k={strobe * lights * 0.6} base={glow} />
      <Glow pos={finTop()} color="#FFFFFF" size={1.2} k={strobe * lights * 0.5} base={glow} />

      {/* anti-collision beacons (top + belly) */}
      <Glow pos={[0.6, 1.04, 0]} color="#FF1E12" size={0.85 * 1.6} k={beacon * lights} base={glow} />
      <Glow pos={[-1.2, -1.32, 0]} color="#FF1E12" size={0.85 * 1.6} k={beacon * lights} base={glow} />

      {/* landing lights at the wing roots */}
      {([1, -1] as const).map((side) => (
        <Glow key={`ll${side}`} pos={[wing125.leX - 0.2, wing125.y - 0.12, 1.25 * side]} color="#FFF6E6" size={2.6} k={landing * 0.95} base={glow} />
      ))}
    </group>
  );
};
