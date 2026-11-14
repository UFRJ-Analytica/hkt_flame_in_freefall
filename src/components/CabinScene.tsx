import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { Html, OrbitControls, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { SceneProps } from "../types";
import { phase, surfaceFrame, visualFlow, visualState, visualTime, type SurfaceId, type V3 } from "./scene/visualRules";

const IVORY = "#d4d0bb";
const METAL = "#77838c";
const DARK = "#182b39";
const CYAN = "#76e5e9";
const AMBER = "#ffc36c";
// Illustrative overlays must never steal the cabin's surface-picking ray.
const ignoreRaycast = () => {};
const names: Record<string, string> = {
  console_main: "CONSOLE",
  crew_seats: "ASSENTOS",
  wall_panels: "ISOLAMENTO",
  cable_run: "CABEAMENTO",
  floor: "PISO",
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return reduced;
}

function makeTexture(kind: "quilt" | "display" | "label") {
  const canvas = document.createElement("canvas");
  canvas.width = kind === "display" ? 512 : 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  if (kind === "quilt") {
    ctx.fillStyle = "#dedac9";
    ctx.fillRect(0, 0, 256, 256);
    for (let x = -128; x < 384; x += 64)
      for (let y = -128; y < 384; y += 64) {
        const g = ctx.createRadialGradient(
          x + 32,
          y + 32,
          1,
          x + 32,
          y + 32,
          48,
        );
        g.addColorStop(0, "#eee9d7");
        g.addColorStop(1, "#b9b5a6");
        ctx.fillStyle = g;
        ctx.fillRect(x, y, 64, 64);
        ctx.strokeStyle = "#a6a397";
        ctx.lineWidth = 1.3;
        ctx.strokeRect(x, y, 64, 64);
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = "#f7f0dc";
        ctx.strokeRect(x + 3, y + 3, 58, 58);
        ctx.setLineDash([]);
      }
  } else if (kind === "display") {
    ctx.fillStyle = "#071c28";
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = "#79dce0";
    ctx.font = "18px monospace";
    ctx.fillText("ORION / HABITAT SYSTEMS", 22, 30);
    ctx.strokeStyle = "#204953";
    ctx.lineWidth = 1;
    for (let x = 20; x < 500; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 54);
      ctx.lineTo(x, 225);
      ctx.stroke();
    }
    for (let y = 54; y < 240; y += 24) {
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(490, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#78e5da";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 180; i++) {
      const x = 24 + i * 1.55,
        y = 130 + Math.sin(i * 0.055) * 21 + Math.sin(i * 0.19) * 3;
      if (!i) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = "#eabd77";
    ctx.beginPath();
    ctx.arc(410, 133, 46, -0.7, 4.5);
    ctx.stroke();
    ctx.strokeStyle = "#6eabb7";
    ctx.beginPath();
    ctx.arc(410, 133, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#b9ccd0";
    ctx.font = "12px monospace";
    ctx.fillText("CABIN   /   ECLSS   /   POWER", 24, 232);
    ctx.fillStyle = "#ffc36c";
    ctx.fillRect(24, 185, 65, 4);
    ctx.fillStyle = "#62b7bc";
    ctx.fillRect(100, 185, 124, 4);
  } else {
    ctx.fillStyle = "#d9d4bf";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "#263746";
    ctx.font = "bold 28px monospace";
    ctx.fillText("HABITAT", 22, 78);
    ctx.fillText("SYSTEMS", 22, 113);
    ctx.fillRect(22, 137, 210, 3);
    ctx.font = "15px monospace";
    ctx.fillText("ACCESS / 04", 22, 172);
    for (let i = 0; i < 35; i++)
      ctx.fillRect(22 + i * 6, 192, i % 3 === 0 ? 3 : 1, 30);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function Box({
  position,
  size,
  color = METAL,
  rotation,
  metalness = 0.35,
  roughness = 0.6,
  glow,
  children,
}: {
  position?: V3;
  size: V3;
  color?: string;
  rotation?: V3;
  metalness?: number;
  roughness?: number;
  glow?: string;
  children?: ReactNode;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        metalness={metalness}
        roughness={roughness}
        emissive={glow || "#000000"}
        emissiveIntensity={glow ? 1.6 : 0}
      />
      {children}
    </mesh>
  );
}
function Tube({
  points,
  radius = 0.027,
  color = METAL,
}: {
  points: V3[];
  radius?: number;
  color?: string;
}) {
  const pointsKey = JSON.stringify(points);
  const geometry = useMemo(
    () =>
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(
          (JSON.parse(pointsKey) as V3[]).map((p) => new THREE.Vector3(...p)),
        ),
        40,
        radius,
        6,
        false,
      ),
    [pointsKey, radius],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} castShadow>
      <meshStandardMaterial color={color} roughness={0.52} metalness={0.38} />
    </mesh>
  );
}
function Ring({
  radius,
  position,
  rotation = [Math.PI / 2, 0, 0],
  tube = 0.04,
  color = METAL,
  arc = Math.PI * 2,
}: {
  radius: number;
  position: V3;
  rotation?: V3;
  tube?: number;
  color?: string;
  arc?: number;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <torusGeometry args={[radius, tube, 8, 80, arc]} />
      <meshStandardMaterial color={color} metalness={0.65} roughness={0.36} />
    </mesh>
  );
}
function Fasteners({ positions }: { positions: V3[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const dummy = new THREE.Object3D();
    positions.forEach((position, index) => {
      dummy.position.set(...position);
      dummy.updateMatrix();
      ref.current?.setMatrixAt(index, dummy.matrix);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [positions]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, positions.length]}>
      <sphereGeometry args={[0.025, 6, 4]} />
      <meshStandardMaterial color="#bcc6c8" roughness={0.3} metalness={0.8} />
    </instancedMesh>
  );
}
function Surface({
  id,
  props,
  children,
}: {
  id: SurfaceId;
  props: SceneProps;
  children: ReactNode;
}) {
  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    props.onSelectSurface(id);
  };
  return (
    <group
      onClick={select}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      {children}
    </group>
  );
}
function surfaceColor(props: SceneProps, id: SurfaceId, fallback = IVORY) {
  if (props.selectedSurface === id) return "#e2bb7f";
  const assigned = props.materialAssignments[id];
  return (
    (
      {
        Nomex: fallback,
        PMMA: "#c0d7d9",
        SIBAL: "#b7c2bd",
        Kapton: "#b68a47",
        Alumínio: "#a7b3b9",
      } as Record<string, string>
    )[assigned] || fallback
  );
}

function Chair({ position, props }: { position: V3; props: SceneProps }) {
  const color = surfaceColor(props, "crew_seats", "#d9d4c1");
  return (
    <group position={position} rotation={[-0.1, 0, 0]}>
      <Box position={[0, -0.32, 0]} size={[0.12, 0.42, 0.12]} color="#74848a" />
      <Box position={[0, -0.46, 0.03]} size={[0.75, 0.07, 0.6]} color={DARK} />
      <RoundedBox
        args={[0.6, 0.69, 0.16]}
        radius={0.08}
        smoothness={2}
        position={[0, 0.24, -0.2]}
        rotation={[-0.17, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color={color} roughness={0.94} />
      </RoundedBox>
      <RoundedBox
        args={[0.61, 0.14, 0.57]}
        radius={0.06}
        smoothness={2}
        position={[0, -0.09, 0.02]}
        castShadow
      >
        <meshStandardMaterial color={color} roughness={0.94} />
      </RoundedBox>
      <RoundedBox
        args={[0.43, 0.24, 0.19]}
        radius={0.06}
        smoothness={2}
        position={[0, 0.69, -0.27]}
        castShadow
      >
        <meshStandardMaterial color="#c7c7bc" roughness={0.85} />
      </RoundedBox>
      {[-1, 1].map((side) => (
        <group key={side}>
          <Box
            position={[side * 0.36, 0.06, 0.02]}
            size={[0.075, 0.09, 0.51]}
            color={DARK}
          />
          <Box
            position={[side * 0.17, 0.27, -0.076]}
            size={[0.072, 0.6, 0.025]}
            rotation={[0, 0, side * -0.2]}
            color="#485762"
            metalness={0}
          />
          <Box
            position={[side * 0.16, -0.005, 0.17]}
            size={[0.32, 0.045, 0.034]}
            rotation={[0, side * -0.4, 0]}
            color="#485762"
          />
          <Tube
            points={[
              [side * 0.3, -0.42, 0.23],
              [side * 0.37, -0.24, 0.23],
              [side * 0.37, 0.01, 0.17],
            ]}
            radius={0.022}
          />
        </group>
      ))}
      <Box
        position={[0, 0.02, 0.012]}
        size={[0.13, 0.09, 0.065]}
        color="#afb7b4"
        roughness={0.22}
      />
      <Box
        position={[0, 0.02, 0.048]}
        size={[0.047, 0.043, 0.008]}
        color="#d57e43"
      />
    </group>
  );
}

function Console({
  props,
  display,
}: {
  props: SceneProps;
  display: THREE.Texture;
}) {
  return (
    <Surface id="console_main" props={props}>
      <group position={[0, 0.23, -1.27]} rotation={[-0.23, 0, 0]}>
        <RoundedBox
          args={[2.28, 0.88, 0.24]}
          radius={0.09}
          smoothness={2}
          castShadow
        >
          <meshStandardMaterial
            color={surfaceColor(props, "console_main", "#76827f")}
            metalness={0.45}
            roughness={0.5}
          />
        </RoundedBox>
        {[-0.72, 0, 0.72].map((x, i) => (
          <group key={x} position={[x, 0.03, 0.146]}>
            <Box size={[0.64, 0.5, 0.05]} color="#0e202c" />
            <mesh position={[0, 0.022, 0.029]}>
              <planeGeometry args={[0.55, 0.37]} />
              <meshBasicMaterial map={display} toneMapped={false} />
            </mesh>
            {[-0.2, -0.1, 0, 0.1, 0.2].map((bx, j) => (
              <Box
                key={bx}
                position={[bx, -0.21, 0.032]}
                size={[0.041, 0.024, 0.015]}
                color={j === i ? AMBER : "#6d9097"}
                glow={j === i ? "#664218" : undefined}
              />
            ))}
          </group>
        ))}
        <Box
          position={[0, -0.54, 0.2]}
          size={[2.19, 0.16, 0.43]}
          color="#637373"
          rotation={[0.16, 0, 0]}
        />
        {Array.from({ length: 18 }, (_, i) => (
          <Box
            key={i}
            position={[-0.94 + i * 0.111, -0.45, 0.34]}
            size={[0.046, 0.021, 0.05]}
            color={i % 5 === 0 ? "#d8b375" : "#b7bfb5"}
          />
        ))}
        {[-1.06, 1.06].map((x) => (
          <Tube
            key={x}
            points={[
              [x, -0.46, 0.18],
              [x, -0.08, 0.24],
              [x, 0.38, 0.18],
            ]}
            radius={0.027}
            color="#c4cbca"
          />
        ))}
      </group>
    </Surface>
  );
}

function Capsule({
  props,
  quilt,
  display,
  label,
}: {
  props: SceneProps;
  quilt: THREE.Texture;
  display: THREE.Texture;
  label: THREE.Texture;
}) {
  const panelColor = surfaceColor(props, "wall_panels");
  const angles = Array.from(
    { length: props.cutaway ? 9 : 16 },
    (_, i) => Math.PI / 2 + (i * Math.PI) / 8,
  );
  const bolts = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i): V3 => {
        const a = (i / 48) * Math.PI * 2;
        return [Math.sin(a) * 2.48, -1.17, Math.cos(a) * 2.48];
      }),
    [],
  );
  return (
    <group>
      <mesh position={[0, 0.19, 0]} rotation={[0, Math.PI / 2, 0]}>
        <cylinderGeometry
          args={[
            1.37,
            2.7,
            3.14,
            64,
            1,
            true,
            0,
            props.cutaway ? Math.PI : Math.PI * 2,
          ]}
        />
        <meshStandardMaterial
          color="#7a8a95"
          side={THREE.DoubleSide}
          metalness={0.7}
          roughness={0.48}
        />
      </mesh>
      <Ring
        position={[0, -1.36, 0]}
        radius={2.66}
        tube={0.105}
        color="#6c7c89"
      />
      <Ring
        position={[0, -1.23, 0]}
        radius={2.58}
        tube={0.045}
        color="#c3c9c6"
      />
      <Surface id="floor" props={props}>
        <mesh position={[0, -1.35, 0]} receiveShadow>
          <cylinderGeometry args={[2.58, 2.58, 0.16, 64]} />
          <meshStandardMaterial
            color={surfaceColor(props, "floor", "#6c787b")}
            roughness={0.78}
            metalness={0.45}
          />
        </mesh>
        {[-1.5, -0.75, 0, 0.75, 1.5].map((x) => (
          <Box
            key={x}
            position={[x, -1.258, 0]}
            size={[0.014, 0.009, 3.7]}
            color="#2f424d"
          />
        ))}
        {[-1.5, -0.75, 0, 0.75, 1.5].map((z) => (
          <Box
            key={z}
            position={[0, -1.256, z]}
            size={[3.7, 0.009, 0.014]}
            color="#2f424d"
          />
        ))}
        <Box
          position={[0, -1.24, 1.77]}
          size={[1.4, 0.014, 0.18]}
          color="#d5b775"
        />
        {Array.from({ length: 9 }, (_, i) => (
          <Box
            key={i}
            position={[-0.59 + i * 0.15, -1.23, 1.77]}
            size={[0.06, 0.012, 0.18]}
            color="#33424a"
            rotation={[0, -0.45, 0]}
          />
        ))}
      </Surface>
      <Fasteners positions={bolts} />
      <Surface id="wall_panels" props={props}>
        {angles.slice(0, -1).flatMap((a, i) =>
          [0, 1, 2].map((row) => {
            const angle = a + Math.PI / 16,
              y = -0.79 + row * 0.76,
              r = 2.4 - (y + 1.1) * 0.42;
            return (
              <group
                key={`${i}-${row}`}
                position={[Math.sin(angle) * r, y, Math.cos(angle) * r]}
                rotation={[0, angle, 0.0]}
              >
                <RoundedBox
                  args={[r * 0.375, 0.7, 0.14]}
                  radius={0.055}
                  smoothness={2}
                  rotation={[-0.39, 0, 0]}
                  castShadow
                  receiveShadow
                >
                  <meshStandardMaterial
                    map={quilt}
                    color={panelColor}
                    roughness={0.91}
                  />
                </RoundedBox>
                <Box
                  position={[0, -0.28, 0.105]}
                  size={[0.15, 0.052, 0.018]}
                  color="#8d9995"
                />
              </group>
            );
          }),
        )}
      </Surface>
      {angles.map((a, i) => (
        <Tube
          key={i}
          points={[
            [Math.sin(a) * 2.58, -1.25, Math.cos(a) * 2.58],
            [Math.sin(a) * 2.02, 0.1, Math.cos(a) * 2.02],
            [Math.sin(a) * 1.4, 1.66, Math.cos(a) * 1.4],
          ]}
          radius={0.052}
          color="#a4adab"
        />
      ))}
      <Ring
        position={[0, 1.73, 0]}
        radius={1.37}
        tube={0.065}
        color="#b2bdbb"
        arc={props.cutaway ? Math.PI : Math.PI * 2}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <group position={[0, 1.15, -1.43]} rotation={[-0.3, 0, 0]}>
        <Ring
          position={[0, 0, 0]}
          rotation={[0, 0, 0]}
          radius={0.44}
          tube={0.1}
          color="#b5beb9"
        />
        <Ring
          position={[0, 0, 0.02]}
          rotation={[0, 0, 0]}
          radius={0.33}
          tube={0.022}
          color="#617982"
        />
        <mesh position={[0, 0, -0.05]}>
          <circleGeometry args={[0.35, 48]} />
          <meshStandardMaterial
            color="#0c2638"
            metalness={0.75}
            roughness={0.2}
          />
        </mesh>
        <Box
          position={[0.37, -0.2, 0.08]}
          size={[0.2, 0.045, 0.04]}
          color="#e3bb76"
        />
      </group>
      <Surface id="crew_seats" props={props}>
        {[-0.65, 0.65].flatMap((x) =>
          [-0.25, 0.88].map((z) => (
            <Chair key={`${x}-${z}`} position={[x, -0.65, z]} props={props} />
          )),
        )}
      </Surface>
      <Console props={props} display={display} />
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * 1.73, -0.51, -0.57]}
          rotation={[0, side * -0.35, 0]}
        >
          <Box size={[0.43, 1.13, 0.72]} color="#78857e" />
          {[0, 1, 2, 3].map((i) => (
            <group key={i} position={[0, -0.4 + i * 0.265, 0.37]}>
              <Box size={[0.36, 0.22, 0.035]} color="#aeb4a8" />
              <Box
                position={[-0.1, 0.015, 0.025]}
                size={[0.07, 0.12, 0.025]}
                color="#283c45"
              />
              {[0, 1, 2].map((j) => (
                <Box
                  key={j}
                  position={[0.025 + j * 0.04, 0.03, 0.027]}
                  size={[0.015, 0.016, 0.018]}
                  color={j === 2 ? AMBER : CYAN}
                  glow={j === 2 ? "#775520" : "#235e64"}
                />
              ))}
              <Box
                position={[0.07, -0.05, 0.025]}
                size={[0.15, 0.015, 0.017]}
                color="#566f72"
              />
            </group>
          ))}
          <mesh position={[0, 0.41, 0.393]}>
            <planeGeometry args={[0.25, 0.2]} />
            <meshStandardMaterial map={label} roughness={0.8} />
          </mesh>
        </group>
      ))}
      <Surface id="cable_run" props={props}>
        {[-1, 1].flatMap((side) =>
          [0, 1, 2, 3].map((i) => (
            <Tube
              key={`${side}-${i}`}
              points={[
                [side * 2.17, -1.05, 0.9],
                [side * 2.28, -0.95, 0.1],
                [side * 2.1, -0.62 + i * 0.042, -0.85],
                [side * 1.4, -0.6 + i * 0.042, -1.6],
                [side * 0.8, -0.49 + i * 0.042, -1.55],
              ]}
              radius={0.025}
              color={
                props.selectedSurface === "cable_run"
                  ? AMBER
                  : surfaceColor(props, "cable_run", i === 0 ? "#c79549" : "#344c5b")
              }
            />
          )),
        )}
      </Surface>
      {[-1, 1].map((side) => (
        <group key={side}>
          <Tube
            points={[
              [side * 1.7, 0.66, -1.15],
              [side * 1.86, 0.35, -0.85],
              [side * 2.08, -0.05, -0.45],
            ]}
            radius={0.09}
            color="#9caaa7"
          />
          {Array.from({ length: 9 }, (_, i) => (
            <Ring
              key={i}
              position={[
                side * (1.7 + i * 0.045),
                0.66 - i * 0.082,
                -1.15 + i * 0.08,
              ]}
              rotation={[Math.PI / 4, 0, -side * 0.4]}
              radius={0.095}
              tube={0.013}
              color="#61787e"
            />
          ))}
          <Box
            position={[side * 1.7, 0.93, -0.73]}
            size={[0.1, 0.55, 0.09]}
            color="#ddf1e8"
            glow="#678e86"
            rotation={[0, 0, -side * 0.35]}
          />
          <Box
            position={[side * 2.15, -0.91, 0.1]}
            size={[0.07, 0.045, 0.62]}
            color={AMBER}
            glow="#8c5924"
          />
        </group>
      ))}
    </group>
  );
}

