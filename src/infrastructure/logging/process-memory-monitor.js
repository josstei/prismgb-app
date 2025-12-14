/**
 * ProcessMemoryMonitor
 *
 * Development-mode utility for monitoring Electron process memory.
 * Logs memory usage for all Chromium processes (Browser, Renderer, GPU, Utility).
 *
 * Process types captured by app.getAppMetrics():
 *   - Browser: Main Node.js process
 *   - Renderer: BrowserWindow (includes Web Workers like render.worker.js)
 *   - GPU: GPU acceleration process
 *   - Utility: Network, audio, video decode services
 *   - Zygote/Sandbox: Linux process helpers
 *
 * Note: Web Workers share Renderer memory (not separate processes)
 */

import { app } from 'electron';

/**
 * ProcessMemoryMonitor provides periodic logging of Electron process memory
 *
 * Usage:
 *   const monitor = new ProcessMemoryMonitor();
 *   monitor.start(); // Starts logging every 10 seconds
 *   monitor.stop();  // Stops monitoring
 */
class ProcessMemoryMonitor {
  /**
   * Create a process memory monitor
   * @param {Object} options - Monitor options
   * @param {number} options.intervalMs - Logging interval in milliseconds (default: 10000)
   * @param {number} options.initialDelayMs - Initial delay before first log (default: 2000)
   */
  constructor(options = {}) {
    this._intervalMs = options.intervalMs || 10000;
    this._initialDelayMs = options.initialDelayMs || 2000;
    this._intervalHandle = null;
    this._timeoutHandle = null;
    this._isRunning = false;
  }

  /**
   * Format kilobytes as megabytes string
   * @private
   * @param {number} kb - Value in kilobytes
   * @returns {string} Formatted string (e.g., "45.2 MB")
   */
  _formatMB(kb) {
    return (kb / 1024).toFixed(1) + ' MB';
  }

  /**
   * Log current process metrics
   * @private
   */
  _logMetrics() {
    const metrics = app.getAppMetrics();
    const summary = metrics.map(proc => ({
      type: proc.type,
      pid: proc.pid,
      memory: this._formatMB(proc.memory.workingSetSize),
      peak: this._formatMB(proc.memory.peakWorkingSetSize),
      cpu: proc.cpu.percentCPUUsage.toFixed(1) + '%'
    }));

    const total = metrics.reduce((sum, p) => sum + p.memory.workingSetSize, 0);

    console.log(`[Dev Memory] Total: ${this._formatMB(total)} | Processes: ${metrics.length}`);
    summary.forEach(p => {
      console.log(`  ${p.type.padEnd(12)} PID:${p.pid}  Mem:${p.memory.padStart(10)}  Peak:${p.peak.padStart(10)}  CPU:${p.cpu.padStart(6)}`);
    });
  }

  /**
   * Start periodic memory monitoring
   * @returns {ProcessMemoryMonitor} this instance for chaining
   */
  start() {
    if (this._isRunning) {
      return this;
    }

    this._isRunning = true;

    console.log('\n[Dev] Process memory monitoring enabled (every 10s)');
    console.log('[Dev] Note: Web Workers (render.worker.js) memory is included in Renderer\n');

    // Initial delay for app to stabilize, then log immediately
    this._timeoutHandle = setTimeout(() => {
      this._logMetrics();
      // Then continue at regular interval
      this._intervalHandle = setInterval(() => this._logMetrics(), this._intervalMs);
    }, this._initialDelayMs);

    return this;
  }

  /**
   * Stop memory monitoring
   * @returns {ProcessMemoryMonitor} this instance for chaining
   */
  stop() {
    if (this._timeoutHandle) {
      clearTimeout(this._timeoutHandle);
      this._timeoutHandle = null;
    }

    if (this._intervalHandle) {
      clearInterval(this._intervalHandle);
      this._intervalHandle = null;
    }

    this._isRunning = false;
    return this;
  }

  /**
   * Check if monitor is currently running
   * @returns {boolean}
   */
  isRunning() {
    return this._isRunning;
  }

  /**
   * Get a single snapshot of current memory metrics
   * @returns {Object} Memory metrics snapshot
   */
  getSnapshot() {
    const metrics = app.getAppMetrics();
    const total = metrics.reduce((sum, p) => sum + p.memory.workingSetSize, 0);

    return {
      timestamp: Date.now(),
      totalKB: total,
      totalMB: this._formatMB(total),
      processCount: metrics.length,
      processes: metrics.map(proc => ({
        type: proc.type,
        pid: proc.pid,
        memoryKB: proc.memory.workingSetSize,
        memoryMB: this._formatMB(proc.memory.workingSetSize),
        peakMemoryKB: proc.memory.peakWorkingSetSize,
        peakMemoryMB: this._formatMB(proc.memory.peakWorkingSetSize),
        cpuPercent: proc.cpu.percentCPUUsage
      }))
    };
  }
}

export { ProcessMemoryMonitor };
