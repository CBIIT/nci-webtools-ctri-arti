// Test harness with Jest-style API
export const suites = [];
let currentSuite = null;

export function describe(name, fn) {
  const suite = { name, tests: [], beforeEachFns: [], afterEachFns: [] };
  suites.push(suite);
  const prev = currentSuite;
  currentSuite = suite;
  fn();
  currentSuite = prev;
}

describe.skip = function(name, fn) {
  // Just log that the suite was skipped, don't add it to suites
  console.log(`[SKIP] Suite skipped: ${name}`);
};

export function it(name, fn) {
  if (!currentSuite) throw new Error('`it` must be inside `describe`');
  currentSuite.tests.push({ name, fn });
}

export const test = it;

// Utility for waiting until a condition is met with exponential backoff
export async function waitFor(conditionFn, timeout = 1000) {
  const startTime = Date.now();
  
  // Check immediately first
  if (conditionFn()) {
    return;
  }
  
  // Start with super small wait, then exponentially increase
  let waitTime = 1; // Start at 1ms
  
  while (Date.now() - startTime < timeout) {
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    if (conditionFn()) {
      return;
    }
    
    // Exponential backoff: 1ms -> 2ms -> 4ms -> 8ms -> 16ms -> cap at 50ms
    waitTime = Math.min(waitTime * 2, 50);
  }
  
  throw new Error(`waitFor timeout after ${timeout}ms`);
}

export function beforeEach(fn) {
  if (!currentSuite) throw new Error('`beforeEach` must be inside `describe`');
  currentSuite.beforeEachFns.push(fn);
}

export function afterEach(fn) {
  if (!currentSuite) throw new Error('`afterEach` must be inside `describe`');
  currentSuite.afterEachFns.push(fn);
}

// Helper function to detect asymmetric matchers
function isAsymmetricMatcher(obj) {
  return obj && typeof obj === 'object' && typeof obj.asymmetricMatch === 'function';
}

