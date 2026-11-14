import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { GRID, LINER, MATERIAL_IDS, MATERIAL_INFO, MODULE } from "./habitatModel";
import type { EnsembleResult } from "./engine";

export type ViewMode = "run" | "probability";
const MAX_FLAMES = 1400;

export interface HabitatSceneProps {
  material: Uint8Array;
  behavior: Uint8Array;
  ensemble: EnsembleResult | null;
  step: number;
  run: number;
  view: ViewMode;
  ignition: { col: number; row: number };
  flow: number;
  onIgnite: (col: number, row: number) => void;
  resetCameraKey: number;
}

/** Cylinder-wall patch around the module axis (x). u runs along x, v along the arc. */
function bentPlane(x0: number, x1: number, phi0: number, phi1: number, radius: number, segX = 64, segPhi = 96) {
  const positions: number[] = [], uvs: number[] = [], normals: number[] = [], index: number[] = [];
  for (let j = 0; j <= segPhi; j++) {
    const v = j / segPhi, phi = phi0 + v * (phi1 - phi0);
    const cy = Math.cos(phi), cz = Math.sin(phi);
    for (let i = 0; i <= segX; i++) {
      const u = i / segX;
      positions.push(x0 + u * (x1 - x0), radius * cy, radius * cz);
      normals.push(0, -cy, -cz);
      uvs.push(u, v);
    }
  }
  for (let j = 0; j < segPhi; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * (segX + 1) + i, b = a + 1, c = a + segX + 1, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

export function cellToWorld(col: number, row: number, inset = 0): [number, number, number] {
  const x = MODULE.linerX0 + ((col + 0.5) / GRID.cols) * (MODULE.linerX1 - MODULE.linerX0);
  const phi = LINER.phi0 + ((row + 0.5) / GRID.rows) * (LINER.phi1 - LINER.phi0);
  const radius = MODULE.linerRadius - inset;
  return [x, radius * Math.cos(phi), radius * Math.sin(phi)];
}

const hash = (i: number) => {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  return ((Math.imul(h, 0xc2b2ae35) >>> 0) % 1000) / 1000;
};

function Liner(props: HabitatSceneProps) {
  const { material, behavior, ensemble, step, run, view, onIgnite } = props;
  const n = GRID.cols * GRID.rows;
  const [colorTex, glowTex] = useMemo(() => {
    const make = () => {
      const texture = new THREE.DataTexture(new Uint8Array(n * 4), GRID.cols, GRID.rows, THREE.RGBAFormat);
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      return texture;
    };
    const color = make();
    color.colorSpace = THREE.SRGBColorSpace;
    return [color, make()];
  }, [n]);
  const geometry = useMemo(() => bentPlane(MODULE.linerX0, MODULE.linerX1, LINER.phi0, LINER.phi1, MODULE.linerRadius, 80, 120), []);
  const glowLight = useRef<THREE.PointLight>(null);
  const glow = useRef({ x: 0, y: 0, z: 0, power: 0 });
  const flameMaterial = useRef<THREE.PointsMaterial>(null);
  const flameGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_FLAMES * 3), 3));
    geometry.setDrawRange(0, 0);
    return geometry;
  }, []);
  const flameSprite = useMemo(() => {
    const size = 64, data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
      const a = Math.max(0, 1 - d) ** 2.2;
      data.set([255, 200 + 55 * a, 120 + 100 * a, 255 * a], (y * size + x) * 4);
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.needsUpdate = true;
    return texture;
  }, []);

  useEffect(() => {
    const color = colorTex.image.data as Uint8Array;
    const emit = glowTex.image.data as Uint8Array;
    const arrivals = ensemble?.arrivals ?? [];
    const contacts = ensemble?.contacts ?? [];
    const arrival = arrivals[Math.min(run, arrivals.length - 1)];
    const contact = contacts[Math.min(run, contacts.length - 1)];
    let sx = 0, sy = 0, front = 0, flameCount = 0;
    const flamePositions = flameGeometry.attributes.position.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const base = MATERIAL_INFO[MATERIAL_IDS[material[i]]].color;
      const grain = 0.9 + hash(i) * 0.14;
      let r = base[0] * grain, g = base[1] * grain, b = base[2] * grain;
      let er = 0, eg = 0, eb = 0;
      if (ensemble && view === "run" && arrival) {
        const a = arrival[i];
        if (a >= 0 && a <= step) {
          const age = step - a;
          if (age <= 3) {
            const t = age / 3;
            r = 255; g = 214 - 110 * t; b = 120 - 90 * t;
            er = 255; eg = 170 - 110 * t; eb = 60 - 50 * t;
            front++; sx += i % GRID.cols; sy += (i / GRID.cols) | 0;
            if (age <= 1 && flameCount < MAX_FLAMES && hash(i + step) < 0.5) {
              const [fx, fy, fz] = cellToWorld(i % GRID.cols, (i / GRID.cols) | 0, 0.02 + hash(i * 3) * 0.05);
              flamePositions[flameCount * 3] = fx; flamePositions[flameCount * 3 + 1] = fy; flamePositions[flameCount * 3 + 2] = fz;
              flameCount++;
            }
          } else {
            const ember = Math.max(0, 1 - (age - 3) / 25);
            const char = 0.8 + hash(i + 7) * 0.45;
            const soot = Math.min(1, (age - 3) / 60);
            r = (138 - 40 * soot) * char + 110 * ember; g = (108 - 34 * soot) * char + 34 * ember; b = (92 - 28 * soot) * char;
            er = 170 * ember * ember; eg = 46 * ember * ember;
          }
        } else if (contact && contact[i] >= 0 && contact[i] <= step) {
          if (behavior[i] === 3) { r = 170; g = 130; b = 255; er = 120; eg = 80; eb = 255; }
          else { r = 120; g = 210; b = 165; er = 30; eg = 110; eb = 70; }
        }
      } else if (ensemble && view === "probability") {
        let reached = 0, touched = 0;
        for (let s = 0; s < arrivals.length; s++) {
          const a = arrivals[s][i];
          if (a >= 0 && a <= step) reached++;
          else if (contacts[s][i] >= 0 && contacts[s][i] <= step) touched++;
        }
        const p = reached / arrivals.length;
        if (p > 0) {
          // sequential amber → deep red ramp by probability
          const t = p;
          r = 255 - 60 * t; g = 205 - 170 * t; b = 120 - 95 * t;
          er = 60 * t + 20; eg = 30 * (1 - t) + 6; eb = 0;
        } else if (touched) {
          const q = touched / arrivals.length;
          if (behavior[i] === 3) { r = 120 + 50 * q; g = 100 + 30 * q; b = 200 + 55 * q; er = 60 * q; eg = 40 * q; eb = 160 * q; }
          else { r = 110; g = 190; b = 150; }
        } else {
          r *= 0.55; g *= 0.55; b *= 0.55;
        }
      }
      const o = i * 4;
      color[o] = r; color[o + 1] = g; color[o + 2] = b; color[o + 3] = 255;
      emit[o] = er; emit[o + 1] = eg; emit[o + 2] = eb; emit[o + 3] = 255;
    }
    colorTex.needsUpdate = true;
    glowTex.needsUpdate = true;
    flameGeometry.setDrawRange(0, view === "run" ? flameCount : 0);
    flameGeometry.attributes.position.needsUpdate = true;
    flameGeometry.computeBoundingSphere();
    if (front) {
      const [x, y, z] = cellToWorld(sx / front, sy / front, 0.5);
      glow.current = { x, y, z, power: Math.min(9, 1.5 + front / 60) };
    } else glow.current.power = 0;
  }, [colorTex, glowTex, flameGeometry, ensemble, step, run, view, material, behavior, n]);

  useFrame(({ clock }) => {
    if (flameMaterial.current) {
      flameMaterial.current.opacity = 0.75 + 0.25 * Math.sin(clock.elapsedTime * 17);
      flameMaterial.current.size = 0.13 + 0.03 * Math.sin(clock.elapsedTime * 11);
    }
    const light = glowLight.current;
    if (!light) return;
    const flicker = 1 + 0.18 * Math.sin(clock.elapsedTime * 13) + 0.08 * Math.sin(clock.elapsedTime * 31);
    light.position.set(glow.current.x, glow.current.y, glow.current.z);
    light.intensity = glow.current.power * flicker;
  });

  const click = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 4 || !event.uv) return;
    event.stopPropagation();
    onIgnite(Math.min(GRID.cols - 1, Math.floor(event.uv.x * GRID.cols)), Math.min(GRID.rows - 1, Math.floor(event.uv.y * GRID.rows)));
  };

  return (
    <>
      <mesh geometry={geometry} onClick={click}>
        <meshStandardMaterial map={colorTex} emissiveMap={glowTex} emissive="#ffffff" emissiveIntensity={1.4} roughness={0.92} side={THREE.DoubleSide} />
      </mesh>
      <pointLight ref={glowLight} color="#ff8a3d" distance={3.2} decay={1.6} intensity={0} />
      <points geometry={flameGeometry} frustumCulled={false}>
        <pointsMaterial ref={flameMaterial} map={flameSprite} color="#ff9a45" size={0.08} sizeAttenuation transparent
          depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </>
  );
}

