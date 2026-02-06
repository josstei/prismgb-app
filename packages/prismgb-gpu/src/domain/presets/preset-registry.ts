import type { IPreset } from './preset.interface';

class PresetRegistryImpl {
  private readonly presets = new Map<string, IPreset>();
  private defaultPresetId = 'true-color';

  register(preset: IPreset): void {
    this.presets.set(preset.id, Object.freeze(preset));
  }

  get(id: string): IPreset | undefined {
    return this.presets.get(id);
  }

  getDefault(): IPreset {
    const preset = this.presets.get(this.defaultPresetId);
    if (!preset) {
      throw new Error(`Default preset '${this.defaultPresetId}' not found`);
    }
    return preset;
  }

  setDefault(id: string): void {
    if (!this.presets.has(id)) {
      throw new Error(`Preset '${id}' not found`);
    }
    this.defaultPresetId = id;
  }

  getAll(): IPreset[] {
    return Array.from(this.presets.values());
  }

  getForUI(): Array<{ id: string; name: string; description: string }> {
    return this.getAll().map(p => ({ id: p.id, name: p.name, description: p.description }));
  }
}

export const PresetRegistry = new PresetRegistryImpl();
