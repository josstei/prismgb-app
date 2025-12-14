/**
 * StatusNotificationComponent Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StatusNotificationComponent } from '@ui/components/status-notification.js';

describe('StatusNotificationComponent', () => {
  let component;
  let mockElements;

  beforeEach(() => {
    vi.useFakeTimers();

    mockElements = {
      statusMessage: {
        textContent: '',
        dataset: {}
      }
    };

    component = new StatusNotificationComponent(mockElements);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    it('should store elements reference', () => {
      expect(component.elements).toBe(mockElements);
    });

    it('should initialize valid status types', () => {
      expect(component.validTypes).toContain('info');
      expect(component.validTypes).toContain('success');
      expect(component.validTypes).toContain('warning');
      expect(component.validTypes).toContain('error');
    });
  });

  describe('show', () => {
    it('should set message text', () => {
      component.show('Test message', 'info');
      expect(mockElements.statusMessage.textContent).toBe('Test message');
    });

    it('should set info type via data attribute', () => {
      component.show('Test', 'info');
      expect(mockElements.statusMessage.dataset.type).toBe('info');
    });

    it('should set success type via data attribute', () => {
      component.show('Test', 'success');
      expect(mockElements.statusMessage.dataset.type).toBe('success');
    });

    it('should set warning type via data attribute', () => {
      component.show('Test', 'warning');
      expect(mockElements.statusMessage.dataset.type).toBe('warning');
    });

    it('should set error type via data attribute', () => {
      component.show('Test', 'error');
      expect(mockElements.statusMessage.dataset.type).toBe('error');
    });

    it('should default to info type', () => {
      component.show('Test');
      expect(mockElements.statusMessage.dataset.type).toBe('info');
    });

    it('should use info type for unknown types', () => {
      component.show('Test', 'unknown');
      expect(mockElements.statusMessage.dataset.type).toBe('info');
    });
  });
});
