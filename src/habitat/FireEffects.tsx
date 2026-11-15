// Visual-only flame and smoke particles driven by the simulated front. Qualitative physics from the
// challenge video: without gravity there is no buoyant convection, so flames hug the surface, look
// bluer and are stretched by the ventilation; in partial gravity buoyancy lifts hot gas and soot.
// Nothing here is calibrated: heights, lifetimes and colours are illustrative.

import { useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export interface FireSeeds {
  front: Float32Array; // xyz + inward normal xyz per seed
  frontCount: number;
  smoke: Float32Array; // xyz per seed
  smokeCount: number;
  version: number;
}
export const MAX_FRONT_SEEDS = 900;
export const MAX_SMOKE_SEEDS = 500;
export const createSeeds = (): FireSeeds => ({
  front: new Float32Array(MAX_FRONT_SEEDS * 6), frontCount: 0,
  smoke: new Float32Array(MAX_SMOKE_SEEDS * 3), smokeCount: 0, version: 0,
});

const FLAME_PARTICLES = 2600;
const SMOKE_PARTICLES = 1100;

function sprite(soft: number) {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
    const a = Math.max(0, 1 - d) ** soft;
    data.set([255, 255, 255, 255 * a], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

const rand = (i: number) => {
  let h = Math.imul(i ^ 0x27d4eb2d, 0x165667b1);
  h ^= h >>> 15;
  return ((Math.imul(h, 0x85ebca6b) >>> 0) % 10000) / 10000;
};

export function FireEffects({ seeds, gravityG, flow, active }: {
  seeds: MutableRefObject<FireSeeds>; gravityG: number; flow: number; active: boolean;
}) {
  const flameGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(FLAME_PARTICLES * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(FLAME_PARTICLES * 3), 3));
    return g;
  }, []);
  const smokeGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SMOKE_PARTICLES * 3), 3));
    return g;
  }, []);
  const flameSprite = useMemo(() => sprite(1.8), []);
  const smokeSprite = useMemo(() => sprite(1.2), []);
  const phases = useMemo(() => Float32Array.from({ length: Math.max(FLAME_PARTICLES, SMOKE_PARTICLES) }, (_, i) => rand(i)), []);
  const lateral = useMemo(() => Float32Array.from({ length: FLAME_PARTICLES }, (_, i) => rand(i + 77777) - 0.5), []);
  const flameMat = useRef<THREE.PointsMaterial>(null);

  useFrame(({ clock }) => {
    const s = seeds.current;
    const time = clock.elapsedTime;
    const buoyancy = Math.min(1, Math.sqrt(Math.max(0, gravityG) / 0.166)); // 0 in µg, 1 at lunar g
    const flowLen = 0.03 + Math.min(40, flow) * 0.004;
    const riseLen = 0.32 * buoyancy;
    const pos = flameGeom.attributes.position.array as Float32Array;
    const col = flameGeom.attributes.color.array as Float32Array;
    const n = active ? Math.min(FLAME_PARTICLES, s.frontCount * 5) : 0;
    for (let i = 0; i < n; i++) {
      const j = (i * 7919) % s.frontCount;
      const o = j * 6;
      const t = (time * (1.4 + phases[i]) + phases[i]) % 1;
      const nx = s.front[o + 3], ny = s.front[o + 4], nz = s.front[o + 5];
      const lift = 0.015 + t * (0.05 + 0.08 * buoyancy);
      const wobble = Math.sin(time * 9 + i) * 0.006;
      pos[i * 3] = s.front[o] + t * flowLen + lateral[i] * 0.02;
      pos[i * 3 + 1] = s.front[o + 1] + ny * lift + t * t * riseLen + wobble;
      pos[i * 3 + 2] = s.front[o + 2] + nz * lift + lateral[i] * 0.02;
      void nx;
      // colour: hot core → orange → dim red; bluer base in microgravity (soot-free, cooler-looking flames)
      const fade = (1 - t) ** 1.6;
      const blue = 1 - buoyancy;
      if (t < 0.18) {
        col[i * 3] = (0.75 + 0.25 * buoyancy) * fade; col[i * 3 + 1] = (0.7 + 0.15 * buoyancy) * fade; col[i * 3 + 2] = (0.45 + 0.55 * blue) * fade;
      } else {
        col[i * 3] = 1.0 * fade; col[i * 3 + 1] = (0.42 - 0.25 * t) * fade; col[i * 3 + 2] = 0.08 * fade + 0.25 * blue * fade * (1 - t);
      }
    }
    flameGeom.setDrawRange(0, n);
    flameGeom.attributes.position.needsUpdate = true;
    flameGeom.attributes.color.needsUpdate = true;
    if (flameMat.current) flameMat.current.size = 0.15 + 0.06 * buoyancy + 0.02 * Math.sin(time * 13);

    const sp = smokeGeom.attributes.position.array as Float32Array;
    const m = active ? Math.min(SMOKE_PARTICLES, s.smokeCount * 3) : 0;
    for (let i = 0; i < m; i++) {
      const j = (i * 104729) % s.smokeCount;
      const t = (time * 0.12 * (0.6 + phases[i]) + phases[i]) % 1;
      sp[i * 3] = s.smoke[j * 3] + t * (0.25 + flow * 0.05) + Math.sin(time * 0.7 + i) * 0.04;
      sp[i * 3 + 1] = s.smoke[j * 3 + 1] + t * (0.05 + 1.3 * buoyancy) + Math.cos(time * 0.5 + i) * 0.03;
      sp[i * 3 + 2] = s.smoke[j * 3 + 2] + t * 0.35 + Math.sin(time * 0.4 + i * 3) * 0.04;
    }
    smokeGeom.setDrawRange(0, m);
    smokeGeom.attributes.position.needsUpdate = true;
  });

  return (
    <>
      <points geometry={smokeGeom} frustumCulled={false}>
        <pointsMaterial map={smokeSprite} color="#3d3a38" size={0.32} sizeAttenuation transparent opacity={0.16} depthWrite={false} />
      </points>
      <points geometry={flameGeom} frustumCulled={false}>
        <pointsMaterial ref={flameMat} map={flameSprite} vertexColors size={0.1} sizeAttenuation transparent depthWrite={false}
          blending={THREE.AdditiveBlending} />
      </points>
    </>
  );
}