function Station({
  props,
  quilt,
  display,
}: {
  props: SceneProps;
  quilt: THREE.Texture;
  display: THREE.Texture;
}) {
  return (
    <group>
      <Surface id="floor" props={props}>
        <Box
          position={[0, -1.35, 0]}
          size={[4.4, 0.16, 4.8]}
          color={surfaceColor(props, "floor", "#7c8987")}
        />
        {Array.from({ length: 11 }, (_, i) => (
          <Box
            key={i}
            position={[-1.9 + i * 0.38, -1.259, 0]}
            size={[0.012, 0.01, 4.6]}
            color="#455d65"
          />
        ))}
      </Surface>
      <Surface id="wall_panels" props={props}>
        <Box position={[0, 0.18, -2.4]} size={[4.4, 3, 0.18]} color="#a3ada4" />
        {[-1.6, -0.8, 0, 0.8, 1.6].map((x) => (
          <group key={x} position={[x, 0.1, -2.26]}>
            <RoundedBox
              args={[0.74, 2.65, 0.15]}
              radius={0.06}
              smoothness={2}
              castShadow
            >
              <meshStandardMaterial
                map={quilt}
                color={surfaceColor(props, "wall_panels")}
                roughness={0.9}
              />
            </RoundedBox>
            <Box
              position={[0, 0.95, 0.09]}
              size={[0.4, 0.08, 0.03]}
              color="#c5c7b7"
            />
          </group>
        ))}
        {!props.cutaway && (
          <>
            <Box position={[2.2, 0.2, 0]} size={[0.15, 3, 4.8]} color={IVORY} />
            <Box
              position={[0, 1.73, 0]}
              size={[4.4, 0.15, 4.8]}
              color={IVORY}
            />
          </>
        )}
      </Surface>
      {[-2.33, -0.9, 0.8, 2.33].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <Box
            position={[-2.2, 0.15, 0]}
            size={[0.1, 3.12, 0.14]}
            color="#b1bbb5"
          />
          <Box
            position={[0, -1.25, 0]}
            size={[4.4, 0.09, 0.14]}
            color="#b1bbb5"
          />
          {!props.cutaway && (
            <Box
              position={[0, 1.7, 0]}
              size={[4.4, 0.1, 0.14]}
              color="#b1bbb5"
            />
          )}
        </group>
      ))}
      <group position={[-1.55, 0.03, -1.3]} rotation={[0, Math.PI / 2, 0]}>
        <Ring
          radius={0.75}
          position={[0, 0, 0]}
          rotation={[0, 0, 0]}
          tube={0.12}
          color="#a6b6b7"
        />
        <Ring
          radius={0.59}
          position={[0, 0, 0.02]}
          rotation={[0, 0, 0]}
          tube={0.06}
          color="#465f6b"
        />
        <mesh position={[0, 0, -0.04]}>
          <circleGeometry args={[0.58, 48]} />
          <meshStandardMaterial color="#1b3441" />
        </mesh>
        <Box
          position={[0.52, 0, 0.15]}
          size={[0.12, 0.4, 0.07]}
          color="#d6b775"
        />
      </group>
      <Console props={props} display={display} />
      {[-1, 1].flatMap((side) =>
        [0, 1, 2].map((i) => (
          <group
            key={`${side}-${i}`}
            position={[side * 1.84, -0.2, -0.95 + i * 1.12]}
            rotation={[0, (-side * Math.PI) / 2, 0]}
          >
            <Box size={[0.92, 1.85, 0.48]} color="#c0c5b8" />
            {[0, 1, 2, 3].map((j) => (
              <group key={j} position={[0, -0.65 + j * 0.42, 0.26]}>
                <Box
                  size={[0.78, 0.35, 0.04]}
                  color={j % 2 ? "#637774" : "#abb6ab"}
                />
                <Box
                  position={[-0.3, 0, 0.04]}
                  size={[0.035, 0.22, 0.035]}
                  color="#d0d8cb"
                />
                <Box
                  position={[0.3, 0, 0.04]}
                  size={[0.035, 0.22, 0.035]}
                  color="#d0d8cb"
                />
                <Box
                  position={[0.05, 0.05, 0.03]}
                  size={[0.28, 0.07, 0.02]}
                  color="#173843"
                />
                <Box
                  position={[0.21, -0.07, 0.03]}
                  size={[0.025, 0.025, 0.02]}
                  color={CYAN}
                  glow="#346d70"
                />
              </group>
            ))}
          </group>
        )),
      )}
      <Surface id="crew_seats" props={props}>
        <Chair position={[-0.62, -0.65, 0.6]} props={props} />
        <Chair position={[0.62, -0.65, 0.6]} props={props} />
      </Surface>
      <Surface id="cable_run" props={props}>
        {[0, 1, 2, 3].map((i) => (
          <Tube
            key={i}
            points={[
              [-1.85, 1.1 + i * 0.05, -2.05],
              [-1.97, 1.2 + i * 0.05, -0.9],
              [-1.97, 1.2 + i * 0.05, 0.7],
              [-1.9, 0.7 + i * 0.05, 1.9],
            ]}
            radius={0.023}
            color={
              props.selectedSurface === "cable_run"
                ? AMBER
                : surfaceColor(props, "cable_run", i % 2 ? "#405e6c" : "#ba9356")
            }
          />
        ))}
      </Surface>
      {[-1.68, 1.68].map((x) => (
        <Box
          key={x}
          position={[x, 1.4, -0.7]}
          size={[0.08, 0.07, 2.7]}
          color="#dcf9f5"
          glow="#6b9e9e"
        />
      ))}
    </group>
  );
}

