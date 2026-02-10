import type { IPreset } from '../domain/presets';
import type { PipelineUniforms } from '../domain/shaders';
import { buildUniforms } from './uniform-builder';

export class UniformContext {
  private _preset: IPreset;
  private _nativeWidth: number;
  private _nativeHeight: number;
  private _outputWidth: number;
  private _outputHeight: number;
  private _brightness: number;

  private _cachedUniforms: PipelineUniforms | null;
  private _dirty: boolean;

  constructor(config: {
    preset: IPreset;
    nativeWidth: number;
    nativeHeight: number;
    outputWidth: number;
    outputHeight: number;
    brightness?: number;
  }) {
    this._preset = config.preset;
    this._nativeWidth = config.nativeWidth;
    this._nativeHeight = config.nativeHeight;
    this._outputWidth = config.outputWidth;
    this._outputHeight = config.outputHeight;
    this._brightness = config.brightness ?? 1.0;
    this._cachedUniforms = null;
    this._dirty = true;
  }

  get uniforms(): PipelineUniforms {
    if (this._dirty || !this._cachedUniforms) {
      this._cachedUniforms = buildUniforms({
        preset: this._preset,
        nativeWidth: this._nativeWidth,
        nativeHeight: this._nativeHeight,
        outputWidth: this._outputWidth,
        outputHeight: this._outputHeight,
        brightness: this._brightness
      });
      this._dirty = false;
    }
    return this._cachedUniforms;
  }

  setPreset(preset: IPreset): void {
    this._preset = preset;
    this._dirty = true;
  }

  setBrightness(value: number): void {
    this._brightness = Math.max(0, Math.min(2, value));
    this._dirty = true;
  }

  setOutputSize(width: number, height: number): void {
    this._outputWidth = width;
    this._outputHeight = height;
    this._dirty = true;
  }

  get preset(): IPreset {
    return this._preset;
  }

  get brightness(): number {
    return this._brightness;
  }

  get outputWidth(): number {
    return this._outputWidth;
  }

  get outputHeight(): number {
    return this._outputHeight;
  }

  get isDirty(): boolean {
    return this._dirty;
  }

  invalidate(): void {
    this._dirty = true;
  }
}
