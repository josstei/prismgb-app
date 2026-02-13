/**
 * StreamingAudioOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StreamingAudioOrchestrator } from '@renderer/application/orchestrators/streaming-audio.orchestrator.ts';

describe('StreamingAudioOrchestrator', () => {
  let orchestrator;
  let mockStreamingAudioPipelineService;
  let mockStreamViewService;
  let mockAppState;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    mockStreamingAudioPipelineService = {
      start: vi.fn().mockResolvedValue(true),
      stop: vi.fn()
    };

    mockStreamViewService = {
      setMuted: vi.fn()
    };

    mockAppState = {
      isStreaming: false
    };

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn())
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    orchestrator = new StreamingAudioOrchestrator({
      streamingAudioPipelineService: mockStreamingAudioPipelineService,
      streamingCanvasService: mockStreamViewService,
      appState: mockAppState,
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onInitialize', () => {
    it('should subscribe to stream events', async () => {
      await orchestrator.onInitialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledWith('stream:started', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('stream:stopped', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('stream:error', expect.any(Function));
    });
  });

  describe('_handleStreamStarted', () => {
    it('should initialize audio pipeline with stream', () => {
      const mockStream = { getAudioTracks: vi.fn(() => [{ id: 'audio-1' }]) };

      orchestrator._handleStreamStarted({ stream: mockStream });

      expect(mockStreamingAudioPipelineService.start).toHaveBeenCalledWith(mockStream);
    });

    it('should skip re-init when same stream already attached', () => {
      const mockStream = { getAudioTracks: vi.fn(() => [{ id: 'audio-1' }]) };

      orchestrator._handleStreamStarted({ stream: mockStream });
      orchestrator._handleStreamStarted({ stream: mockStream });

      expect(mockStreamingAudioPipelineService.start).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith('Audio pipeline already attached to stream; skipping re-init');
    });

    it('should do nothing when no stream provided', () => {
      orchestrator._handleStreamStarted({});
      orchestrator._handleStreamStarted({ stream: null });

      expect(mockStreamingAudioPipelineService.start).not.toHaveBeenCalled();
    });
  });

  describe('_handleStreamStopped', () => {
    it('should stop audio pipeline', () => {
      orchestrator._handleStreamStopped();

      expect(mockStreamingAudioPipelineService.stop).toHaveBeenCalled();
    });

    it('should clear active stream', () => {
      const mockStream = { getAudioTracks: vi.fn(() => [{ id: 'audio-1' }]) };
      orchestrator._handleStreamStarted({ stream: mockStream });

      orchestrator._handleStreamStopped();

      orchestrator._handleStreamStarted({ stream: mockStream });
      expect(mockStreamingAudioPipelineService.start).toHaveBeenCalledTimes(2);
    });
  });

  describe('_initializeAudioPipeline', () => {
    it('should start audio warmup with stream', () => {
      const mockStream = { getAudioTracks: vi.fn(() => [{ id: 'audio-1' }]) };

      orchestrator._initializeAudioPipeline(mockStream);

      expect(mockStreamingAudioPipelineService.start).toHaveBeenCalledWith(mockStream);
    });

    it('should fallback to video audio when warmup fails', async () => {
      const mockStream = { getAudioTracks: vi.fn(() => [{ id: 'audio-1' }]) };
      mockStreamingAudioPipelineService.start.mockResolvedValue(false);
      mockAppState.isStreaming = true;
      orchestrator._activeStream = mockStream;

      orchestrator._initializeAudioPipeline(mockStream);
      await vi.waitFor(() => {
        expect(mockLogger.warn).toHaveBeenCalledWith('Audio warm-up failed - falling back to video element audio');
      });

      expect(mockStreamViewService.setMuted).toHaveBeenCalledWith(false);
    });

    it('should fallback to video audio when warmup throws', async () => {
      const mockStream = { getAudioTracks: vi.fn(() => [{ id: 'audio-1' }]) };
      mockStreamingAudioPipelineService.start.mockRejectedValue(new Error('Warmup error'));
      mockAppState.isStreaming = true;
      orchestrator._activeStream = mockStream;

      orchestrator._initializeAudioPipeline(mockStream);
      await vi.waitFor(() => {
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Audio warm-up error - falling back to video element audio',
          expect.any(Error)
        );
      });

      expect(mockStreamViewService.setMuted).toHaveBeenCalledWith(false);
    });

    it('should not fallback when stream has no audio', async () => {
      const mockStream = { getAudioTracks: vi.fn(() => []) };
      mockStreamingAudioPipelineService.start.mockResolvedValue(false);
      mockAppState.isStreaming = true;
      orchestrator._activeStream = mockStream;

      orchestrator._initializeAudioPipeline(mockStream);
      await vi.waitFor(() => {
        expect(mockStreamingAudioPipelineService.start).toHaveBeenCalled();
      });

      expect(mockStreamViewService.setMuted).not.toHaveBeenCalled();
    });

    it('should not fallback when no longer streaming', async () => {
      const mockStream = { getAudioTracks: vi.fn(() => [{ id: 'audio-1' }]) };
      mockStreamingAudioPipelineService.start.mockResolvedValue(false);
      mockAppState.isStreaming = false;
      orchestrator._activeStream = mockStream;

      orchestrator._initializeAudioPipeline(mockStream);
      await vi.waitFor(() => {
        expect(mockStreamingAudioPipelineService.start).toHaveBeenCalled();
      });

      expect(mockStreamViewService.setMuted).not.toHaveBeenCalled();
    });

    it('should not fallback when stream changed during warmup', async () => {
      const mockStream1 = { getAudioTracks: vi.fn(() => [{ id: 'audio-1' }]) };
      const mockStream2 = { getAudioTracks: vi.fn(() => [{ id: 'audio-2' }]) };
      mockStreamingAudioPipelineService.start.mockResolvedValue(false);
      mockAppState.isStreaming = true;
      orchestrator._activeStream = mockStream2;

      orchestrator._initializeAudioPipeline(mockStream1);
      await vi.waitFor(() => {
        expect(mockStreamingAudioPipelineService.start).toHaveBeenCalled();
      });

      expect(mockStreamViewService.setMuted).not.toHaveBeenCalled();
    });
  });

  describe('_applyVideoAudioFallback', () => {
    it('should unmute video element', () => {
      orchestrator._applyVideoAudioFallback();

      expect(mockStreamViewService.setMuted).toHaveBeenCalledWith(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Audio warm-up failed - falling back to video element audio');
    });

    it('should only apply fallback once', () => {
      orchestrator._applyVideoAudioFallback();
      orchestrator._applyVideoAudioFallback();

      expect(mockStreamViewService.setMuted).toHaveBeenCalledTimes(1);
    });
  });
});