export function expect(received) {
  return {
    toBe(expected) {
      if (received !== expected) 
        throw new Error(`Expected ${received} to be ${expected}`);
    },
    toEqual(expected) {
      if (isAsymmetricMatcher(expected)) {
        if (!expected.asymmetricMatch(received))
          throw new Error(`Expected ${JSON.stringify(received)} to match ${expected.toString()}`);
      } else if (JSON.stringify(received) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(received)} to equal ${JSON.stringify(expected)}`);
      }
    },
    toContain(sub) {
      if (typeof received === 'string' && !received.includes(sub))
        throw new Error(`Expected "${received}" to contain "${sub}"`);
      if (Array.isArray(received) && !received.includes(sub))
        throw new Error(`Expected array to contain ${sub}`);
    },
    toHaveLength(expected) {
      if (received.length !== expected)
        throw new Error(`Expected length ${received.length} to be ${expected}`);
    },
    toBeTruthy() {
      if (!received) 
        throw new Error(`Expected ${received} to be truthy`);
    },
    toBeFalsy() {
      if (received) 
        throw new Error(`Expected ${received} to be falsy`);
    },
    toBeNull() {
      if (received !== null) 
        throw new Error(`Expected ${received} to be null`);
    },
    toBeUndefined() {
      if (received !== undefined) 
        throw new Error(`Expected ${received} to be undefined`);
    },
    toBeDefined() {
      if (received === undefined) 
        throw new Error(`Expected value to be defined`);
    },
    toThrow(expectedMessage) {
      try {
        received();
        throw new Error(`Expected function to throw`);
      } catch (e) {
        if (expectedMessage && !e.message.includes(expectedMessage)) {
          throw new Error(`Expected error message to contain "${expectedMessage}" but got "${e.message}"`);
        }
      }
    },
    toHaveBeenCalled() {
      if (!received.__called) 
        throw new Error(`Expected function to have been called`);
    },
    toHaveBeenCalledWith(...args) {
      if (!received.__called) 
        throw new Error(`Expected function to have been called`);
      if (JSON.stringify(received.__lastArgs) !== JSON.stringify(args))
        throw new Error(`Expected function to have been called with ${JSON.stringify(args)}`);
    },
    toHaveBeenCalledTimes(expected) {
      if (received.__callCount !== expected)
        throw new Error(`Expected function to have been called ${expected} times but was called ${received.__callCount} times`);
    },
    toHaveProperty(prop, value) {
      if (Array.isArray(prop)) {
        let current = received;
        for (const key of prop) {
          if (typeof current !== 'object' || current === null || !(key in current))
            throw new Error(`Expected object to have property path [${prop.join(', ')}]`);
          current = current[key];
        }
        if (value !== undefined && JSON.stringify(current) !== JSON.stringify(value))
          throw new Error(`Expected property path [${prop.join(', ')}] to be ${JSON.stringify(value)} but got ${JSON.stringify(current)}`);
      } else if (prop.includes('.')) {
        const keys = prop.split('.');
        let current = received;
        for (const key of keys) {
          if (typeof current !== 'object' || current === null || !(key in current))
            throw new Error(`Expected object to have property "${prop}"`);
          current = current[key];
        }
        if (value !== undefined && JSON.stringify(current) !== JSON.stringify(value))
          throw new Error(`Expected property "${prop}" to be ${JSON.stringify(value)} but got ${JSON.stringify(current)}`);
      } else {
        if (!(prop in received))
          throw new Error(`Expected object to have property "${prop}"`);
        if (value !== undefined && JSON.stringify(received[prop]) !== JSON.stringify(value))
          throw new Error(`Expected property "${prop}" to be ${JSON.stringify(value)} but got ${JSON.stringify(received[prop])}`);
      }
    },
    toMatch(pattern) {
      if (!pattern.test(received))
        throw new Error(`Expected "${received}" to match ${pattern}`);
    },
    toBeInstanceOf(constructor) {
      if (!(received instanceof constructor))
        throw new Error(`Expected value to be instance of ${constructor.name}`);
    },
    toBeLessThan(expected) {
      if (received >= expected)
        throw new Error(`Expected ${received} to be less than ${expected}`);
    },
    toBeGreaterThan(expected) {
      if (received <= expected)
        throw new Error(`Expected ${received} to be greater than ${expected}`);
    },
    toBeLessThanOrEqual(expected) {
      if (received > expected)
        throw new Error(`Expected ${received} to be less than or equal to ${expected}`);
    },
    toBeGreaterThanOrEqual(expected) {
      if (received < expected)
        throw new Error(`Expected ${received} to be greater than or equal to ${expected}`);
    },
    toBeNaN() {
      if (!Number.isNaN(received))
        throw new Error(`Expected ${received} to be NaN`);
    },
    toBeCloseTo(expected, numDigits = 2) {
      const precision = Math.pow(10, -numDigits) / 2;
      if (Math.abs(received - expected) >= precision)
        throw new Error(`Expected ${received} to be close to ${expected}`);
    },
    toContainEqual(item) {
      if (!Array.isArray(received))
        throw new Error(`Expected array but received ${typeof received}`);
      const found = received.some(element => {
        try {
          return JSON.stringify(element) === JSON.stringify(item);
        } catch {
          return false;
        }
      });
      if (!found)
        throw new Error(`Expected array to contain equal item ${JSON.stringify(item)}`);
    },
    toStrictEqual(expected) {
      if (received === null && expected === null) return;
      if (received === undefined && expected === undefined) return;
      if (typeof received !== typeof expected)
        throw new Error(`Expected types to match: ${typeof received} !== ${typeof expected}`);
      if (received?.constructor !== expected?.constructor)
        throw new Error(`Expected constructors to match`);
      if (JSON.stringify(received) !== JSON.stringify(expected))
        throw new Error(`Expected ${JSON.stringify(received)} to strictly equal ${JSON.stringify(expected)}`);
    },
    toMatchObject(expected) {
      if (typeof received !== 'object' || received === null)
        throw new Error(`Expected object but received ${typeof received}`);
      for (const key in expected) {
        if (!(key in received))
          throw new Error(`Expected object to have property "${key}"`);
        if (JSON.stringify(received[key]) !== JSON.stringify(expected[key]))
          throw new Error(`Expected property "${key}" to match`);
      }
    },
    not: {
      toBe(expected) {
        if (received === expected) 
          throw new Error(`Expected ${received} not to be ${expected}`);
      },
      toContain(sub) {
        if (typeof received === 'string' && received.includes(sub))
          throw new Error(`Expected "${received}" not to contain "${sub}"`);
        if (Array.isArray(received) && received.includes(sub))
          throw new Error(`Expected array not to contain ${sub}`);
      },
      toBeTruthy() {
        if (received) 
          throw new Error(`Expected ${received} not to be truthy`);
      },
      toBeNull() {
        if (received === null) 
          throw new Error(`Expected ${received} not to be null`);
      },
      toThrow(expectedMessage) {
        try {
          received();
          // If we get here, function didn't throw, which is what we want for .not.toThrow()
        } catch (e) {
          throw new Error(`Expected function not to throw but it threw: ${e.message}`);
        }
      },
      toEqual(expected) {
        if (JSON.stringify(received) === JSON.stringify(expected))
          throw new Error(`Expected ${JSON.stringify(received)} not to equal ${JSON.stringify(expected)}`);
      },
      toMatchObject(expected) {
        if (typeof received !== 'object' || received === null) return;
        let matches = true;
        try {
          for (const key in expected) {
            if (!(key in received)) {
              matches = false;
              break;
            }
            if (JSON.stringify(received[key]) !== JSON.stringify(expected[key])) {
              matches = false;
              break;
            }
          }
          if (matches)
            throw new Error(`Expected object not to match`);
        } catch (e) {
          if (e.message === 'Expected object not to match') throw e;
          // Other errors mean it doesn't match, which is what we want
        }
      },
      toContainEqual(item) {
        if (!Array.isArray(received)) return;
        const found = received.some(element => {
          try {
            return JSON.stringify(element) === JSON.stringify(item);
          } catch {
            return false;
          }
        });
        if (found)
          throw new Error(`Expected array not to contain equal item ${JSON.stringify(item)}`);
      },
      toStrictEqual(expected) {
        if (received === null && expected === null) {
          throw new Error(`Expected values not to be strictly equal`);
        }
        if (received === undefined && expected === undefined) {
          throw new Error(`Expected values not to be strictly equal`);
        }
        if (typeof received === typeof expected &&
            received?.constructor === expected?.constructor &&
            JSON.stringify(received) === JSON.stringify(expected)) {
          throw new Error(`Expected ${JSON.stringify(received)} not to strictly equal ${JSON.stringify(expected)}`);
        }
      }
    },
    // Promise-based matchers
    resolves: {
      toBe(expected) {
        return received.then(
          (value) => {
            if (value !== expected)
              throw new Error(`Expected promise to resolve to ${expected} but got ${value}`);
          },
          (error) => {
            throw new Error(`Expected promise to resolve but it rejected with: ${error.message}`);
          }
        );
      },
      toEqual(expected) {
        return received.then(
          (value) => {
            if (JSON.stringify(value) !== JSON.stringify(expected))
              throw new Error(`Expected promise to resolve to ${JSON.stringify(expected)} but got ${JSON.stringify(value)}`);
          },
          (error) => {
            throw new Error(`Expected promise to resolve but it rejected with: ${error.message}`);
          }
        );
      },
      toThrow(expectedMessage) {
        return received.then(
          () => { throw new Error(`Expected promise to reject but it resolved`); },
          (error) => {
            if (expectedMessage && !error.message.includes(expectedMessage)) {
              throw new Error(`Expected error message to contain "${expectedMessage}" but got "${error.message}"`);
            }
          }
        );
      }
    },
    rejects: {
      toThrow(expectedMessage) {
        return received.then(
          () => { throw new Error(`Expected promise to reject but it resolved`); },
          (error) => {
            if (expectedMessage && !error.message.includes(expectedMessage)) {
              throw new Error(`Expected error message to contain "${expectedMessage}" but got "${error.message}"`);
            }
            return true;
          }
        );
      },
      toEqual(expected) {
        return received.then(
          () => { throw new Error(`Expected promise to reject but it resolved`); },
          (error) => {
            if (JSON.stringify(error) !== JSON.stringify(expected)) {
              throw new Error(`Expected rejection to equal ${JSON.stringify(expected)} but got ${JSON.stringify(error)}`);
            }
            return true;
          }
        );
      }
    }
  };
}

// Asymmetric matchers
const asymmetricMatchers = {
  anything() {
    return {
      asymmetricMatch: (other) => other != null,
      toString: () => 'anything()'
    };
  },
  any(constructor) {
    return {
      asymmetricMatch: (other) => {
        if (constructor === String) return typeof other === 'string';
        if (constructor === Number) return typeof other === 'number';
        if (constructor === Boolean) return typeof other === 'boolean';
        if (constructor === Object) return typeof other === 'object' && other !== null;
        if (constructor === Array) return Array.isArray(other);
        return other instanceof constructor;
      },
      toString: () => `any(${constructor.name})`
    };
  },
  arrayContaining(array) {
    return {
      asymmetricMatch: (other) => {
        if (!Array.isArray(other)) return false;
        return array.every(item => other.includes(item));
      },
      toString: () => `arrayContaining(${JSON.stringify(array)})`
    };
  },
  objectContaining(object) {
    return {
      asymmetricMatch: (other) => {
        if (typeof other !== 'object' || other === null) return false;
        for (const key in object) {
          if (!(key in other) || JSON.stringify(other[key]) !== JSON.stringify(object[key])) {
            return false;
          }
        }
        return true;
      },
      toString: () => `objectContaining(${JSON.stringify(object)})`
    };
  },
  stringContaining(string) {
    return {
      asymmetricMatch: (other) => typeof other === 'string' && other.includes(string),
      toString: () => `stringContaining("${string}")`
    };
  },
  stringMatching(regexp) {
    return {
      asymmetricMatch: (other) => {
        if (typeof other !== 'string') return false;
        if (typeof regexp === 'string') return other.includes(regexp);
        return regexp.test(other);
      },
      toString: () => `stringMatching(${regexp})`
    };
  },
  closeTo(number, numDigits = 2) {
    return {
      asymmetricMatch: (other) => {
        if (typeof other !== 'number') return false;
        const precision = Math.pow(10, -numDigits) / 2;
        return Math.abs(other - number) < precision;
      },
      toString: () => `closeTo(${number}, ${numDigits})`
    };
  }
};

// Add 'not' versions
asymmetricMatchers.not = {
  arrayContaining(array) {
    return {
      asymmetricMatch: (other) => !asymmetricMatchers.arrayContaining(array).asymmetricMatch(other),
      toString: () => `not.arrayContaining(${JSON.stringify(array)})`
    };
  },
  objectContaining(object) {
    return {
      asymmetricMatch: (other) => !asymmetricMatchers.objectContaining(object).asymmetricMatch(other),
      toString: () => `not.objectContaining(${JSON.stringify(object)})`
    };
  },
  stringContaining(string) {
    return {
      asymmetricMatch: (other) => !asymmetricMatchers.stringContaining(string).asymmetricMatch(other),
      toString: () => `not.stringContaining("${string}")`
    };
  },
  stringMatching(regexp) {
    return {
      asymmetricMatch: (other) => !asymmetricMatchers.stringMatching(regexp).asymmetricMatch(other),
      toString: () => `not.stringMatching(${regexp})`
    };
  }
};

// Jest mock functions
export const jest = {
  fn(implementation) {
    const mockFn = function(...args) {
      mockFn.__called = true;
      mockFn.__lastArgs = args;
      mockFn.__callCount = (mockFn.__callCount || 0) + 1;
      mockFn.__allCalls = mockFn.__allCalls || [];
      mockFn.__allCalls.push(args);
      if (implementation) return implementation(...args);
    };
    mockFn.__called = false;
    mockFn.__callCount = 0;
    mockFn.__allCalls = [];
    mockFn.mockClear = () => {
      mockFn.__called = false;
      mockFn.__callCount = 0;
      mockFn.__lastArgs = undefined;
      mockFn.__allCalls = [];
    };
    mockFn.mockResolvedValue = (value) => {
      mockFn.__implementation = () => Promise.resolve(value);
      return mockFn;
    };
    mockFn.mockImplementation = (impl) => {
      mockFn.__implementation = impl;
      return mockFn;
    };
    mockFn.mock = {
      get calls() { return mockFn.__allCalls || []; }
    };
    return mockFn;
  }
};

// Add asymmetric matchers to expect
expect.anything = asymmetricMatchers.anything;
expect.any = asymmetricMatchers.any;
expect.arrayContaining = asymmetricMatchers.arrayContaining;
expect.objectContaining = asymmetricMatchers.objectContaining;
expect.stringContaining = asymmetricMatchers.stringContaining;
expect.stringMatching = asymmetricMatchers.stringMatching;
expect.closeTo = asymmetricMatchers.closeTo;
expect.not = asymmetricMatchers.not;

// Make available globally for convenience
window.describe = describe;
window.it = it;
window.test = test;
window.expect = expect;
window.beforeEach = beforeEach;
window.afterEach = afterEach;
window.jest = jest;
window.waitFor = waitFor;

// Global test context for network event tracking
window.CURRENT_TEST = null;
window.PENDING_REQUESTS = new Set();

// Test runner
export async function runTests() {
  let failures = 0;
  let total = 0;
  const startTime = Date.now();
  const failedTests = [];
  
  for (let i = 0; i < suites.length; i++) {
    const suite = suites[i];
    if (i > 0) console.log(''); // Add blank line between suites
    console.log(`[SUITE] ${i + 1}/${suites.length} ${suite.name}`);

    let suiteFailures = 0;
    let suiteTotal = 0;
    
    for (let j = 0; j < suite.tests.length; j++) {
      const test = suite.tests[j];
      total++;
      suiteTotal++;
      const testStartTime = Date.now();
      
      try {
        // Set current test context for network event tracking
        window.CURRENT_TEST = { suite: suite.name, test: test.name };
        
        // Run beforeEach hooks
        for (const beforeEach of suite.beforeEachFns) {
          await beforeEach();
        }
        
        // Run test
        await test.fn();
        
        // Give SolidJS reactive effects a chance to initiate (like createResource)
        await new Promise(resolve => setTimeout(resolve, 1));
        
        // Now wait for actual pending requests to complete
        let waitCount = 0;
        const maxWaitTime = 50; // 500ms max
        while (window.PENDING_REQUESTS.size > 0 && waitCount < maxWaitTime) {
          if (waitCount === 0) {
            console.log(`  🕐 Waiting for ${window.PENDING_REQUESTS.size} pending network requests...`);
          }
          await new Promise(resolve => setTimeout(resolve, 10));
          waitCount++;
        }
        
        if (window.PENDING_REQUESTS.size > 0) {
          console.log(`  ⚠️  Timeout: ${window.PENDING_REQUESTS.size} requests still pending after ${waitCount * 10}ms`);
          // Clear pending requests to avoid affecting next test
          window.PENDING_REQUESTS.clear();
        } else if (waitCount > 0) {
          console.log(`  ✅ All network requests completed (waited ${waitCount * 10}ms)`);
        }
        
        const testTime = Date.now() - testStartTime;
        const timeIndicator = testTime > 50 ? ` (${testTime}ms)` : '';
        console.log(`  > ${j + 1}/${suite.tests.length} ${test.name}${timeIndicator}`);
        
        // Run afterEach hooks
        for (const afterEach of suite.afterEachFns) {
          await afterEach();
        }
        
        // Clear test context
        window.CURRENT_TEST = null;
      } catch (err) {
        failures++;
        suiteFailures++;
        const testTime = Date.now() - testStartTime;
        failedTests.push({ suite: suite.name, test: test.name, error: err.message, time: testTime });
        console.error(`  x ${j + 1}/${suite.tests.length} ${test.name} (${testTime}ms)`);
        console.error(`       ${err.message}`);
        // Only show relevant stack trace lines
        if (err.stack) {
          const relevantLines = err.stack.split('\n')
            .filter(line => line.includes('.test.js') || line.includes('test/index.js'))
            .slice(0, 2);
          if (relevantLines.length > 0) {
            relevantLines.forEach(line => console.error(`       ${line.trim()}`));
          }
        }
      }
    }

    // Only show detailed suite summary if there were failures
    if (suiteFailures > 0) {
      const passed = suiteTotal - suiteFailures;
      console.log(`[SUITE] ${suite.name}: ${passed} passed, ${suiteFailures} failed, ${suiteTotal} total`);
    }
  }
  
  const totalTime = Date.now() - startTime;
  const passed = total - failures;
  const passRate = Math.round((passed / total) * 100);
  
  console.log(`\nTests: ${passed} passed, ${failures} failed, ${total} total (${passRate}%) - ${totalTime}ms`);
  
  // Summary of failed tests if any
  if (failedTests.length > 0) {
    console.log('\nFailed Tests Summary:');
    failedTests.forEach(({ suite, test, error }) => {
      console.log(`  • ${suite} > ${test}: ${error}`);
    });
  }
  
  return { failures, total, passed, failedTests, totalTime };
}