interface MediaProfile {
  audio?: Record<string, unknown>;
  video?: Record<string, unknown>;
}

interface DeviceConstraint {
  exact: string;
}

interface AudioDeviceConstraint {
  exact?: string;
  groupId?: string;
}

export interface AcquisitionContextLike {
  readonly deviceId: string;
  readonly groupId: string | null;
  readonly profile: MediaProfile;
  getDeviceConstraint(): DeviceConstraint;
  getAudioDeviceConstraint(): AudioDeviceConstraint;
  hasAudioProfile(): boolean;
  hasVideoProfile(): boolean;
}

export interface AcquisitionOptions {
  audio?: boolean;
  video?: boolean;
  audioDeviceId?: string;
  [key: string]: unknown;
}