function Flow({ props, reduced }: { props: SceneProps; reduced: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const flow = visualFlow(props.atmosphere.flow);
  const lines = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        Array.from({ length: 30 }, (_, j): V3 => {
          const t = j / 29;
          return [
            -1.55 + i * 0.5 + Math.sin(t * Math.PI * 2 + i) * 0.13,
            -0.35 + Math.sin(t * Math.PI + i * 0.6) * 0.35,
            -1.65 + t * 3.3,
          ];
        }),
      ),
    [],
  );
  const lineGeometries = useMemo(() => lines.map((points) => new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), 50, 0.008, 4, false,
  )), [lines]);
  useEffect(() => () => lineGeometries.forEach((geometry) => geometry.dispose()), [lineGeometries]);
  useFrame(() => {
    if (!ref.current) return;
    for (let i = 0; i < 56; i++) {
      const lane = i % 7,
        t =
          phase(i / 56 + (reduced ? 0 : visualTime(props.time) * flow * 0.001));
      dummy.position.set(
        -1.55 + lane * 0.5 + Math.sin(t * Math.PI * 2 + lane) * 0.13,
        -0.35 + Math.sin(t * Math.PI + lane * 0.6) * 0.35,
        -1.65 + t * 3.3,
      );
      dummy.scale.set(0.7, 0.7, 2.2);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group visible={flow > 0}>
      {lineGeometries.map((geometry, i) => (
        <mesh key={i} geometry={geometry} raycast={ignoreRaycast}>
          <meshBasicMaterial
            color={CYAN}
            transparent
            opacity={0.23}
            depthWrite={false}
          />
        </mesh>
      ))}
      <instancedMesh ref={ref} args={[undefined, undefined, 56]} raycast={ignoreRaycast} frustumCulled={false}>
        <sphereGeometry args={[0.025, 6, 4]} />
        <meshBasicMaterial
          color="#9afff7"
          transparent
          opacity={0.85}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}

function Fire({ props, reduced }: { props: SceneProps; reduced: boolean }) {
  const state = visualState(props, reduced);
  if (!state) return null;
  const { frame, flowShape, pulse, development, orientation, surfaceOrientation, material } = state;
  const radius = 0.14 * development * pulse;
  const length = radius * (1 + flowShape * 1.8);
  // Warm nested envelopes are a visual convention, not temperature or cool-flame
  // chemistry. Footprint and orientation follow structure; no propagation is inferred.
  return (
    <group position={frame.position}>
      <group quaternion={surfaceOrientation}>
        <mesh position={[0, 0, 0.009]} scale={[...frame.footprint, 1]} raycast={ignoreRaycast}>
          <ringGeometry args={[0.8, 1, 48]} />
          <meshBasicMaterial color={material.accent} transparent opacity={0.42} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
        {Array.from({ length: material.lobes }, (_, i) => {
          const a = i / material.lobes * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * frame.footprint[0] * 0.56, Math.sin(a) * frame.footprint[1] * 0.56, 0.03]} scale={[0.033, 0.033, 0.04 * pulse]} raycast={ignoreRaycast}>
              <sphereGeometry args={[1, 8, 6]} />
              <meshBasicMaterial color={material.accent} transparent opacity={0.34} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
          );
        })}
      </group>
      <group quaternion={orientation}>
        <mesh position={[0, 0, length * 0.72]} scale={[radius, radius * 0.9, length]} raycast={ignoreRaycast}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshBasicMaterial color="#e98c45" transparent opacity={0.18} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh position={[0, 0, length * 0.55]} scale={[radius * 0.65, radius * 0.61, length * 0.72]} raycast={ignoreRaycast}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshBasicMaterial color={material.accent} transparent opacity={0.44} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, 0.045]} scale={[0.045, 0.045, 0.06]} raycast={ignoreRaycast}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial color="#ffe5bd" transparent opacity={0.8} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      <Smoke props={props} reduced={reduced} />
      <pointLight color="#efad69" intensity={0.75 * pulse} distance={1.45} decay={2} />
      <Html position={[0, -0.19, 0]} center style={{ pointerEvents: "none" }}>
        <div style={{ color: "#c7b8a5", background: "#08131ee8", border: "1px solid #aa815043", padding: "4px 6px", borderRadius: 3, font: "9px monospace", whiteSpace: "nowrap" }}>
          CENÁRIO ILUSTRATIVO · NÃO PREDITIVO
        </div>
      </Html>
    </group>
  );
}

