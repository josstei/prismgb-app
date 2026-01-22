/**
 * Performance Baseline Configuration
 *
 * Defines baseline measurements and thresholds for performance testing.
 * Used for regression detection in CI/CD.
 */

/**
 * Performance baseline version
 * Increment when baselines are updated
 */
export const BASELINE_VERSION = '1.0.0';

/**
 * Last baseline update date
 */
export const BASELINE_DATE = '2025-01-18';

/**
 * Performance metric baselines
 *
 * Each metric has:
 * - baseline: Expected value (ms unless otherwise specified)
 * - tolerance: Allowed variance as decimal (0.2 = 20%)
 * - unit: Measurement unit
 * - category: Grouping for reports
 */
export const PerformanceBaselines = Object.freeze({
  // Resolution calculations
  'resolution-calc-cached': {
    baseline: 0.05,
    tolerance: 0.3,
    unit: 'ms',
    category: 'computation',
    description: 'Cached resolution calculation lookup',
  },

  'resolution-calc-uncached': {
    baseline: 0.5,
    tolerance: 0.3,
    unit: 'ms',
    category: 'computation',
    description: 'Fresh resolution calculation',
  },

  // Cache operations
  'cache-set': {
    baseline: 0.02,
    tolerance: 0.5,
    unit: 'ms',
    category: 'cache',
    description: 'Cache write operation',
  },

  'cache-get-hit': {
    baseline: 0.01,
    tolerance: 0.5,
    unit: 'ms',
    category: 'cache',
    description: 'Cache read (hit)',
  },

  'cache-get-miss': {
    baseline: 0.01,
    tolerance: 0.5,
    unit: 'ms',
    category: 'cache',
    description: 'Cache read (miss)',
  },

  // Stream operations
  'stream-start-cycle': {
    baseline: 5,
    tolerance: 0.25,
    unit: 'ms',
    category: 'streaming',
    description: 'Mock stream start to active',
  },

  'stream-stop': {
    baseline: 1,
    tolerance: 0.3,
    unit: 'ms',
    category: 'streaming',
    description: 'Stream stop and cleanup',
  },

  // Event bus
  'eventbus-publish': {
    baseline: 0.05,
    tolerance: 0.3,
    unit: 'ms',
    category: 'events',
    description: 'Single event publish',
  },

  'eventbus-subscribe': {
    baseline: 0.02,
    tolerance: 2.5,
    unit: 'ms',
    category: 'events',
    description: 'Event subscription',
  },

  'eventbus-100-publishes': {
    baseline: 5,
    tolerance: 0.25,
    unit: 'ms',
    category: 'events',
    description: 'Batch of 100 event publishes',
  },

  // Device operations
  'device-enumerate': {
    baseline: 1,
    tolerance: 0.3,
    unit: 'ms',
    category: 'device',
    description: 'Mock device enumeration',
  },

  'device-state-transition': {
    baseline: 0.1,
    tolerance: 0.5,
    unit: 'ms',
    category: 'device',
    description: 'Device state machine transition',
  },

  // UI operations
  'dom-element-create': {
    baseline: 0.1,
    tolerance: 0.5,
    unit: 'ms',
    category: 'ui',
    description: 'DOM element creation',
  },

  'canvas-draw': {
    baseline: 0.5,
    tolerance: 0.3,
    unit: 'ms',
    category: 'ui',
    description: 'Canvas drawImage call',
  },

  // Capture operations
  'screenshot-capture': {
    baseline: 10,
    tolerance: 0.3,
    unit: 'ms',
    category: 'capture',
    description: 'Screenshot capture (mock)',
  },

  // Memory
  'factory-creation': {
    baseline: 3,
    tolerance: 0.8,
    unit: 'ms',
    category: 'memory',
    description: 'Mock factory instantiation',
  },
});

/**
 * Gets baseline for a metric
 * @param {string} metricName - Metric identifier
 * @returns {Object|null} Baseline config or null
 */
export function getBaseline(metricName) {
  return PerformanceBaselines[metricName] || null;
}

/**
 * Gets all metrics in a category
 * @param {string} category - Category name
 * @returns {Object} Metrics in category
 */
export function getMetricsByCategory(category) {
  const result = {};
  for (const [name, config] of Object.entries(PerformanceBaselines)) {
    if (config.category === category) {
      result[name] = config;
    }
  }
  return result;
}

/**
 * Gets all categories
 * @returns {string[]} Category names
 */
export function getCategories() {
  const categories = new Set();
  for (const config of Object.values(PerformanceBaselines)) {
    categories.add(config.category);
  }
  return Array.from(categories);
}

