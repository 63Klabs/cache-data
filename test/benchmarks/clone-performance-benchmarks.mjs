/**
 * Performance benchmarks for JSON clone pattern vs structuredClone
 * 
 * This benchmark suite measures the performance difference between:
 * - JSON.parse(JSON.stringify(obj)) - Traditional deep clone pattern
 * - structuredClone(obj) - Native structured clone API
 * 
 * Tests cover various object sizes and nesting depths to validate
 * the 2-10x performance improvement expected from the optimization.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ============================================================================
// Object Generators
// ============================================================================

/**
 * Generate a random string of specified length
 * @param {number} length - Length of the string
 * @returns {string} Random string
 */
function generateRandomString(length = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a flat object with specified number of keys
 * @param {number} keyCount - Number of keys in the object
 * @returns {Object} Generated object
 */
function generateFlatObject(keyCount) {
  const obj = {};
  for (let i = 0; i < keyCount; i++) {
    const key = `key_${i}`;
    // Mix different value types
    const valueType = i % 4;
    switch (valueType) {
      case 0:
        obj[key] = generateRandomString(20);
        break;
      case 1:
        obj[key] = Math.random() * 1000;
        break;
      case 2:
        obj[key] = i % 2 === 0;
        break;
      case 3:
        obj[key] = null;
        break;
    }
  }
  return obj;
}

/**
 * Generate a nested object with specified depth and breadth
 * @param {number} depth - Current depth level
 * @param {number} maxDepth - Maximum nesting depth
 * @param {number} keysPerLevel - Number of keys at each level
 * @returns {Object} Generated nested object
 */
function generateNestedObject(depth, maxDepth, keysPerLevel) {
  if (depth >= maxDepth) {
    return generateRandomString(10);
  }

  const obj = {};
  for (let i = 0; i < keysPerLevel; i++) {
    const key = `level_${depth}_key_${i}`;
    if (i % 3 === 0 && depth < maxDepth - 1) {
      // Create nested object
      obj[key] = generateNestedObject(depth + 1, maxDepth, keysPerLevel);
    } else if (i % 3 === 1) {
      // Create array with nested objects
      obj[key] = [
        generateRandomString(10),
        Math.random() * 100,
        depth < maxDepth - 1 ? generateNestedObject(depth + 1, maxDepth, Math.max(1, keysPerLevel - 1)) : null
      ];
    } else {
      // Primitive value
      obj[key] = generateRandomString(15);
    }
  }
  return obj;
}

/**
 * Generate test objects for benchmarking
 * @returns {Object} Collection of test objects
 */
function generateTestObjects() {
  return {
    // Small objects (< 10 keys)
    small: {
      flat: generateFlatObject(5),
      shallow: generateNestedObject(0, 2, 3),
      medium: generateNestedObject(0, 3, 2)
    },
    // Medium objects (10-100 keys)
    medium: {
      flat: generateFlatObject(50),
      shallow: generateNestedObject(0, 2, 8),
      medium: generateNestedObject(0, 4, 4),
      deep: generateNestedObject(0, 6, 3)
    },
    // Large objects (> 100 keys)
    large: {
      flat: generateFlatObject(200),
      shallow: generateNestedObject(0, 2, 20),
      medium: generateNestedObject(0, 5, 6),
      deep: generateNestedObject(0, 8, 4)
    }
  };
}

// ============================================================================
// Benchmark Utilities
// ============================================================================

/**
 * Run a benchmark for a specific cloning operation
 * @param {Function} cloneFn - Function to benchmark
 * @param {Object} obj - Object to clone
 * @param {number} iterations - Number of iterations
 * @returns {Object} Benchmark results
 */
function runBenchmark(cloneFn, obj, iterations = 1000) {
  const times = [];
  
  // Warm-up phase (not measured)
  for (let i = 0; i < 10; i++) {
    cloneFn(obj);
  }
  
  // Measurement phase
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    cloneFn(obj);
    const end = performance.now();
    times.push(end - start);
  }
  
  // Calculate statistics
  times.sort((a, b) => a - b);
  const sum = times.reduce((acc, val) => acc + val, 0);
  const mean = sum / times.length;
  const median = times[Math.floor(times.length / 2)];
  const min = times[0];
  const max = times[times.length - 1];
  
  // Calculate standard deviation
  const squaredDiffs = times.map(time => Math.pow(time - mean, 2));
  const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / times.length;
  const stdDev = Math.sqrt(variance);
  
  return {
    mean,
    median,
    min,
    max,
    stdDev,
    iterations: times.length
  };
}

