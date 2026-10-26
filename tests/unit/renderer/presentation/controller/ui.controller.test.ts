import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UIController } from '@renderer/presentation/controller/ui.controller.js';
import { createDomBindings } from '@renderer/presentation/primitives/dom-bindings.utils.js';
import { createLoggerFactory } from '../../../../factories/logger.factory.js';
import {
  createDeviceStatusComponentMock, createStreamControlsComponentMock, createSettingsMenuComponentMock,
  createShaderSelectorComponentMock, createUiComponentHostMock, createUIEffectsMock
} from '../../../../factories/ui.factory.js';

describe('UIController', () => {
  let controller: UIController;
  let download;
  let host;
  let effects;
  let components;
  let loggerFactory;
  let dom;

  beforeEach(() => {
    // These are the elements consumed by this controller. The complete rendered
    // template/ref contract is exercised in template-contract.test.ts.
    document.body.innerHTML = [
      '<div id="statusIndicator" data-ref="statusIndicator"></div>',
      '<span id="statusText" data-ref="statusText"></span>',
      '<video id="streamVideo" data-ref="streamVideo"></video>',
      '<button id="screenshotBtn" data-ref="screenshotBtn"></button>',
      '<button id="recordBtn" data-ref="recordBtn"></button>',
      '<button id="fullscreenBtn" data-ref="fullscreenBtn"></button>',
      '<div id="streamToolbar" data-ref="streamToolbar"></div>',
      '<div id="fullscreenControls" data-ref="fullscreenControls"></div>'
    ].join('');
    dom = createDomBindings(document);
    download = vi.fn().mockResolvedValue(undefined);
    components = {
      deviceStatusComponent: createDeviceStatusComponentMock(),
      streamControlsComponent: createStreamControlsComponentMock(),
      settingsMenuComponent: createSettingsMenuComponentMock(),
      shaderSelectorComponent: createShaderSelectorComponentMock()
    };
    host = createUiComponentHostMock(components);
    effects = createUIEffectsMock();
    loggerFactory = createLoggerFactory();
    controller = new UIController({
      downloadFile: download, uiComponentHost: host, domBindings: dom,
      uiEffects: effects, loggerFactory
    });
  });

  afterEach(() => { document.body.innerHTML = ''; });

  it('binds available elements and resolves core, deferred and runtime components through the host', () => {
    expect(controller.initializeElements()).toBe(dom.flat);
    for (const id of ['statusIndicator', 'statusText', 'streamVideo', 'screenshotBtn', 'recordBtn'] as const) {
      expect(controller.elements[id]).toBe(document.getElementById(id));
    }
    expect(loggerFactory.create).toHaveBeenCalledWith('UIController');
    controller.initializeComponents();
    controller.initializeDeferredComponents();
    controller.toggleSettingsMenu();
    expect(host.touchCore).toHaveBeenCalledOnce();
    expect(host.touchDeferred).toHaveBeenCalledOnce();
    expect(components.settingsMenuComponent.toggle).toHaveBeenCalledOnce();
    expect(controller.deviceStatus).toBe(components.deviceStatusComponent);
  });

  it('coordinates streaming controls, cursor/toolbar visibility and shader closing across start/stop', () => {
    controller.setStreamingMode(true);
    expect(components.streamControlsComponent.setStreamingMode).toHaveBeenCalledWith(true);
    expect(effects.enableCursorAutoHide).toHaveBeenCalledOnce();
    expect(effects.enableToolbarAutoHide).toHaveBeenCalledWith(controller.elements.streamToolbar);

    controller.setStreamingMode(false);
    expect(components.streamControlsComponent.setStreamingMode).toHaveBeenLastCalledWith(false);
    expect(effects.disableCursorAutoHide).toHaveBeenCalledOnce();
    expect(effects.disableToolbarAutoHide).toHaveBeenCalledOnce();
    expect(components.shaderSelectorComponent.hide).toHaveBeenCalledOnce();
  });

  it('updates fullscreen labels and routes fullscreen control activity', () => {
    controller.updateFullscreenButton(true);
    expect(controller.elements.fullscreenBtn!.title).toBe('Exit Fullscreen');
    controller.updateFullscreenButton(false);
    expect(controller.elements.fullscreenBtn!.title).toBe('Fullscreen');
    controller.enableControlsAutoHide();
    expect(effects.enableControlsAutoHide).toHaveBeenCalledWith(controller.elements.fullscreenControls);
    controller.disableControlsAutoHide();
    expect(effects.disableControlsAutoHide).toHaveBeenCalledOnce();
  });

  it('routes shutter, button and active/inactive recording feedback to effects', () => {
    controller.triggerShutterFlash();
    controller.triggerRecordButtonPop();
    controller.triggerRecordButtonPress();
    controller.triggerButtonFeedback('screenshotBtn', 'capturing', 200);
    expect(effects.triggerShutterFlash).toHaveBeenCalledOnce();
    expect(effects.triggerRecordButtonPop).toHaveBeenCalledOnce();
    expect(effects.triggerRecordButtonPress).toHaveBeenCalledOnce();
    expect(effects.triggerButtonFeedback).toHaveBeenCalledWith('screenshotBtn', 'capturing', 200);
    controller.updateRecordingButtonState(true);
    controller.updateRecordingButtonState(false);
    expect(effects.setRecordingButtonState.mock.calls).toEqual([
      [controller.elements.recordBtn, true], [controller.elements.recordBtn, false]
    ]);
  });

  it('tolerates a missing recording button or optional effects', () => {
    controller.elements.recordBtn = null;
    expect(() => controller.updateRecordingButtonState(true)).not.toThrow();
    expect(effects.setRecordingButtonState).not.toHaveBeenCalled();
    controller.elements.recordBtn = document.createElement('button');
    controller.effects = undefined;
    expect(() => controller.updateRecordingButtonState(true)).not.toThrow();
  });

  it('awaits screenshot download registration before releasing effects and component ownership', async () => {
    const registered = Promise.withResolvers<void>();
    download.mockReturnValueOnce(registered.promise);
    const blob = new Blob(['screenshot']);
    const saving = controller.triggerDownload(blob, 'screenshot.png');
    const disposal = controller.dispose();
    expect(download).toHaveBeenCalledWith(blob, 'screenshot.png');
    expect(host.dispose).not.toHaveBeenCalled();
    expect(effects.dispose).not.toHaveBeenCalled();
    registered.resolve();
    await Promise.all([saving, disposal]);
    expect(effects.dispose).toHaveBeenCalledOnce();
    expect(host.dispose).toHaveBeenCalledOnce();
  });

  it('releases components after effect cleanup fails and reports the failure', async () => {
    effects.dispose.mockRejectedValue(new Error('effect cleanup failed'));
    await expect(controller.dispose()).rejects.toThrow('Runtime disposal failed');
    expect(host.dispose).toHaveBeenCalledOnce();
    expect(controller.host).toBeNull();
    expect(controller.effects).toBeNull();
  });
});