/**
 * Calculates allowed maximum value for a metric
 * @param {string} metricName - Metric identifier
 * @returns {number|null} Maximum allowed value
 */
export function getMaxAllowed(metricName) {
  const baseline = PerformanceBaselines[metricName];
  if (!baseline) return null;
  return baseline.baseline * (1 + baseline.tolerance);
}

/**
 * Checks if a measured value passes the baseline
 * @param {string} metricName - Metric identifier
 * @param {number} measured - Measured value
 * @returns {{ pass: boolean, baseline: number, measured: number, maxAllowed: number, variance: number }}
 */
export function checkBaseline(metricName, measured) {
  const config = PerformanceBaselines[metricName];

  if (!config) {
    return {
      pass: true,
      warning: `No baseline defined for: ${metricName}`,
      measured,
    };
  }

  const maxAllowed = config.baseline * (1 + config.tolerance);
  const variance = (measured - config.baseline) / config.baseline;
  const pass = measured <= maxAllowed;

  return {
    pass,
    baseline: config.baseline,
    measured,
    maxAllowed,
    variance,
    unit: config.unit,
  };
}

/**
 * Asserts that a measured value meets baseline
 * @param {string} metricName - Metric identifier
 * @param {number} measured - Measured value
 * @throws {Error} If baseline is exceeded
 */
export function assertBaseline(metricName, measured) {
  const result = checkBaseline(metricName, measured);

  if (!result.pass) {
    throw new Error(
      `Performance regression: ${metricName}\n` +
      `  Baseline: ${result.baseline}${result.unit}\n` +
      `  Measured: ${measured.toFixed(4)}${result.unit}\n` +
      `  Max allowed: ${result.maxAllowed.toFixed(4)}${result.unit}\n` +
      `  Variance: ${(result.variance * 100).toFixed(1)}%`
    );
  }

  return result;
}

/**
 * Creates a performance report
 * @param {Object} measurements - { metricName: measuredValue }
 * @returns {Object} Report with pass/fail status
 */
export function createPerformanceReport(measurements) {
  const results = {};
  let allPassed = true;
  const failures = [];

  for (const [name, value] of Object.entries(measurements)) {
    const result = checkBaseline(name, value);
    results[name] = result;

    if (!result.pass) {
      allPassed = false;
      failures.push(name);
    }
  }

  return {
    version: BASELINE_VERSION,
    date: new Date().toISOString(),
    passed: allPassed,
    failures,
    results,
    summary: {
      total: Object.keys(measurements).length,
      passed: Object.keys(measurements).length - failures.length,
      failed: failures.length,
    },
  };
}

/**
 * Formats a performance report for console output
 * @param {Object} report - Report from createPerformanceReport
 * @returns {string} Formatted report
 */
export function formatReport(report) {
  const lines = [
    '═══════════════════════════════════════════════════════════',
    '                    PERFORMANCE REPORT',
    '═══════════════════════════════════════════════════════════',
    `Version: ${report.version}`,
    `Date: ${report.date}`,
    `Status: ${report.passed ? '✓ PASSED' : '✗ FAILED'}`,
    '',
    `Summary: ${report.summary.passed}/${report.summary.total} metrics passed`,
    '',
  ];

  if (report.failures.length > 0) {
    lines.push('FAILURES:');
    for (const name of report.failures) {
      const r = report.results[name];
      lines.push(`  ✗ ${name}`);
      lines.push(`    Baseline: ${r.baseline}${r.unit}, Measured: ${r.measured.toFixed(4)}${r.unit}`);
      lines.push(`    Variance: ${(r.variance * 100).toFixed(1)}%`);
    }
    lines.push('');
  }

  lines.push('ALL RESULTS:');
  for (const [name, r] of Object.entries(report.results)) {
    const status = r.pass ? '✓' : '✗';
    const variance = r.variance !== undefined ? ` (${(r.variance * 100).toFixed(1)}%)` : '';
    lines.push(`  ${status} ${name}: ${r.measured?.toFixed(4) || 'N/A'}${r.unit || ''}${variance}`);
  }

  lines.push('═══════════════════════════════════════════════════════════');

  return lines.join('\n');
}

export default {
  BASELINE_VERSION,
  BASELINE_DATE,
  PerformanceBaselines,
  getBaseline,
  getMetricsByCategory,
  getCategories,
  getMaxAllowed,
  checkBaseline,
  assertBaseline,
  createPerformanceReport,
  formatReport,
};