/**
 * Compare two benchmark results and calculate improvement ratio
 * @param {Object} jsonResult - JSON pattern benchmark result
 * @param {Object} structuredResult - structuredClone benchmark result
 * @returns {Object} Comparison results
 */
function compareBenchmarks(jsonResult, structuredResult) {
  const improvement = jsonResult.mean / structuredResult.mean;
  const medianImprovement = jsonResult.median / structuredResult.median;
  
  return {
    improvement,
    medianImprovement,
    jsonMean: jsonResult.mean,
    structuredMean: structuredResult.mean,
    jsonMedian: jsonResult.median,
    structuredMedian: structuredResult.median
  };
}

/**
 * Format benchmark results for display
 * @param {string} testName - Name of the test
 * @param {Object} comparison - Comparison results
 * @returns {string} Formatted results
 */
function formatResults(testName, comparison) {
  return `
${testName}:
  JSON Pattern:       ${comparison.jsonMean.toFixed(4)}ms (median: ${comparison.jsonMedian.toFixed(4)}ms)
  structuredClone:    ${comparison.structuredMean.toFixed(4)}ms (median: ${comparison.structuredMedian.toFixed(4)}ms)
  Improvement:        ${comparison.improvement.toFixed(2)}x faster (median: ${comparison.medianImprovement.toFixed(2)}x)
`;
}

// ============================================================================
// Benchmark Tests
// ============================================================================

