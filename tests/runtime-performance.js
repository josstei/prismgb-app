/**
 * Runtime Performance Test
 *
 * Validates actual CPU and memory usage of the performance optimizations.
 * This runs the real code (not mocks) and measures system resources.
 */

import { performance, PerformanceObserver } from 'node:perf_hooks';
import { cpus } from 'node:os';

// Import the actual modules to test
import {
  PerformanceCache,
  AnimationCache
} from '../src/shared/utils/performance-cache.js';
import { ResolutionCalculator } from './utilities/ResolutionCalculator.js';

// Test configuration
const ITERATIONS = 10000;
const CHROMATIC_WIDTH = 160;
const CHROMATIC_HEIGHT = 144;

// Results storage
const results = {
  memory: {},
  cpu: {},
  cache: {}
};

// Memory measurement helper
function getMemoryUsage() {
  const mem = process.memoryUsage();
  return {
    heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2),
    heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(2),
    external: (mem.external / 1024 / 1024).toFixed(2),
    rss: (mem.rss / 1024 / 1024).toFixed(2)
  };
}

// CPU measurement helper
function measureCPU(fn, iterations = ITERATIONS) {
  // Force GC if available
  if (global.gc) global.gc();

  const startCpu = process.cpuUsage();
  const startTime = performance.now();

  for (let i = 0; i < iterations; i++) {
    fn(i);
  }

  const endTime = performance.now();
  const endCpu = process.cpuUsage(startCpu);

  return {
    wallTime: (endTime - startTime).toFixed(2),
    userCPU: (endCpu.user / 1000).toFixed(2),
    systemCPU: (endCpu.system / 1000).toFixed(2),
    opsPerSecond: Math.round(iterations / ((endTime - startTime) / 1000))
  };
}