function Smoke({ props, reduced }: { props: SceneProps; reduced: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const local = useMemo(() => new THREE.Vector3(), []);
  const state = visualState(props, reduced);
  useFrame(() => {
    if (!ref.current || !state) return;
    const normal = new THREE.Vector3(...state.frame.normal);
    for (let i = 0; i < 18; i++) {
      // Schematic diffusion + forced transport, no invented buoyant/upward drift.
      // Time, not frame delta or randomness, determines every puff and its reset.
      const t = phase(i / 18 + (reduced ? 0 : state.time * 0.045));
      const a = i * 2.39996;
      const r = (0.04 + t * 0.18) * Math.sin(Math.PI * t);
      local.set(Math.cos(a) * r, Math.sin(a) * r, 0.1 + t * 0.16)
        .applyQuaternion(state.surfaceOrientation);
      local.z += t * state.flowShape * 0.9;
      // Clip only to approximate display bounds; this is NOT a wall/transport solver.
      local.x = THREE.MathUtils.clamp(local.x, -2.35 - state.frame.position[0], 2.35 - state.frame.position[0]);
      local.y = THREE.MathUtils.clamp(local.y, -1.24 - state.frame.position[1], 1.62 - state.frame.position[1]);
      dummy.position.copy(local).addScaledVector(normal, 0.025);
      const size = (0.065 + t * 0.16) * Math.sin(Math.PI * t);
      dummy.scale.set(size, size * 0.82, size * (1 + state.flowShape));
      dummy.rotation.set(a * 0.3, a, 0);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 18]} raycast={ignoreRaycast} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 8]} />
      <meshBasicMaterial color="#a3aaae" transparent opacity={0.055} depthWrite={false} />
    </instancedMesh>
  );
}