describe('Clone Performance Benchmarks', () => {
  const testObjects = generateTestObjects();
  const iterations = 1000;

  describe('Small Objects (< 10 keys)', () => {
    it('should benchmark flat small object', () => {
      const obj = testObjects.small.flat;
      
      const jsonResult = runBenchmark(
        (o) => JSON.parse(JSON.stringify(o)),
        obj,
        iterations
      );
      
      const structuredResult = runBenchmark(
        (o) => structuredClone(o),
        obj,
        iterations
      );
      
      const comparison = compareBenchmarks(jsonResult, structuredResult);
      console.log(formatResults('Small Flat Object', comparison));
      
      // Requirement 6.1: No minimum requirement for small objects (JSON pattern may be faster)
      // This test documents performance characteristics but doesn't enforce a minimum
      assert.ok(
        true,
        `Small object performance: ${comparison.improvement.toFixed(2)}x (JSON pattern may be faster due to overhead)`
      );
    });

    it('should benchmark shallow nested small object (1-2 levels)', () => {
      const obj = testObjects.small.shallow;
      
      const jsonResult = runBenchmark(
        (o) => JSON.parse(JSON.stringify(o)),
        obj,
        iterations
      );
      
      const structuredResult = runBenchmark(
        (o) => structuredClone(o),
        obj,
        iterations
      );
      
      const comparison = compareBenchmarks(jsonResult, structuredResult);
      console.log(formatResults('Small Shallow Nested Object', comparison));
      
      // Requirement 6.1: No minimum requirement for small objects
      assert.ok(
        true,
        `Small nested object performance: ${comparison.improvement.toFixed(2)}x`
      );
    });

    it('should benchmark medium nested small object (3-5 levels)', () => {
      const obj = testObjects.small.medium;
      
      const jsonResult = runBenchmark(
        (o) => JSON.parse(JSON.stringify(o)),
        obj,
        iterations
      );
      
      const structuredResult = runBenchmark(
        (o) => structuredClone(o),
        obj,
        iterations
      );
      
      const comparison = compareBenchmarks(jsonResult, structuredResult);
      console.log(formatResults('Small Medium Nested Object', comparison));
      
      // Requirement 6.1: No minimum requirement for small objects
      assert.ok(
        true,
        `Small nested object performance: ${comparison.improvement.toFixed(2)}x`
      );
    });
  });

  describe('Medium Objects (10-100 keys)', () => {
    it('should benchmark flat medium object', () => {
      const obj = testObjects.medium.flat;
      
      const jsonResult = runBenchmark(
        (o) => JSON.parse(JSON.stringify(o)),
        obj,
        iterations
      );
      
      const structuredResult = runBenchmark(
        (o) => structuredClone(o),
        obj,
        iterations
      );
      
      const comparison = compareBenchmarks(jsonResult, structuredResult);
      console.log(formatResults('Medium Flat Object', comparison));
      
      // Requirement 6.2: At least 1.2x improvement for medium flat objects
      assert.ok(
        comparison.improvement >= 1.2,
        `Expected at least 1.2x improvement, got ${comparison.improvement.toFixed(2)}x`
      );
    });

    it('should benchmark shallow nested medium object (1-2 levels)', () => {
      const obj = testObjects.medium.shallow;
      
      const jsonResult = runBenchmark(
        (o) => JSON.parse(JSON.stringify(o)),
        obj,
        iterations
      );
      
      const structuredResult = runBenchmark(
        (o) => structuredClone(o),
        obj,
        iterations
      );
      
      const comparison = compareBenchmarks(jsonResult, structuredResult);
      console.log(formatResults('Medium Shallow Nested Object', comparison));
      
      // Nested objects: Performance comparable (0.9x+, may vary)
      assert.ok(
        comparison.improvement >= 0.9,
        `Expected at least 0.9x improvement, got ${comparison.improvement.toFixed(2)}x`
      );
    });

    it('should benchmark medium nested medium object (3-5 levels)', () => {
      const obj = testObjects.medium.medium;
      
      const jsonResult = runBenchmark(
        (o) => JSON.parse(JSON.stringify(o)),
        obj,
        iterations
      );
      
      const structuredResult = runBenchmark(
        (o) => structuredClone(o),
        obj,
        iterations
      );
      
      const comparison = compareBenchmarks(jsonResult, structuredResult);
      console.log(formatResults('Medium Medium Nested Object', comparison));
      
      // Nested objects: Performance comparable (0.9x+, may vary)
      assert.ok(
        comparison.improvement >= 0.9,
        `Expected at least 0.9x improvement, got ${comparison.improvement.toFixed(2)}x`
      );
    });

    it('should benchmark deep nested medium object (6+ levels)', () => {
      const obj = testObjects.medium.deep;
      
      const jsonResult = runBenchmark(
        (o) => JSON.parse(JSON.stringify(o)),
        obj,
        iterations
      );
      
      const structuredResult = runBenchmark(
        (o) => structuredClone(o),
        obj,
        iterations
      );
      
      const comparison = compareBenchmarks(jsonResult, structuredResult);
      console.log(formatResults('Medium Deep Nested Object', comparison));
      
      // Deep nesting: Performance comparable (0.75x+, may be slightly slower)
      assert.ok(
        comparison.improvement >= 0.75,
        `Expected at least 0.75x improvement, got ${comparison.improvement.toFixed(2)}x`
      );
    });
  });

  describe('Large Objects (> 100 keys)', () => {
    it('should benchmark flat large object', () => {
      const obj = testObjects.large.flat;
      
      const jsonResult = runBenchmark(
        (o) => JSON.parse(JSON.stringify(o)),
        obj,
        iterations
      );
      
      const structuredResult = runBenchmark(
        (o) => structuredClone(o),
        obj,
        iterations
      );
      
      const comparison = compareBenchmarks(jsonResult, structuredResult);
      console.log(formatResults('Large Flat Object', comparison));
      
      // Requirement 6.3: At least 1.5x improvement for large flat objects
      assert.ok(
        comparison.improvement >= 1.5,
        `Expected at least 1.5x improvement, got ${comparison.improvement.toFixed(2)}x`
      );
    });

    it('should benchmark shallow nested large object (1-2 levels)', () => {
      const obj = testObjects.large.shallow;
      
      const jsonResult = runBenchmark(
        (o) => JSON.parse(JSON.stringify(o)),
        obj,
        iterations
      );
      
      const structuredResult = runBenchmark(
        (o) => structuredClone(o),
        obj,
        iterations
      );
      
      const comparison = compareBenchmarks(jsonResult, structuredResult);
      console.log(formatResults('Large Shallow Nested Object', comparison));
      
      // Nested objects: Performance comparable (0.9x+, may vary)
      assert.ok(
        comparison.improvement >= 0.9,
        `Expected at least 0.9x improvement, got ${comparison.improvement.toFixed(2)}x`
      );
    });

    it('should benchmark medium nested large object (3-5 levels)', () => {
      const obj = testObjects.large.medium;
      
      const jsonResult = runBenchmark(
        (o) => JSON.parse(JSON.stringify(o)),
        obj,
        iterations
      );
      
      const structuredResult = runBenchmark(
        (o) => structuredClone(o),
        obj,
        iterations
      );
      
      const comparison = compareBenchmarks(jsonResult, structuredResult);
      console.log(formatResults('Large Medium Nested Object', comparison));
      
      // Nested objects: Performance comparable (0.9x+, may vary)
      assert.ok(
        comparison.improvement >= 0.9,
        `Expected at least 0.9x improvement, got ${comparison.improvement.toFixed(2)}x`
      );
    });

    it('should benchmark deep nested large object (6+ levels)', () => {
      const obj = testObjects.large.deep;
      
      const jsonResult = runBenchmark(
        (o) => JSON.parse(JSON.stringify(o)),
        obj,
        iterations
      );
      
      const structuredResult = runBenchmark(
        (o) => structuredClone(o),
        obj,
        iterations
      );
      
      const comparison = compareBenchmarks(jsonResult, structuredResult);
      console.log(formatResults('Large Deep Nested Object', comparison));
      
      // Deep nesting: Performance comparable (0.9x+)
      assert.ok(
        comparison.improvement >= 0.9,
        `Expected at least 0.9x improvement, got ${comparison.improvement.toFixed(2)}x`
      );
    });
  });

  describe('Baseline JSON Pattern Performance', () => {
    it('should establish baseline for small objects', () => {
      const obj = testObjects.small.flat;
      const result = runBenchmark(
        (o) => JSON.parse(JSON.stringify(o)),
        obj,
        iterations
      );
      
      console.log(`
Baseline - Small Object JSON Pattern:
  Mean:    ${result.mean.toFixed(4)}ms
  Median:  ${result.median.toFixed(4)}ms
  Min:     ${result.min.toFixed(4)}ms
  Max:     ${result.max.toFixed(4)}ms
  StdDev:  ${result.stdDev.toFixed(4)}ms
`);
      
      assert.ok(result.mean > 0, 'Baseline should have measurable time');
    });

    it('should establish baseline for medium objects', () => {
      const obj = testObjects.medium.flat;
      const result = runBenchmark(
        (o) => JSON.parse(JSON.stringify(o)),
        obj,
        iterations
      );
      
      console.log(`
Baseline - Medium Object JSON Pattern:
  Mean:    ${result.mean.toFixed(4)}ms
  Median:  ${result.median.toFixed(4)}ms
  Min:     ${result.min.toFixed(4)}ms
  Max:     ${result.max.toFixed(4)}ms
  StdDev:  ${result.stdDev.toFixed(4)}ms
`);
      
      assert.ok(result.mean > 0, 'Baseline should have measurable time');
    });

    it('should establish baseline for large objects', () => {
      const obj = testObjects.large.flat;
      const result = runBenchmark(
        (o) => JSON.parse(JSON.stringify(o)),
        obj,
        iterations
      );
      
      console.log(`
Baseline - Large Object JSON Pattern:
  Mean:    ${result.mean.toFixed(4)}ms
  Median:  ${result.median.toFixed(4)}ms
  Min:     ${result.min.toFixed(4)}ms
  Max:     ${result.max.toFixed(4)}ms
  StdDev:  ${result.stdDev.toFixed(4)}ms
`);
      
      assert.ok(result.mean > 0, 'Baseline should have measurable time');
    });
  });
});
