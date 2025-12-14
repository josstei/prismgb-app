/**
 * Electron Process Memory Integration Test
 *
 * This test must be run within an Electron environment, not vitest.
 * Run with: npm run electron:test (or manually in dev console)
 *
 * Usage from Electron main process:
 *   const { runMemoryBenchmark } = require('./tests/integration/electron-memory.test.js');
 *   runMemoryBenchmark();
 *
 * Usage from renderer devtools console:
 *   Copy this file's content and run directly
 */

/**
 * Formats bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Gets memory metrics from Electron main process
 * Must be called from main process context
 */
async function getElectronProcessMetrics() {
  // This requires Electron's app module - only works in main process
  let app;
  try {
    app = require('electron').app;
  } catch {
    return null; // Not in Electron main process
  }

  const metrics = app.getAppMetrics();

  return metrics.map(proc => ({
    pid: proc.pid,
    type: proc.type,
    name: proc.name || proc.type,
    memory: {
      workingSetSize: formatBytes(proc.memory.workingSetSize * 1024),
      peakWorkingSetSize: formatBytes(proc.memory.peakWorkingSetSize * 1024),
      privateBytes: formatBytes(proc.memory.privateBytes * 1024),
    },
    cpu: {
      percentCPU: proc.cpu.percentCPUUsage.toFixed(2),
    },
    // GPU-specific info (only for GPU process)
    ...(proc.type === 'GPU' && {
      gpuMemory: proc.memory,
    })
  }));
}

/**
 * Gets renderer process memory via performance API
 * Can be called from renderer process
 */
function getRendererMemory() {
  if (typeof performance === 'undefined') return null;

  const memory = performance.memory;
  if (!memory) return null;

  return {
    usedJSHeapSize: formatBytes(memory.usedJSHeapSize),
    totalJSHeapSize: formatBytes(memory.totalJSHeapSize),
    jsHeapSizeLimit: formatBytes(memory.jsHeapSizeLimit),
    usagePercent: ((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(2) + '%',
  };
}

/**
 * Monitors memory over time during streaming
 * @param {number} durationMs - How long to monitor
 * @param {number} intervalMs - Sample interval
 */
async function monitorMemoryDuring(durationMs = 10000, intervalMs = 1000) {
  const samples = [];
  const startTime = Date.now();

  console.log(`Starting memory monitoring for ${durationMs / 1000}s...`);

  while (Date.now() - startTime < durationMs) {
    const sample = {
      timestamp: Date.now() - startTime,
      renderer: getRendererMemory(),
    };

    // Try to get Electron metrics if in main process
    const electronMetrics = await getElectronProcessMetrics();
    if (electronMetrics) {
      sample.processes = electronMetrics;
    }

    samples.push(sample);
    await new Promise(r => setTimeout(r, intervalMs));
  }

  return analyzeMemorySamples(samples);
}

/**
 * Analyzes collected memory samples
 */
function analyzeMemorySamples(samples) {
  if (samples.length === 0) return null;

  const rendererSamples = samples
    .filter(s => s.renderer)
    .map(s => parseInt(s.renderer.usedJSHeapSize));

  if (rendererSamples.length === 0) {
    return { error: 'No renderer memory data available' };
  }

  const first = rendererSamples[0];
  const last = rendererSamples[rendererSamples.length - 1];
  const max = Math.max(...rendererSamples);
  const min = Math.min(...rendererSamples);
  const avg = rendererSamples.reduce((a, b) => a + b, 0) / rendererSamples.length;

  return {
    sampleCount: samples.length,
    renderer: {
      start: formatBytes(first),
      end: formatBytes(last),
      min: formatBytes(min),
      max: formatBytes(max),
      avg: formatBytes(avg),
      growth: formatBytes(last - first),
      growthPercent: ((last - first) / first * 100).toFixed(2) + '%',
    },
    // Process breakdown if available
    processes: samples[samples.length - 1].processes || null,
  };
}

/**
 * Runs a complete memory benchmark
 * Call this from Electron main process or renderer devtools
 */
async function runMemoryBenchmark() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           ELECTRON PROCESS MEMORY BENCHMARK                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Initial snapshot
  console.log('=== Initial Memory State ===');

  const rendererMem = getRendererMemory();
  if (rendererMem) {
    console.log('Renderer JS Heap:');
    console.log(`  Used: ${rendererMem.usedJSHeapSize}`);
    console.log(`  Total: ${rendererMem.totalJSHeapSize}`);
    console.log(`  Limit: ${rendererMem.jsHeapSizeLimit}`);
    console.log(`  Usage: ${rendererMem.usagePercent}`);
  }

  const electronMetrics = await getElectronProcessMetrics();
  if (electronMetrics) {
    console.log('\nElectron Processes:');
    electronMetrics.forEach(proc => {
      console.log(`\n  ${proc.type} (PID: ${proc.pid}):`);
      console.log(`    Working Set: ${proc.memory.workingSetSize}`);
      console.log(`    Peak Working Set: ${proc.memory.peakWorkingSetSize}`);
      console.log(`    Private Bytes: ${proc.memory.privateBytes}`);
      console.log(`    CPU: ${proc.cpu.percentCPU}%`);
    });
  } else {
    console.log('\n(Electron process metrics not available - run from main process)');
  }

  // Monitor during simulated load
  console.log('\n=== Monitoring Memory During Operation ===');
  const analysis = await monitorMemoryDuring(10000, 1000);

  console.log('\n=== Memory Analysis Results ===');
  console.log(`Samples collected: ${analysis.sampleCount}`);

  if (analysis.renderer) {
    console.log('\nRenderer Heap:');
    console.log(`  Start: ${analysis.renderer.start}`);
    console.log(`  End: ${analysis.renderer.end}`);
    console.log(`  Min: ${analysis.renderer.min}`);
    console.log(`  Max: ${analysis.renderer.max}`);
    console.log(`  Avg: ${analysis.renderer.avg}`);
    console.log(`  Growth: ${analysis.renderer.growth} (${analysis.renderer.growthPercent})`);

    // Memory stability check
    const growthPercent = parseFloat(analysis.renderer.growthPercent);
    if (growthPercent < 5) {
      console.log('\n✓ PASS: Memory growth is within acceptable limits (<5%)');
    } else if (growthPercent < 20) {
      console.log('\n⚠ WARNING: Memory growth is elevated (5-20%)');
    } else {
      console.log('\n✗ FAIL: Significant memory growth detected (>20%) - possible leak');
    }
  }

  return analysis;
}

/**
 * Utility to force garbage collection and measure cleanup
 * Only works if --expose-gc flag is set
 */
function forceGCAndMeasure() {
  const before = getRendererMemory();

  if (typeof global !== 'undefined' && global.gc) {
    global.gc();
  } else if (typeof window !== 'undefined' && window.gc) {
    window.gc();
  } else {
    console.log('GC not exposed. Run with --expose-gc to enable.');
    return null;
  }

  const after = getRendererMemory();

  return {
    before,
    after,
    freed: before && after ? formatBytes(
      parseInt(before.usedJSHeapSize) - parseInt(after.usedJSHeapSize)
    ) : 'N/A',
  };
}

// Export for use in Electron
if (typeof module !== 'undefined') {
  module.exports = {
    runMemoryBenchmark,
    getElectronProcessMetrics,
    getRendererMemory,
    monitorMemoryDuring,
    forceGCAndMeasure,
  };
}

// Auto-run if executed directly in devtools
if (typeof window !== 'undefined' && window.location) {
  console.log('Electron Memory Test loaded. Run: runMemoryBenchmark()');
}
