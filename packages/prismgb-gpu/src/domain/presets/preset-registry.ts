import type { IPreset } from './preset.interface';

export type PresetMetadata = {
  isDefault?: boolean;
  visibleInUI?: boolean;
};

export type PresetRecord = {
  preset: IPreset;
  isDefault?: boolean;
  visibleInUI?: boolean;
};

export type PresetRegistration = IPreset | PresetRecord;

type PresetRecordInput = PresetRecord;

class PresetRegistryImpl {
  private readonly presets = new Map<string, IPreset>();
  private readonly uiVisibility = new Map<string, boolean>();
  private defaultPresetId = 'true-color';

  register(preset: IPreset): void {
    this.presets.set(preset.id, Object.freeze(preset));
    if (!this.uiVisibility.has(preset.id)) {
      this.uiVisibility.set(preset.id, true);
    }
  }

  private setFromRegistration(registration: PresetRecordInput): void {
    this.register(registration.preset);

    if (registration.visibleInUI !== undefined) {
      this.uiVisibility.set(registration.preset.id, registration.visibleInUI);
    }

    if (registration.isDefault) {
      this.defaultPresetId = registration.preset.id;
    }
  }

  registerMany(presets: readonly PresetRegistration[]): void {
    for (const preset of presets) {
      this.setFromRegistration(this.toPresetRecord(preset));
    }
  }

  private toPresetRecord(preset: PresetRegistration): PresetRecordInput {
    if ('preset' in preset) {
      return preset;
    }

    return { preset };
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
    return this.getAll()
      .filter(preset => this.uiVisibility.get(preset.id) !== false)
      .map(preset => ({
        id: preset.id,
        name: preset.name,
        description: preset.description
      }));
  }
}

export const PresetRegistry = new PresetRegistryImpl();