function Thermal({ props }: { props: SceneProps }) {
  if (!props.ignitionSurface || props.runId <= 0) return null;
  const state = visualState(props, true);
  if (!state) return null;
  // "Thermal" is a legacy overlay ID. These surface-local contours show only an
  // artistic influence region, NOT numerical temperatures, isotherms or spread.
  return (
    <group position={state.frame.position} quaternion={state.surfaceOrientation}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0, 0, 0.012 + i * 0.002]} scale={[state.frame.footprint[0] * (1.25 + i * 0.34) * state.development, state.frame.footprint[1] * (1.25 + i * 0.34) * state.development, 1]} raycast={ignoreRaycast}>
          <ringGeometry args={[0.975, 1, 64]} />
          <meshBasicMaterial color={i % 2 ? "#ba9cae" : state.material.accent} side={THREE.DoubleSide} transparent opacity={0.5 - i * 0.09} depthWrite={false} />
        </mesh>
      ))}
      <Html position={[0, -state.frame.footprint[1] * 2.3, 0.02]} center style={{ pointerEvents: "none" }}>
        <div style={{ color: "#c6b9c9", background: "#08131ee8", padding: "4px 6px", borderRadius: 3, font: "9px monospace", whiteSpace: "nowrap" }}>CONTORNOS ILUSTRATIVOS · SEM ESCALA TÉRMICA</div>
      </Html>
    </group>
  );
}

