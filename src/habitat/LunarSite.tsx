// Lunar surface base around the simulated module, after the challenge slide: horizontal habitat
// modules joined by a node, a pressurized rover, solar arrays and a lander on cratered regolith.
// Geometry is illustrative; only the liner of the cut-away module carries the simulation.

import { useMemo } from "react";
import * as THREE from "three";

const GROUND_Y = -2.8;

const noise = (x: number, z: number) => {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

const CRATERS = [
  { x: -16, z: -12, r: 5.5, d: 0.9 }, { x: 14, z: -18, r: 7, d: 1.1 }, { x: 22, z: 6, r: 4, d: 0.6 },
  { x: -24, z: 10, r: 6, d: 0.8 }, { x: 4, z: -30, r: 9, d: 1.4 }, { x: -6, z: 22, r: 3.5, d: 0.5 },
  { x: 30, z: -4, r: 3, d: 0.4 }, { x: -32, z: -26, r: 8, d: 1.0 },
];

function terrainHeight(x: number, z: number) {
  let h = 0.18 * Math.sin(x * 0.08) * Math.cos(z * 0.06) + 0.08 * Math.sin(x * 0.31 + z * 0.17);
  for (const c of CRATERS) {
    const d = Math.hypot(x - c.x, z - c.z) / c.r;
    if (d < 1) h -= c.d * (1 - d * d);
    else if (d < 1.4) h += c.d * 0.35 * Math.sin(((d - 1) / 0.4) * Math.PI);
  }
  // flat pad under the base
  const pad = Math.max(0, 1 - Math.max(Math.abs(x) / 14, Math.abs(z) / 7));
  return h * (1 - Math.min(1, pad * 1.6));
}

function Terrain() {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(110, 110, 180, 180);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const h = terrainHeight(x, z);
      p.setY(i, h);
      const v = 0.48 + noise(x, z) * 0.08 + h * 0.05;
      colors.set([v, v, v * 1.02], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geometry} position={[0, GROUND_Y, 0]}>
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  );
}

const white = <meshStandardMaterial color="#e4e7eb" roughness={0.55} metalness={0.12} />;
const grey = <meshStandardMaterial color="#9aa1aa" roughness={0.6} metalness={0.3} />;
const dark = <meshStandardMaterial color="#3a4048" roughness={0.7} metalness={0.2} />;

/** Neighbouring module and connecting node, closed (only the main module is cut away). */
function SecondModule() {
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[4.35, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.95, 0.95, 1.3, 32]} />{grey}
      </mesh>
      <mesh position={[5.6, 0, 0]}>
        <sphereGeometry args={[1.6, 32, 24]} />{white}
      </mesh>
      <mesh position={[5.6, 0, -3.3]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[2, 2, 4.2, 40]} />{white}
      </mesh>
      {[-1.6, -3.3, -5.0].map((z) => (
        <mesh key={z} position={[5.6, 0, z]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.02, 0.04, 8, 48]} />{grey}
        </mesh>
      ))}
      {[[4.2, -2.2], [7, -2.2], [4.2, -4.6], [7, -4.6]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, -2.35, z]}>
          <cylinderGeometry args={[0.07, 0.11, 0.9, 10]} />{grey}
        </mesh>
      ))}
    </group>
  );
}

function SolarArray({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 2.5, 0]}><cylinderGeometry args={[0.06, 0.08, 5, 10]} />{grey}</mesh>
      <mesh position={[0, 4.4, 0]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[0.9, 2.6, 0.04]} />
        <meshStandardMaterial color="#1d3d6e" roughness={0.3} metalness={0.6} emissive="#0b1a33" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function Rover({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.55, 0]}><boxGeometry args={[3.2, 0.35, 1.7]} />{grey}</mesh>
      <mesh position={[0.2, 1.35, 0]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.75, 1.4, 8, 24]} />{white}
      </mesh>
      <mesh position={[1.45, 1.4, 0]} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[0.45, 24]} />
        <meshStandardMaterial color="#1a2433" roughness={0.1} metalness={0.8} />
      </mesh>
      {[-1.1, 0, 1.1].map((x) => [-0.95, 0.95].map((z) => (
        <mesh key={`${x}${z}`} position={[x, 0.38, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.38, 0.38, 0.28, 18]} />{dark}
        </mesh>
      )))}
    </group>
  );
}

function Lander({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 2.2, 0]}><cylinderGeometry args={[1.0, 1.4, 2.0, 8]} />
        <meshStandardMaterial color="#c9a24a" roughness={0.4} metalness={0.7} /></mesh>
      <mesh position={[0, 4.6, 0]}><cylinderGeometry args={[0.7, 1.0, 2.8, 16]} />{white}</mesh>
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} position={[Math.cos(k * Math.PI / 2) * 1.6, 0.8, Math.sin(k * Math.PI / 2) * 1.6]}
          rotation={[Math.sin(k * Math.PI / 2) * 0.5, 0, -Math.cos(k * Math.PI / 2) * 0.5]}>
          <cylinderGeometry args={[0.06, 0.06, 2.2, 8]} />{grey}
        </mesh>
      ))}
    </group>
  );
}

/** Interior props of the cut-away module (no fire coupling). */
export function InteriorProps() {
  return (
    <group>
      {[-1.5, -0.5, 0.5, 1.5].map((x) => (
        <mesh key={x} position={[x, 1.86, 0.15]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.7, 0.03, 0.12]} />
          <meshStandardMaterial color="#ffffff" emissive="#dfe9ff" emissiveIntensity={1.2} />
        </mesh>
      ))}
      <mesh position={[0.6, -0.78, 0.3]}><boxGeometry args={[1.2, 0.05, 0.7]} />{grey}</mesh>
      {[[0.1, 0.0], [1.1, 0.0], [0.1, 0.6], [1.1, 0.6]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, -1.0, z]}><cylinderGeometry args={[0.025, 0.025, 0.42, 8]} />{grey}</mesh>
      ))}
      {[-1.2, 1.2].map((z) => (
        <mesh key={z} position={[0, -1.17, z]}><boxGeometry args={[6.0, 0.04, 0.05]} />
          <meshStandardMaterial color="#6d7682" emissive="#9fb3c8" emissiveIntensity={0.08} /></mesh>
      ))}
    </group>
  );
}

export function LunarSite() {
  return (
    <group>
      <Terrain />
      <SecondModule />
      <Rover position={[-8.5, GROUND_Y, 3.5]} rotation={0.5} />
      <SolarArray position={[-9, GROUND_Y, -6]} rotation={0.4} />
      <SolarArray position={[-11.5, GROUND_Y, -4]} rotation={0.4} />
      <SolarArray position={[12, GROUND_Y, -7]} rotation={-0.3} />
      <Lander position={[-20, GROUND_Y, -16]} />
    </group>
  );
}
