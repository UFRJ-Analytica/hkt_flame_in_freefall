import * as THREE from "three";
import type { SceneProps, VehicleId } from "../../types";

export type V3 = [number, number, number];
export type SurfaceId = "console_main" | "crew_seats" | "wall_panels" | "cable_run" | "floor";
export interface SurfaceFrame {
  position: V3;
  normal: V3;
  footprint: [number, number];
}
const tuple = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];
const rotated = (v: V3, rotation: V3) => new THREE.Vector3(...v).applyEuler(new THREE.Euler(...rotation));

/** Representative points on the actual selectable meshes, in cabin-local space.
 * Shared by selection, ignition and overlays; never reuse Orion anchors in ISS.
 * These are approximate template geometry, not as-built spacecraft coordinates.
 */
export function surfaceFrame(vehicle: VehicleId, id: string | null): SurfaceFrame | null {
  switch (id) {
    case "console_main": {
      const p = rotated([0.39, 0.31, 0.125], [-0.23, 0, 0]).add(new THREE.Vector3(0, 0.23, -1.27));
      return { position: tuple(p), normal: tuple(rotated([0, 0, 1], [-0.23, 0, 0])), footprint: [0.32, 0.18] };
    }
    case "crew_seats": {
      const p = rotated([0, -0.017, 0.1], [-0.1, 0, 0]).add(new THREE.Vector3(vehicle === "iss" ? 0.62 : 0.65, -0.65, vehicle === "iss" ? 0.6 : 0.88));
      return { position: tuple(p), normal: tuple(rotated([0, 1, 0], [-0.1, 0, 0])), footprint: [0.24, 0.22] };
    }
    case "wall_panels": {
      if (vehicle === "iss") return { position: [-0.8, 0.65, -2.18], normal: [0, 0, 1], footprint: [0.27, 0.34] };
      const angle = 19 * Math.PI / 16, y = 0.73, r = 2.4 - (y + 1.1) * 0.42;
      const p = rotated([0, 0, -0.075], [-0.39, 0, 0]).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
        .add(new THREE.Vector3(Math.sin(angle) * r, y, Math.cos(angle) * r));
      const n = rotated([0, 0, -1], [-0.39, 0, 0]).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      return { position: tuple(p), normal: tuple(n), footprint: [0.28, 0.29] };
    }
    case "cable_run":
      return vehicle === "iss"
        ? { position: [-1.942, 1.2, 0.7], normal: [1, 0, 0], footprint: [0.06, 0.28] }
        : { position: [1.4, -0.6, -1.572], normal: [0, 0, 1], footprint: [0.29, 0.055] };
    case "floor":
      return { position: [0.18, -1.263, 1.25], normal: [0, 1, 0], footprint: [0.34, 0.27] };
    default: return null;
  }
}

export const visualTime = (time: number) => Number.isFinite(time) ? Math.max(0, time) : 0;
export const visualFlow = (flow: number) => Number.isFinite(flow) ? Math.max(0, flow) : 0;
export const phase = (value: number) => ((value % 1) + 1) % 1;

// ART DIRECTION ONLY. The NASA Researcher's Guide in TECHNICAL_FOUNDATIONS.md
// Part E (Solid-Fuel Combustion/Material Flammability; Low-Stretch Flames;
// Spacecraft Fire Safety) motivates showing geometry and transport distinctly.
// It does NOT validate these constants, shape rules, transport paths or rates.
// Flow is stored in cm/s, but this bounded display mapping is NOT an HRR,
// spread-rate, fluid-dynamics or calibrated scene-distance conversion.
// Zero forced flow is not extinction: diffusion is not switched off. No MOC,
// Nomex safety exemption, oxygen threshold, alarm or suppression model exists.
// Material assignments are user hypotheses; hue/contour are identity, not risk.
export function visualState(props: SceneProps, reduced: boolean) {
  const frame = surfaceFrame(props.vehicle, props.ignitionSurface);
  if (!frame) return null;
  const time = visualTime(props.time), flow = visualFlow(props.atmosphere.flow);
  const flowShape = flow / (flow + 18);
  const identity: Record<string, { accent: string; lobes: number; phase: number }> = {
    PMMA: { accent: "#ffca8a", lobes: 5, phase: 0.1 },
    Nomex: { accent: "#edbd8d", lobes: 7, phase: 0.4 },
    SIBAL: { accent: "#f7bca2", lobes: 6, phase: 0.7 },
    Kapton: { accent: "#efb06b", lobes: 4, phase: 0.2 },
    Alumínio: { accent: "#dfc8a7", lobes: 8, phase: 0.5 },
  };
  const material = identity[props.materialAssignments[props.ignitionSurface!]] ?? { accent: "#f8c79a", lobes: 6, phase: 0 };
  const direction = new THREE.Vector3(...frame.normal).multiplyScalar(1 - flowShape * 0.65)
    .add(new THREE.Vector3(0, 0, flowShape * 0.9)).normalize();
  return {
    frame, time, flow, flowShape, material,
    // No second clock: visiting the same time and inputs yields the same pose.
    pulse: reduced ? 1 : 1 + Math.sin(time * 2.4 + material.phase) * 0.035,
    development: 0.85 + 0.15 * (1 - Math.exp(-time / 18)),
    orientation: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction),
    surfaceOrientation: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...frame.normal)),
  };
}
