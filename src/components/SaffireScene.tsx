import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Grid, SaffireModel } from "../saffire";

export default function SaffireScene({
  model, grid, resetCameraKey, observedFrontMm = null,
}: {
  model: Pick<SaffireModel, "grid">;
  grid: Grid;
  resetCameraKey: number;
  /** Median front measured in the camera frames at this step; drawn as a cyan line. */
  observedFrontMm?: number | null;
}) {
  const { lengthMm, widthMm, dxMm, dyMm } = model.grid;
  const length = lengthMm / 1000;
  const width = widthMm / 1000;
  const scale = length / 0.94;
  const cameraScale = Math.hypot(length, width) / Math.hypot(0.94, 0.406);
  return (
    <Canvas camera={{ position: [0.36 * cameraScale, 0.95 * cameraScale, 1.13 * cameraScale], fov: 38 }}>
      <color attach="background" args={["#09141e"]} />
      <ambientLight intensity={1.65} />
      <directionalLight position={[0, 2, 1]} intensity={2.1} />
      <mesh position={[0, -0.014, 0]}>
        <boxGeometry args={[length + 0.035, 0.023, width + 0.035]} />
        <meshStandardMaterial color="#4d6775" />
      </mesh>
      {grid.map((cells, row) => {
        const lo = row * dyMm / 1000;
        const hi = Math.min(width, (row + 1) * dyMm / 1000);
        const z = (lo + hi - width) / 2;
        const rowWidth = hi - lo;
        const runs: { start: number; end: number; state: number | null }[] = [];
        cells.forEach((state, index) => {
          const last = runs[runs.length - 1];
          if (last && last.state === state) last.end = index + 1;
          else runs.push({ start: index, end: index + 1, state });
        });
        return (
          <group key={row} position={[0, 0, z]}>
            {runs.map(run => {
              const start = run.start * dxMm / 1000;
              const end = Math.min(length, run.end * dxMm / 1000);
              return <group key={run.start}>
                <mesh position={[(start + end - length) / 2, 0, 0]}>
                  <boxGeometry args={[end - start, 0.002, rowWidth]} />
                  <meshStandardMaterial color={run.state === null ? "#62747e" : run.state === 1 ? "#452f31" : run.state === 2 ? "#ff9f43" : "#cdc09b"}
                    emissive={run.state === 2 ? "#ff680e" : "#000000"} emissiveIntensity={0.7} />
                </mesh>
                {run.state === 1 && run.start > 0 && cells[run.start - 1] === 0 &&
                  <mesh position={[start - length / 2, 0.005, 0]}>
                    <boxGeometry args={[0.006, 0.005, rowWidth]} />
                    <meshStandardMaterial color="#ff9f43" emissive="#ff680e" emissiveIntensity={0.7} />
                  </mesh>}
                {run.state === 1 && cells[run.end] === 0 && <mesh position={[end - length / 2, 0.005, 0]}>
                  <boxGeometry args={[0.006, 0.005, rowWidth]} />
                  <meshStandardMaterial color="#ff9f43" emissive="#ff680e" emissiveIntensity={0.7} />
                </mesh>}
              </group>;
            })}
          </group>
        );
      })}
      {observedFrontMm !== null && (
        <mesh position={[observedFrontMm / 1000 - length / 2, 0.009, 0]}>
          <boxGeometry args={[0.003, 0.003, width + 0.02]} />
          <meshBasicMaterial color="#5de6e3" transparent opacity={0.9} />
        </mesh>
      )}
      <group position={[0, 0.012, width / 2 + 0.065 * scale]} rotation={[0, 0, -Math.PI / 2]} scale={scale}>
        <mesh>
          <cylinderGeometry args={[0.004, 0.004, 0.94 * 0.68, 10]} />
          <meshBasicMaterial color="#5de6e3" />
        </mesh>
        <mesh position={[0, 0.94 * 0.34 + 0.009, 0]}>
          <coneGeometry args={[0.015, 0.039, 16]} />
          <meshBasicMaterial color="#5de6e3" />
        </mesh>
      </group>
      <OrbitControls key={resetCameraKey} makeDefault maxDistance={2.8 * cameraScale} minDistance={0.37 * cameraScale} />
    </Canvas>
  );
}
