/**
 * NotesSearchComponent Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NotesSearchComponent } from '@renderer/presentation/features/notes/components/notes-search.component.js';

describe('NotesSearchComponent', () => {
  let component;
  let mockLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    component = new NotesSearchComponent({ logger: mockLogger });
  });

  afterEach(() => {
    component.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create component with default state', () => {
      expect(component.currentQuery).toBe('');
      expect(component.searchInput).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should set up search when input element is provided', () => {
      const searchInput = document.createElement('input');
      const onSearch = vi.fn();

      component.initialize({ searchInput, onSearch });

      expect(component.searchInput).toBe(searchInput);
    });

    it('should warn when search input element is not found', () => {
      component.initialize({ searchInput: null, onSearch: vi.fn() });

      expect(mockLogger.warn).toHaveBeenCalledWith('Search input element not found');
    });

    it('should handle logger being undefined when input is missing', () => {
      const comp = new NotesSearchComponent({ logger: undefined });
      expect(() => comp.initialize({ searchInput: null, onSearch: vi.fn() })).not.toThrow();
      comp.dispose();
    });
  });

  describe('getQuery', () => {
    it('should return input value when search input exists', () => {
      const searchInput = document.createElement('input');
      searchInput.value = 'test query';
      component.initialize({ searchInput, onSearch: vi.fn() });

      expect(component.getQuery()).toBe('test query');
    });

    it('should return empty string when search input is null', () => {
      expect(component.getQuery()).toBe('');
    });
  });

  describe('focus', () => {
    it('should focus search input with preventScroll', () => {
      const searchInput = document.createElement('input');
      const focusSpy = vi.spyOn(searchInput, 'focus');
      component.initialize({ searchInput, onSearch: vi.fn() });

      component.focus();

      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    });

    it('should not throw when search input is null', () => {
      expect(() => component.focus()).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should clear input value and current query', () => {
      const searchInput = document.createElement('input');
      searchInput.value = 'test';
      component.initialize({ searchInput, onSearch: vi.fn() });
      component.currentQuery = 'test';

      component.clear();

      expect(searchInput.value).toBe('');
      expect(component.currentQuery).toBe('');
    });

    it('should clear current query when search input is null', () => {
      component.currentQuery = 'test';

      component.clear();

      expect(component.currentQuery).toBe('');
    });
  });

  describe('search debouncing', () => {
    it('should call onSearch after debounce delay', () => {
      const searchInput = document.createElement('input');
      const onSearch = vi.fn();
      component.initialize({ searchInput, onSearch });

      searchInput.value = 'hello';
      searchInput.dispatchEvent(new Event('input'));

      expect(onSearch).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200);

      expect(onSearch).toHaveBeenCalledWith('hello');
    });

    it('should debounce multiple rapid inputs', () => {
      const searchInput = document.createElement('input');
      const onSearch = vi.fn();
      component.initialize({ searchInput, onSearch });

      searchInput.value = 'h';
      searchInput.dispatchEvent(new Event('input'));

      vi.advanceTimersByTime(100);

      searchInput.value = 'he';
      searchInput.dispatchEvent(new Event('input'));

      vi.advanceTimersByTime(100);

      searchInput.value = 'hel';
      searchInput.dispatchEvent(new Event('input'));

      vi.advanceTimersByTime(200);

      expect(onSearch).toHaveBeenCalledTimes(1);
      expect(onSearch).toHaveBeenCalledWith('hel');
    });

    it('should update currentQuery on search', () => {
      const searchInput = document.createElement('input');
      const onSearch = vi.fn();
      component.initialize({ searchInput, onSearch });

      searchInput.value = 'test';
      searchInput.dispatchEvent(new Event('input'));
      vi.advanceTimersByTime(200);

      expect(component.currentQuery).toBe('test');
    });

    it('should handle missing onSearch callback', () => {
      const searchInput = document.createElement('input');
      component.initialize({ searchInput, onSearch: null });

      searchInput.value = 'test';
      searchInput.dispatchEvent(new Event('input'));

      expect(() => vi.advanceTimersByTime(200)).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('should prevent pending debounce callback after dispose', () => {
      const searchInput = document.createElement('input');
      const onSearch = vi.fn();
      component.initialize({ searchInput, onSearch });

      searchInput.value = 'test';
      searchInput.dispatchEvent(new Event('input'));

      component.dispose();
      vi.advanceTimersByTime(200);

      expect(onSearch).not.toHaveBeenCalled();
    });

    it('should handle dispose when no timeout is active', () => {
      const searchInput = document.createElement('input');
      component.initialize({ searchInput, onSearch: vi.fn() });

      expect(() => component.dispose()).not.toThrow();
    });

    it('should clear all references', () => {
      const searchInput = document.createElement('input');
      component.initialize({ searchInput, onSearch: vi.fn() });

      component.dispose();

      expect(component.searchInput).toBeNull();
      expect(component.onSearch).toBeNull();
      expect(component.logger).toBeNull();
      expect(component.currentQuery).toBe('');
    });
  });
});