function Shell() {
  const shell = useMemo(() => bentPlane(-MODULE.length / 2, MODULE.length / 2, -Math.PI, 0.55, MODULE.radius, 48, 72), []);
  const ribs = [-3.2, -2.1, -1.05, 0, 1.05, 2.1, 3.2];
  return (
    <group>
      <mesh geometry={shell}>
        <meshStandardMaterial color="#d9dde2" roughness={0.6} metalness={0.15} side={THREE.DoubleSide} />
      </mesh>
      {ribs.map((x) => (
        <group key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <mesh rotation={[0, 0, -Math.PI / 2]}>
            <torusGeometry args={[MODULE.radius + 0.02, 0.035, 8, 64, Math.PI + 0.55]} />
            <meshStandardMaterial color="#b9bfc7" roughness={0.5} metalness={0.3} />
          </mesh>
        </group>
      ))}
      {/* end bulkheads with hatches */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * MODULE.length / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <mesh>
            <circleGeometry args={[MODULE.radius, 64, -Math.PI / 2, Math.PI + 0.55]} />
            <meshStandardMaterial color="#c4c9cf" roughness={0.7} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, -0.2, side * -0.01]}>
            <ringGeometry args={[0.55, 0.68, 48]} />
            <meshStandardMaterial color="#59616b" side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
      {/* floor deck and legs */}
      <mesh position={[0, -1.22, 0]}>
        <boxGeometry args={[MODULE.length - 0.1, 0.06, 3.1]} />
        <meshStandardMaterial color="#7b838d" roughness={0.8} />
      </mesh>
      {[-2.4, 2.4].map((x) => [-1.2, 1.2].map((z) => (
        <mesh key={`${x}${z}`} position={[x, -2.35, z]}>
          <cylinderGeometry args={[0.07, 0.11, 0.9, 12]} />
          <meshStandardMaterial color="#8d939b" metalness={0.4} roughness={0.5} />
        </mesh>
      )))}
      {/* equipment racks in front of the aluminium zone */}
      {[-1.65, -1.0, -0.35].map((x) => (
        <mesh key={x} position={[x, 1.72 * Math.cos(-0.92), 1.72 * Math.sin(-0.92)]} rotation={[-0.92 + Math.PI / 2, 0, 0]}>
          <boxGeometry args={[0.58, 0.95, 0.26]} />
          <meshStandardMaterial color="#9aa3ad" roughness={0.55} metalness={0.25} />
        </mesh>
      ))}
    </group>
  );
}

