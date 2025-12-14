/**
 * Streaming Simulation Test
 *
 * Simulates real-world streaming at 60fps for the Chromatic device (160x144).
 * Measures CPU and memory usage under sustained load.
 */

import { performance } from 'node:perf_hooks';
import {
  PerformanceCache,
  AnimationCache,
  globalAnimationCache
} from '../src/shared/utils/performance-cache.js';
import { ResolutionCalculator } from './utilities/ResolutionCalculator.js';

// Chromatic device specs
const CHROMATIC = {
  width: 160,
  height: 144,
  fps: 60,
  scale: 4 // 640x576 output
};

// Simulation parameters
const DURATION_MS = 5000; // 5 second simulation
const FRAME_TIME_MS = 1000 / CHROMATIC.fps; // ~16.67ms per frame

console.log('═══════════════════════════════════════════════════════════════');
console.log('  STREAMING SIMULATION TEST');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  Device: Chromatic (${CHROMATIC.width}x${CHROMATIC.height} @ ${CHROMATIC.fps}fps)`);
console.log(`  Output: ${CHROMATIC.width * CHROMATIC.scale}x${CHROMATIC.height * CHROMATIC.scale}`);
console.log(`  Duration: ${DURATION_MS / 1000}s (${Math.floor(DURATION_MS / FRAME_TIME_MS)} frames)`);
console.log('═══════════════════════════════════════════════════════════════\n');

// Initialize calculators
const calculator = new ResolutionCalculator(CHROMATIC.width, CHROMATIC.height, { useCache: true });

// Simulate frame buffer (RGB pixels)
const frameBuffer = new Uint8ClampedArray(CHROMATIC.width * CHROMATIC.height * 4);
const scaledBuffer = new Uint8ClampedArray(
  CHROMATIC.width * CHROMATIC.scale * CHROMATIC.height * CHROMATIC.scale * 4
);

// Metrics
let frameCount = 0;
let totalFrameTime = 0;
let maxFrameTime = 0;
let minFrameTime = Infinity;
const frameTimes = [];
const memorySnapshots = [];

// Simulate a single frame render
function simulateFrame() {
  const start = performance.now();

  // 1. Get cached resolution (happens every frame)
  const resolution = calculator.calculateScaled(CHROMATIC.scale);

  // 2. Simulate pixel processing (simplified)
  for (let i = 0; i < frameBuffer.length; i += 4) {
    // Simulate reading from "camera" - random noise
    frameBuffer[i] = Math.random() * 255;     // R
    frameBuffer[i + 1] = Math.random() * 255; // G
    frameBuffer[i + 2] = Math.random() * 255; // B
    frameBuffer[i + 3] = 255;                 // A
  }

  // 3. Simulate nearest-neighbor scaling (cache the scale factor lookup)
  const scaleX = resolution.width / CHROMATIC.width;
  const scaleY = resolution.height / CHROMATIC.height;

  // 4. Check animation cache (would pause decorative animations during streaming)
  globalAnimationCache.set('streaming', true);

  const frameTime = performance.now() - start;
  frameTimes.push(frameTime);
  totalFrameTime += frameTime;
  maxFrameTime = Math.max(maxFrameTime, frameTime);
  minFrameTime = Math.min(minFrameTime, frameTime);
  frameCount++;
}

// Memory snapshot
function takeMemorySnapshot() {
  const mem = process.memoryUsage();
  memorySnapshots.push({
    time: performance.now(),
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    rss: mem.rss
  });
}

// Run simulation
async function runSimulation() {
  const startTime = performance.now();
  const startCpu = process.cpuUsage();

  console.log('▶ Starting 60fps streaming simulation...\n');

  // Initial memory snapshot
  takeMemorySnapshot();

  // Simulate frames at 60fps
  let lastFrameTime = startTime;
  let lastMemoryCheck = startTime;

  while (performance.now() - startTime < DURATION_MS) {
    const now = performance.now();

    // Render frame if enough time has passed
    if (now - lastFrameTime >= FRAME_TIME_MS) {
      simulateFrame();
      lastFrameTime = now;

      // Progress indicator every second
      if (frameCount % 60 === 0) {
        const elapsed = ((now - startTime) / 1000).toFixed(1);
        const avgFrameTime = (totalFrameTime / frameCount).toFixed(2);
        process.stdout.write(`   ${elapsed}s: ${frameCount} frames, avg ${avgFrameTime}ms/frame\r`);
      }
    }

    // Memory snapshot every 500ms
    if (now - lastMemoryCheck >= 500) {
      takeMemorySnapshot();
      lastMemoryCheck = now;
    }

    // Small delay to prevent busy-waiting
    await new Promise(r => setTimeout(r, 1));
  }

  // Final memory snapshot
  takeMemorySnapshot();

  const endCpu = process.cpuUsage(startCpu);
  const actualDuration = performance.now() - startTime;

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SIMULATION RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');

  // Frame statistics
  const avgFrameTime = totalFrameTime / frameCount;
  const actualFps = frameCount / (actualDuration / 1000);

  console.log('\n📊 FRAME STATISTICS');
  console.log(`   Total Frames:    ${frameCount}`);
  console.log(`   Actual FPS:      ${actualFps.toFixed(1)} (target: ${CHROMATIC.fps})`);
  console.log(`   Avg Frame Time:  ${avgFrameTime.toFixed(3)}ms`);
  console.log(`   Min Frame Time:  ${minFrameTime.toFixed(3)}ms`);
  console.log(`   Max Frame Time:  ${maxFrameTime.toFixed(3)}ms`);
  console.log(`   Frame Budget:    ${FRAME_TIME_MS.toFixed(2)}ms (${(avgFrameTime < FRAME_TIME_MS) ? '✅ WITHIN' : '❌ EXCEEDED'})`);

  // CPU statistics
  console.log('\n💻 CPU USAGE');
  console.log(`   User CPU:        ${(endCpu.user / 1000).toFixed(2)}ms`);
  console.log(`   System CPU:      ${(endCpu.system / 1000).toFixed(2)}ms`);
  console.log(`   Total CPU:       ${((endCpu.user + endCpu.system) / 1000).toFixed(2)}ms`);
  console.log(`   CPU per Frame:   ${(((endCpu.user + endCpu.system) / 1000) / frameCount).toFixed(3)}ms`);

  // Memory statistics
  const initialMem = memorySnapshots[0];
  const finalMem = memorySnapshots[memorySnapshots.length - 1];
  const heapGrowth = (finalMem.heapUsed - initialMem.heapUsed) / 1024 / 1024;
  const maxHeap = Math.max(...memorySnapshots.map(s => s.heapUsed)) / 1024 / 1024;

  console.log('\n🧠 MEMORY USAGE');
  console.log(`   Initial Heap:    ${(initialMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Final Heap:      ${(finalMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Peak Heap:       ${maxHeap.toFixed(2)} MB`);
  console.log(`   Heap Growth:     ${heapGrowth.toFixed(2)} MB`);
  console.log(`   RSS:             ${(finalMem.rss / 1024 / 1024).toFixed(2)} MB`);

  // Cache statistics
  console.log('\n📦 CACHE STATISTICS');
  const resStats = ResolutionCalculator.getCacheStats();
  console.log(`   Resolution Cache Size:  ${resStats.size}`);
  console.log(`   Resolution Hit Rate:    ${resStats.hitRate}`);
  console.log(`   Animation Cache Active: ${globalAnimationCache.activeCount > 0 ? 'Yes' : 'No'}`);

  // Frame time distribution
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  console.log('\n📈 FRAME TIME PERCENTILES');
  console.log(`   P50:  ${p50.toFixed(3)}ms`);
  console.log(`   P95:  ${p95.toFixed(3)}ms`);
  console.log(`   P99:  ${p99.toFixed(3)}ms`);

  // Validation
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  VALIDATION');
  console.log('═══════════════════════════════════════════════════════════════');

  const validations = [
    { name: 'Achieved target FPS (60)', pass: actualFps >= 55 },
    { name: 'Avg frame time < 16.67ms', pass: avgFrameTime < FRAME_TIME_MS },
    { name: 'P99 frame time < 20ms', pass: p99 < 20 },
    { name: 'Heap growth < 10 MB', pass: heapGrowth < 10 },
    { name: 'Cache hit rate > 99%', pass: parseFloat(resStats.hitRate) > 99 },
    { name: 'No memory leak pattern', pass: heapGrowth < 5 }
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

// Run the simulation
runSimulation().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
