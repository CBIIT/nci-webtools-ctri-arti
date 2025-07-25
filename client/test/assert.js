class AssertionError extends Error {
  constructor(message, actual, expected, operator) {
    super(message);
    this.name = 'AssertionError';
    this.actual = actual;
    this.expected = expected;
    this.operator = operator;
    this.code = 'ERR_ASSERTION';
  }
}

function formatValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `'${value}'`;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

// Deep equality check
function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  
  return keysA.every(key => keysB.includes(key) && deepEqual(a[key], b[key]));
}

// Main assert function - checks truthiness
function assert(value, message) {
  if (!value) {
    throw new AssertionError(
      message || `The expression evaluated to a falsy value: ${formatValue(value)}`,
      value,
      true,
      '=='
    );
  }
}

// Alias for assert
assert.ok = assert;

// Strict equality
assert.strictEqual = function(actual, expected, message) {
  if (actual !== expected) {
    throw new AssertionError(
      message || `Expected values to be strictly equal:\n\nactual: ${formatValue(actual)}\nexpected: ${formatValue(expected)}`,
      actual,
      expected,
      'strictEqual'
    );
  }
};

// Deep equality
assert.deepStrictEqual = function(actual, expected, message) {
  if (!deepEqual(actual, expected)) {
    throw new AssertionError(
      message || `Expected values to be deeply equal:\n\nactual: ${formatValue(actual)}\nexpected: ${formatValue(expected)}`,
      actual,
      expected,
      'deepStrictEqual'
    );
  }
};

// Expect function to throw
assert.throws = function(fn, expected, message) {
  let error;
  
  try {
    fn();
    throw new AssertionError(
      message || 'Missing expected exception',
      undefined,
      expected,
      'throws'
    );
  } catch (e) {
    if (e instanceof AssertionError) throw e;
    error = e;
  }
  
  if (expected) {
    const isRegExp = expected instanceof RegExp;
    const isConstructor = typeof expected === 'function';
    
    if (isRegExp && !expected.test(error.message)) {
      throw new AssertionError(
        message || `The error message "${error.message}" does not match the regex ${expected}`,
        error.message,
        expected,
        'throws'
      );
    }
    
    if (isConstructor && !(error instanceof expected)) {
      throw new AssertionError(
        message || `The error is not an instance of ${expected.name}`,
        error.constructor.name,
        expected.name,
        'throws'
      );
    }
  }
};

// Expect async function to reject
assert.rejects = async function(asyncFn, expected, message) {
  let error;
  
  try {
    await asyncFn();
    throw new AssertionError(
      message || 'Missing expected rejection',
      undefined,
      expected,
      'rejects'
    );
  } catch (e) {
    if (e instanceof AssertionError) throw e;
    error = e;
  }
  
  if (expected) {
    const isRegExp = expected instanceof RegExp;
    const isConstructor = typeof expected === 'function';
    
    if (isRegExp && !expected.test(error.message)) {
      throw new AssertionError(
        message || `The error message "${error.message}" does not match the regex ${expected}`,
        error.message,
        expected,
        'rejects'
      );
    }
    
    if (isConstructor && !(error instanceof expected)) {
      throw new AssertionError(
        message || `The error is not an instance of ${expected.name}`,
        error.constructor.name,
        expected.name,
        'rejects'
      );
    }
  }
};

export default assert;