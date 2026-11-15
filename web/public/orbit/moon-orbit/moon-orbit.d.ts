export type Vec3 = readonly [number, number, number] | Float32Array | Float64Array;
export interface Directions {
  /** Moon-to-Sun and Moon-to-Earth, in MOON_ME (+X 0°E, +Y 90°E, +Z north). */
  sun: Vec3;
  earth: Vec3;
  /** Optional right-handed, column-major 3×3 rotation from geographic Earth to MOON_ME. */
  earthFixedToMoon?: ArrayLike<number>;
}
export interface View { longitude: number; latitude: number; zoom?: number; }
export type ProjectLocation = (longitude: number, latitude: number) => { x: number; y: number; visible: boolean };
export interface MoonOrbit {
  setDirections(data: Directions): void;
  setView(view: View): void;
  zoomBy(factor: number): void;
  setInteracting(active: boolean): void;
  dispose(): void;
  readonly ready: Promise<{ quality: 'full' | 'preview' | 'disposed'; error?: string }>;
  readonly rendererType: 'three-webgl2' | 'software' | 'disposed';
  readonly detailReady: boolean;
}
export function createMoonOrbit(host: HTMLElement, options?: {
  directions?: Directions;
  view?: View;
  assetBase?: string | URL;
  /** Optional existing Three.js module namespace (r180 tested). */
  three?: object;
  onError?: (error: unknown) => void;
  onFrame?: (project: ProjectLocation) => void;
  signal?: AbortSignal;
}): Promise<MoonOrbit>;