function CameraRig({
  reset,
  vehicle,
  reduced,
}: {
  reset: number;
  vehicle: string;
  reduced: boolean;
}) {
  const { camera, size } = useThree();
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  useEffect(() => {
    camera.position.set(7.4, 5.3, 8.6);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = Math.min(
        size.width / (vehicle === "iss" ? 7.7 : 7.2),
        size.height / 6.35,
      );
      camera.updateProjectionMatrix();
    }
    camera.lookAt(0, -0.05, 0);
    controls.current?.target.set(0, -0.05, 0);
    controls.current?.update();
  }, [camera, reset, vehicle, size.width, size.height]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping={!reduced}
      dampingFactor={0.08}
      minZoom={35}
      maxZoom={230}
      minPolarAngle={0.18}
      maxPolarAngle={Math.PI / 2.08}
      minAzimuthAngle={-Math.PI * 0.72}
      maxAzimuthAngle={Math.PI * 0.72}
      target={[0, -0.05, 0]}
    />
  );
}

function World(props: SceneProps) {
  const reduced = useReducedMotion();
  const { gl, invalidate } = useThree();
  // Demand mode still renders every scrub/condition edit. Never start a local
  // requestAnimationFrame loop: the parent owns playback time and pause state.
  useEffect(() => {
    invalidate();
  }, [invalidate, props.time, props.atmosphere, props.materialAssignments, props.overlay, props.runId, props.ignitionSurface, props.selectedSurface, reduced]);
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, props.vehicle, props.cutaway]);
  const textures = useMemo(
    () => ({
      quilt: makeTexture("quilt"),
      display: makeTexture("display"),
      label: makeTexture("label"),
    }),
    [],
  );
  useEffect(
    () => () => Object.values(textures).forEach((t) => t.dispose()),
    [textures],
  );
  const selectedFrame = surfaceFrame(props.vehicle, props.selectedSurface);
  // The cabin is static during playback; time changes only touch overlay effects.
  const cabin = useMemo(
    () =>
      props.vehicle === "orion" ? (
        <Capsule props={props} {...textures} />
      ) : (
        <Station props={props} {...textures} />
      ),
    [
      props.vehicle,
      props.cutaway,
      props.selectedSurface,
      props.materialAssignments,
      props.onSelectSurface,
      textures,
    ],
  );
  return (
    <>
      <color attach="background" args={["#08131e"]} />
      <ambientLight intensity={0.7} color="#b2cbd7" />
      <hemisphereLight args={["#d4e7e9", "#182838", 1.8]} />
      <directionalLight
        position={[3, 7, 5]}
        intensity={3.1}
        color="#fff0d5"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-normalBias={0.035}
      />
      <directionalLight
        position={[-5, 3, -4]}
        intensity={2.4}
        color="#85bfd8"
      />
      <pointLight
        position={[0, 1, -1]}
        intensity={5}
        color="#b4f4ed"
        distance={5}
        decay={2}
      />
      <pointLight
        position={[2, -0.8, 1]}
        intensity={3}
        color="#ffc375"
        distance={4}
        decay={2}
      />
      <group position={[0, -0.1, 0]}>
        {cabin}
        {props.overlay === "airflow" && (
          <Flow props={props} reduced={reduced} />
        )}
        {props.overlay === "thermal" && <Thermal props={props} />}
        {props.runId > 0 && props.ignitionSurface && (
          <Fire props={props} reduced={reduced} />
        )}
        {selectedFrame && (
          <group position={selectedFrame.position}>
            <mesh raycast={ignoreRaycast}>
              <sphereGeometry args={[0.048, 12, 8]} />
              <meshBasicMaterial
                color={AMBER}
                toneMapped={false}
                depthTest={false}
              />
            </mesh>
            <Html
              position={[0, 0.19, 0]}
              center
              // Orthographic distanceFactor multiplies by camera.zoom and can
              // turn this label into a canvas-sized opaque picking layer.
              wrapperClass="surface-selection-label"
              style={{ pointerEvents: "none" }}
            >
              <div
                style={{
                  color: "#ffcf91",
                  font: "600 10px monospace",
                  letterSpacing: "1.3px",
                  whiteSpace: "nowrap",
                  background: "#0a1724df",
                  border: "1px solid #c38b4860",
                  borderRadius: 3,
                  padding: "6px 9px",
                }}
              >
                {names[props.selectedSurface]} · {props.materialAssignments[props.selectedSurface] || "NÃO ATRIBUÍDO"}
                <span style={{ display: "block", marginTop: 4, color: "#a3b2bc", fontSize: 8, letterSpacing: "0.7px" }}>MATERIAL HIPOTÉTICO</span>
              </div>
            </Html>
          </group>
        )}
      </group>
      <mesh
        position={[0, -1.61, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[200, 200]} />
        <shadowMaterial opacity={0.27} />
      </mesh>
      <Ring
        radius={3.15}
        position={[0, -1.6, 0]}
        tube={0.008}
        color="#203846"
      />
      <Ring
        radius={3.45}
        position={[0, -1.6, 0]}
        tube={0.004}
        color="#172d3b"
      />
      <CameraRig
        reset={props.resetCameraKey}
        vehicle={props.vehicle}
        reduced={reduced}
      />
    </>
  );
}