function Airflow({ flow }: { flow: number }) {
  const group = useRef<THREE.Group>(null);
  const arrows = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ y: -0.6 + (i % 3) * 0.55, z: -0.4 + Math.floor(i / 3) * 0.45, offset: (i * 0.37) % 1 })), []);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const speed = Math.max(0.05, flow / 20) * 0.35;
    group.current.children.forEach((child, i) => {
      const t = (clock.elapsedTime * speed + arrows[i].offset) % 1;
      child.position.x = -2.6 + t * 5.2;
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = Math.sin(t * Math.PI) * Math.min(0.75, 0.15 + flow / 30);
    });
  });
  return (
    <group ref={group}>
      {arrows.map((a, i) => (
        <mesh key={i} position={[0, a.y, a.z]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.035, 0.16, 10]} />
          <meshBasicMaterial color="#5de6e3" transparent opacity={0.5} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function IgnitionMarker({ col, row }: { col: number; row: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const [x, y, z] = cellToWorld(col, row, 0.03);
  const phi = LINER.phi0 + ((row + 0.5) / GRID.rows) * (LINER.phi1 - LINER.phi0);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + 0.25 * Math.sin(clock.elapsedTime * 4));
  });
  return (
    <mesh ref={ref} position={[x, y, z]} rotation={[phi - Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.22, 0.25, 48]} />
      <meshBasicMaterial color="#fff1c2" side={THREE.DoubleSide} transparent opacity={0.9} />
    </mesh>
  );
}

function Ground() {
  const texture = useMemo(() => {
    const size = 256;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const v = 70 + hash(i) * 30 + 12 * Math.sin((i % size) / 9) * Math.cos(i / size / 7);
      data.set([v, v, v + 3, 255], i * 4);
    }
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 10);
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.8, 0]}>
      <circleGeometry args={[40, 64]} />
      <meshStandardMaterial map={texture} roughness={1} color="#9a9a9e" />
    </mesh>
  );
}

export default function HabitatScene(props: HabitatSceneProps) {
  return (
    <Canvas camera={{ position: [3.6, 1.5, 6.4], fov: 42 }} dpr={[1, 2]}>
      <color attach="background" args={["#05070b"]} />
      <fog attach="fog" args={["#05070b", 18, 46]} />
      <Stars radius={60} depth={30} count={2500} factor={3} fade speed={0.3} />
      <mesh position={[-14, 11, -30]}>
        <sphereGeometry args={[2.2, 48, 48]} />
        <meshStandardMaterial color="#3d6fb6" emissive="#1c3f7a" emissiveIntensity={0.7} roughness={0.8} />
      </mesh>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#cfd8e6", "#2a2a2e", 0.6]} />
      <directionalLight position={[8, 10, 6]} intensity={1.8} color="#fff6e8" />
      <pointLight position={[0, 1.2, 0.6]} intensity={2.2} distance={6} color="#e8eef8" />
      <Ground />
      <Shell />
      <Liner {...props} />
      <IgnitionMarker col={props.ignition.col} row={props.ignition.row} />
      <Airflow flow={props.flow} />
      <OrbitControls key={props.resetCameraKey} makeDefault target={[0, -0.1, -0.4]} maxDistance={16} minDistance={1.5} maxPolarAngle={Math.PI * 0.62} />
    </Canvas>
  );
}
