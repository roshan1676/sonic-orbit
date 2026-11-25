export const VERSION: '0.1.0-alpha.1';
export type Vector3 = [number, number, number] | { x: number; y: number; z: number } | Float32Array | Float64Array;
export interface Quaternion { x: number; y: number; z: number; w: number }
export type HrtfProfile = 'browser' | 'H3' | 'H17';
export interface SoundSettings {
  mode: 'original' | 'enhanced'; output: 'headphones' | 'speakers'; preset: 'neutral' | 'cinema' | 'dialogue' | 'music' | 'night' | 'custom';
  bass: number; warmth: number; clarity: number; treble: number; tightness: number; focus: number; anchor: number; dynamics: number; width: number; room: number; space: number; height: number; volume: number;
}
export interface DistanceModel { referenceDistance?: number; rolloff?: number }
export interface SpatialSource {
  readonly id: string; readonly input: GainNode; readonly position: [number, number, number];
  setPosition(position: Vector3): SpatialSource;
  setLevel(decibels: number): SpatialSource;
  setDistanceModel(model: DistanceModel): SpatialSource;
  dispose(): void;
}
export interface SpatialAudioOptions {
  context?: BaseAudioContext;
  /** Defaults to context.destination. null allows the host to connect sdk.output. */
  destination?: AudioNode | null;
  /** URL of the asset folder, not of this entry module. Defaults to its parent. */
  assetBaseUrl?: string | URL;
  guard?: boolean; maxSources?: number;
  settings?: Partial<SoundSettings>;
  onMeter?: (meter: { peak: number; gain: number }) => void;
}
export interface SpatialAudio {
  readonly version: string; readonly context: BaseAudioContext; readonly input: GainNode; readonly output: AnalyserNode; readonly analyser: AnalyserNode;
  readonly sourceCount: number; readonly listenerPosition: [number, number, number]; readonly settings: SoundSettings; readonly dynamicsReduction: number;
  resume(): Promise<void>;
  addSource(options: { id: string; node?: AudioNode; position?: Vector3; level?: number } & DistanceModel): SpatialSource;
  removeSource(id: string): boolean;
  setListenerPose(pose?: { position?: Vector3; orientation?: Quaternion }, immediate?: boolean): void;
  setHeadOrientation(quaternion: Quaternion, immediate?: boolean): boolean;
  /** Euler angles are radians. Positive yaw looks right. */
  setHeadPose(yaw?: number, pitch?: number, immediate?: boolean, roll?: number): boolean;
  attachMediaElement(element: HTMLMediaElement): { node: MediaElementAudioSourceNode; detach(): void };
  update(settings: Partial<SoundSettings>, immediate?: boolean): SoundSettings;
  setHrtfProfile(profile: HrtfProfile): Promise<void>;
  setSceneOptions(options?: { turnAway?: number; theatre?: number }): void;
  /** Releases nodes; closes only an AudioContext created by this factory. */
  dispose(): Promise<void>;
}
export function createSpatialAudio(options?: SpatialAudioOptions): Promise<SpatialAudio>;
