/**
 * SettingsService Unit Tests
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
vi.mock('@renderer/infrastructure/ipc/trpc-client', async () => {
  const { createTrpcClientMock } = await import('../../../../support/mocks/trpc-client.mock');
  return { trpcClient: createTrpcClientMock() };
});
import { SettingsDefinitions as settingsDefinitions } from '@renderer/lib/settings.definitions.js';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { EventChannels } from '@platform/events';
import { createSettingsServiceHarness } from '../../../../factories/index.js';
describe('SettingsService', () => {
  let service;
  let mockEventBus;
  let mockLogger;
  let localStorageMock;
  beforeEach(() => {
    vi.clearAllMocks();
    ({ service, eventBus: mockEventBus, logger: mockLogger, storageService: localStorageMock } = createSettingsServiceHarness());
  });
  afterEach(() => {
    localStorageMock.clear();
  });
  describe('manifest contract', () => {
    it('uses enforced definitions without compatibility mappings', () => {
      const rawSettingsDefinitions = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), 'src/renderer/lib/settings.definitions.json'),
          'utf8'
        )
      );
      const startupPreferencesFromDefinitions = settingsDefinitions.definitions
        .filter((definition) => definition.startupPreference === true)
        .map((definition) => definition.name);
      expect(settingsDefinitions.mode).toBe('enforced');
      expect(startupPreferencesFromDefinitions).toEqual([
        'gameVolume',
        'statusStripVisible',
        'performanceMode',
        'minimalistFullscreen'
      ]);
      expect(settingsDefinitions.loadAllPreferencesShape).toEqual(startupPreferencesFromDefinitions);
      expect(startupPreferencesFromDefinitions.every((name) => {
        const definition = settingsDefinitions.definitions.find((entry) => entry.name === name);
        return definition && !('externalSource' in definition);
      })).toBe(true);
      expect(rawSettingsDefinitions).not.toHaveProperty('loadAllPreferencesShape');
      expect(settingsDefinitions.definitions.some((definition) => 'legacy' in definition)).toBe(false);
      expect(settingsDefinitions.definitions.some((definition) => 'compatibilityNotes' in definition)).toBe(false);
    });
    it('derives defaults, allowed values, and listing from settings definitions', async () => {
      const manifestDefaults = Object.fromEntries(
        settingsDefinitions.definitions.map((definition) => [definition.name, definition.default])
      );
      const recordingFormat = settingsDefinitions.definitions.find(
        (definition) => definition.name === 'recordingFormat'
      );
      const serviceDefaults = Object.fromEntries(
        await Promise.all(
          settingsDefinitions.definitions.map(async (definition) => [
            definition.name,
            await service.getSetting(definition.name)
          ])
        )
      );
      expect(serviceDefaults).toEqual(manifestDefaults);
      expect(service.getAllowedValues('recordingFormat')).toEqual(recordingFormat.allowedValues);
      expect(service.listSettings()).toEqual(
        settingsDefinitions.definitions.map((definition) => definition.name)
      );
    });
  });
  describe('generic accessors', () => {
    it('reads defaults and saved values by definition name', () => {
      localStorageMock.setItem('gameVolume', '64');
      localStorageMock.setItem('minimalistFullscreen', 'true');
      expect(service.getSetting('gameVolume')).toBe(64);
      expect(service.getSetting('minimalistFullscreen')).toBe(true);
      expect(service.getSetting('recordingFormat')).toBe('webm');
      expect(service.getNumberSetting('gameVolume')).toBe(64);
      expect(service.getBooleanSetting('minimalistFullscreen')).toBe(true);
      expect(service.getStringSetting('recordingFormat')).toBe('webm');
    });
    it('fails fast for unknown settings instead of silently creating storage drift', () => {
      expect(() => service.getSetting('missingSetting')).toThrow('Unknown setting: missingSetting');
      expect(() => service.setSetting('missingSetting', true)).toThrow('Unknown setting: missingSetting');
    });
    it('clamps numeric settings and emits manifest events', () => {
      expect(service.setSetting('gameVolume', 140)).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('gameVolume', '100');
      expect(mockEventBus.publish).toHaveBeenCalledWith('settings:volume-changed', 100);
      expect(service.setSetting('globalBrightness', 0.2)).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('globalBrightness', '0.5');
      expect(mockEventBus.publish).toHaveBeenCalledWith('settings:brightness-changed', 0.5);
    });
    it('does not clamp an out-of-range numeric value read directly from storage', () => {
      localStorageMock.setItem('gameVolume', '140');
      expect(service.getSetting('gameVolume')).toBe(140);
      expect(service.getNumberSetting('gameVolume')).toBe(140);
    });
    it('stores boolean settings with manifest event behavior', () => {
      expect(service.setSetting('statusStripVisible', true)).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('statusStripVisible', 'true');
      expect(mockEventBus.publish).not.toHaveBeenCalledWith('status-strip-changed', true);
      expect(service.setSetting('performanceMode', true)).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('performanceMode', 'true');
      expect(mockEventBus.publish).toHaveBeenCalledWith('settings:performance-mode-changed', true);
    });
    it('validates enum settings', () => {
      expect(service.setSetting('recordingFormat', 'mp4')).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('recordingFormat', 'mp4');
      expect(mockEventBus.publish).toHaveBeenCalledWith('settings:recording-format-changed', 'mp4');
      expect(service.setSetting('recordingFormat', 'avi')).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Invalid recordingFormat: avi. Valid values: webm, mp4, mov');
    });
  });
  describe('loadAllPreferences', () => {
    it('loads preference shape from definition names', () => {
      localStorageMock.setItem('gameVolume', '30');
      localStorageMock.setItem('statusStripVisible', 'false');
      localStorageMock.setItem('performanceMode', 'false');
      localStorageMock.setItem('minimalistFullscreen', 'true');
      expect(service.loadAllPreferences()).toEqual({
        gameVolume: 30,
        statusStripVisible: false,
        performanceMode: false,
        minimalistFullscreen: true
      });
    });
    it('logs loaded preferences', () => {
      service.loadAllPreferences();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Loaded preferences - gameVolume: 70, statusStripVisible: false, performanceMode: false, minimalistFullscreen: false'
      );
    });
    it('fails fast when synchronous preference loading reaches an async setting', () => {
      expect(() => service._getSynchronousSetting('launchOnLogin')).toThrow(
        'Setting requires asynchronous access: launchOnLogin'
      );
    });
  });
  describe('initialize', () => {
    it('publishes the volume-changed event with the loaded value', async () => {
      localStorageMock.setItem('gameVolume', '80');

      await service.initialize();

      expect(mockEventBus.publish).toHaveBeenCalledWith('settings:volume-changed', 80);
    });
    it('publishes the performance-mode-changed event with the loaded value', async () => {
      localStorageMock.setItem('performanceMode', 'true');

      await service.initialize();

      expect(mockEventBus.publish).toHaveBeenCalledWith('settings:performance-mode-changed', true);
    });
    it('publishes PREFERENCES_LOADED with the full preferences payload', async () => {
      localStorageMock.setItem('gameVolume', '30');

      await service.initialize();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.SETTINGS.PREFERENCES_LOADED,
        expect.objectContaining({ gameVolume: 30 })
      );
    });
    it('logs success message', async () => {
      await service.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('Preferences loaded');
    });
    it('handles errors gracefully', async () => {
      const error = new Error('Load failed');
      vi.spyOn(service, 'loadAllPreferences').mockImplementation(() => {
        throw error;
      });

      await service.initialize();

      expect(mockLogger.error).toHaveBeenCalledWith('Error loading preferences:', error);
    });
  });
  describe('launchOnLogin', () => {
    it('queries the login item state through getSetting', async () => {
      vi.mocked(trpcClient.loginItem.get.query).mockResolvedValue({ enabled: true });
      const result = await service.getSetting('launchOnLogin');
      expect(result).toBe(true);
      expect(trpcClient.loginItem.get.query).toHaveBeenCalled();
      expect(localStorageMock.setItem).toHaveBeenCalledWith('launchOnLogin', 'true');
    });
    it('falls back to storage through getSetting when the login item query fails', async () => {
      localStorageMock.setItem('launchOnLogin', 'true');
      vi.mocked(trpcClient.loginItem.get.query).mockRejectedValue(new Error('ipc failure'));
      await expect(service.getSetting('launchOnLogin')).resolves.toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to query login item state from main process');
    });
    it('updates the login item state and cache through setSetting', async () => {
      vi.mocked(trpcClient.loginItem.set.mutate).mockResolvedValue(undefined);
      await expect(service.setSetting('launchOnLogin', true)).resolves.toBe(true);
      expect(trpcClient.loginItem.set.mutate).toHaveBeenCalledWith(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('launchOnLogin', 'true');
    });
    it('rejects setSetting and logs when the login item mutation throws', async () => {
      const error = new Error('main process rejected the update');
      vi.mocked(trpcClient.loginItem.set.mutate).mockRejectedValue(error);
      await expect(service.setSetting('launchOnLogin', true)).resolves.toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to set login item state in main process', error);
    });
  });
});