// Test functions
function runTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PRISMGB RUNTIME PERFORMANCE TEST');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Platform: ${process.platform} | Node: ${process.version}`);
  console.log(`  CPUs: ${cpus().length} x ${cpus()[0].model}`);
  console.log(`  Iterations per test: ${ITERATIONS.toLocaleString()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Initial memory baseline
  results.memory.baseline = getMemoryUsage();
  console.log('📊 MEMORY BASELINE');
  console.log(`   Heap Used: ${results.memory.baseline.heapUsed} MB`);
  console.log(`   RSS: ${results.memory.baseline.rss} MB\n`);

  // Test 1: PerformanceCache operations
  console.log('▶ TEST 1: PerformanceCache Operations');
  const cache = new PerformanceCache({ maxSize: 1000, defaultTTL: 60000 });

  const setCpu = measureCPU((i) => cache.set(`key${i}`, { value: i, data: 'test' }));
  console.log(`   SET: ${setCpu.opsPerSecond.toLocaleString()} ops/sec (${setCpu.wallTime}ms wall, ${setCpu.userCPU}ms CPU)`);

  const getCpu = measureCPU((i) => cache.get(`key${i % 1000}`));
  console.log(`   GET: ${getCpu.opsPerSecond.toLocaleString()} ops/sec (${getCpu.wallTime}ms wall, ${getCpu.userCPU}ms CPU)`);

  results.cpu.cacheSet = setCpu;
  results.cpu.cacheGet = getCpu;

  // Test 2: ResolutionCalculator with caching
  console.log('\n▶ TEST 2: ResolutionCalculator (Cached vs Uncached)');
  const cachedCalc = new ResolutionCalculator(CHROMATIC_WIDTH, CHROMATIC_HEIGHT, { useCache: true });
  const uncachedCalc = new ResolutionCalculator(CHROMATIC_WIDTH, CHROMATIC_HEIGHT, { useCache: false });

  // Warm up cached version
  for (let i = 1; i <= 10; i++) cachedCalc.calculateScaled(i);

  const cachedCpu = measureCPU((i) => cachedCalc.calculateScaled((i % 10) + 1));
  console.log(`   CACHED:   ${cachedCpu.opsPerSecond.toLocaleString()} ops/sec (${cachedCpu.wallTime}ms wall, ${cachedCpu.userCPU}ms CPU)`);

  const uncachedCpu = measureCPU((i) => uncachedCalc.calculateScaled((i % 10) + 1));
  console.log(`   UNCACHED: ${uncachedCpu.opsPerSecond.toLocaleString()} ops/sec (${uncachedCpu.wallTime}ms wall, ${uncachedCpu.userCPU}ms CPU)`);

  results.cpu.cachedResolution = cachedCpu;
  results.cpu.uncachedResolution = uncachedCpu;

  // Test 3: Complex resolution calculations
  console.log('\n▶ TEST 3: Complex Resolution Operations');
  const scaleToFitCpu = measureCPU((i) => {
    cachedCalc.calculateScaleToFit(1920, 1080, { minScale: 1, maxScale: 10 });
  });
  console.log(`   scaleToFit: ${scaleToFitCpu.opsPerSecond.toLocaleString()} ops/sec`);

  const aspectRatioCpu = measureCPU(() => cachedCalc.aspectRatio);
  console.log(`   aspectRatio: ${aspectRatioCpu.opsPerSecond.toLocaleString()} ops/sec`);

  results.cpu.scaleToFit = scaleToFitCpu;

  // Test 4: Memoization pattern
  console.log('\n▶ TEST 4: Memoization Pattern (getOrCompute)');
  let computeCount = 0;
  const memoCache = new PerformanceCache({ maxSize: 100 });

  const memoCpu = measureCPU((i) => {
    memoCache.getOrCompute(`compute${i % 10}`, () => {
      computeCount++;
      return Math.sqrt(i) * Math.PI;
    });
  });
  console.log(`   Memoized ops: ${memoCpu.opsPerSecond.toLocaleString()} ops/sec`);
  console.log(`   Actual computes: ${computeCount} (expected: 10, saved: ${ITERATIONS - computeCount})`);

  results.cpu.memoization = memoCpu;
  results.cache.memoSavings = ITERATIONS - computeCount;

  // Test 5: LRU eviction under pressure
  console.log('\n▶ TEST 5: LRU Eviction Under Memory Pressure');
  const smallCache = new PerformanceCache({ maxSize: 100 });

  const evictionCpu = measureCPU((i) => {
    smallCache.set(`evict${i}`, { data: new Array(100).fill(i) });
  });
  console.log(`   Eviction ops: ${evictionCpu.opsPerSecond.toLocaleString()} ops/sec`);
  console.log(`   Cache size maintained at: ${smallCache.size} (max: 100)`);

  results.cpu.eviction = evictionCpu;

  // Test 6: ResolutionCalculator (with built-in caching)
  console.log('\n▶ TEST 6: ResolutionCalculator Performance');

  const calculator = new ResolutionCalculator(CHROMATIC_WIDTH, CHROMATIC_HEIGHT);
  const globalResCpu = measureCPU((i) => {
    calculator.calculateScaled((i % 8) + 1);
  });
  console.log(`   ResolutionCalculator: ${globalResCpu.opsPerSecond.toLocaleString()} ops/sec`);

  const globalStats = ResolutionCalculator.getCacheStats();
  console.log(`   Cache hit rate: ${globalStats.hitRate}`);

  results.cpu.globalCache = globalResCpu;
  results.cache.globalHitRate = globalStats.hitRate;

  // Final memory measurement
  results.memory.final = getMemoryUsage();
  const heapGrowth = (parseFloat(results.memory.final.heapUsed) - parseFloat(results.memory.baseline.heapUsed)).toFixed(2);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  MEMORY SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`   Baseline Heap: ${results.memory.baseline.heapUsed} MB`);
  console.log(`   Final Heap:    ${results.memory.final.heapUsed} MB`);
  console.log(`   Heap Growth:   ${heapGrowth} MB`);
  console.log(`   Final RSS:     ${results.memory.final.rss} MB`);

  // Performance summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  CPU PERFORMANCE SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`   Cache SET:        ${results.cpu.cacheSet.opsPerSecond.toLocaleString()} ops/sec`);
  console.log(`   Cache GET:        ${results.cpu.cacheGet.opsPerSecond.toLocaleString()} ops/sec`);
  console.log(`   Cached Calc:      ${results.cpu.cachedResolution.opsPerSecond.toLocaleString()} ops/sec`);
  console.log(`   Uncached Calc:    ${results.cpu.uncachedResolution.opsPerSecond.toLocaleString()} ops/sec`);
  console.log(`   Memoization:      ${results.cpu.memoization.opsPerSecond.toLocaleString()} ops/sec`);
  console.log(`   LRU Eviction:     ${results.cpu.eviction.opsPerSecond.toLocaleString()} ops/sec`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  CACHE EFFICIENCY SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`   Global Cache Hit Rate: ${results.cache.globalHitRate}`);
  console.log(`   Memoization Savings:   ${results.cache.memoSavings.toLocaleString()} / ${ITERATIONS.toLocaleString()} operations`);
  console.log(`   Savings Rate:          ${((results.cache.memoSavings / ITERATIONS) * 100).toFixed(2)}%`);

  // Validation
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  VALIDATION RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');

  const validations = [
    { name: 'Cache GET > 100k ops/sec', pass: results.cpu.cacheGet.opsPerSecond > 100000 },
    { name: 'Cache SET > 100k ops/sec', pass: results.cpu.cacheSet.opsPerSecond > 100000 },
    { name: 'Memoization > 100k ops/sec', pass: results.cpu.memoization.opsPerSecond > 100000 },
    { name: 'Heap growth < 50 MB', pass: parseFloat(heapGrowth) < 50 },
    { name: 'LRU maintains size limit', pass: smallCache.size <= 100 },
    { name: 'Memoization saves > 99% computes', pass: results.cache.memoSavings > ITERATIONS * 0.99 }
  ];

  let passed = 0;
  for (const v of validations) {
    const status = v.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`   ${status}: ${v.name}`);
    if (v.pass) passed++;
  }

  console.log(`\n   TOTAL: ${passed}/${validations.length} validations passed`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  return passed === validations.length;
}

// Run tests
const success = runTests();
process.exit(success ? 0 : 1);