function Fallback() {
  return (
    <div
      role="status"
      style={{
        display: "grid",
        placeContent: "center",
        height: "100%",
        minHeight: 300,
        background: "#08131e",
        color: "#cedadf",
        padding: 32,
        textAlign: "center",
        fontFamily: "system-ui",
      }}
    >
      <strong>Visualização 3D indisponível</strong>
      <p
        style={{
          maxWidth: 320,
          fontSize: 13,
          lineHeight: 1.7,
          color: "#8fa5b4",
        }}
      >
        Ative a aceleração gráfica ou tente outro navegador. Os materiais e os
        dados de pesquisa continuam disponíveis.
      </p>
    </div>
  );
}
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}
export default function CabinScene(props: SceneProps) {
  const reduced = useReducedMotion();
  return (
    <SceneBoundary>
      <Canvas
        frameloop={props.playing && !reduced ? "always" : "demand"}
        orthographic
        shadows={{
          type: THREE.PCFShadowMap,
          autoUpdate: false,
          needsUpdate: true,
        }}
        dpr={[1, 1.5]}
        camera={{ position: [7.4, 5.3, 8.6], zoom: 75, near: 0.1, far: 100 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        fallback={<Fallback />}
        style={{ width: "100%", height: "100%", touchAction: "none" }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <World {...props} />
      </Canvas>
    </SceneBoundary>
  );
}
