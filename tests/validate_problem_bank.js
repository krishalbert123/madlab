'use strict';

const assert = require('assert');
const { PROBLEMS } = require('../js/questions');

assert.strictEqual(PROBLEMS.length, 100, 'the bank should contain exactly 100 problems');
assert.deepStrictEqual(
  PROBLEMS.map((problem) => problem.id).sort((left, right) => left - right),
  Array.from({ length: 100 }, (_, index) => index + 1),
  'problem IDs should cover 1 through 100 exactly once'
);

const incomplete = [];
const placeholder = /see description|valid solved board|solved board|max square area|flattened list|each level connected|valid order|\b\d+ solutions?\b|\.\.\.(?:\s*[\],}]|$)|\b\d+ (?:combinations|permutations)\b/i;
for (const problem of PROBLEMS) {
  if (!Array.isArray(problem.tc) || problem.tc.length === 0) {
    incomplete.push(`${problem.id}: missing test cases`);
    continue;
  }
  for (const test of problem.tc) {
    if (typeof test.i !== 'string' || typeof test.o !== 'string' ||
      (test.unordered !== undefined && typeof test.unordered !== 'boolean') ||
      placeholder.test(`${test.i} ${test.o}`)) {
      incomplete.push(`${problem.id}: incomplete test case`);
    }
  }
}
assert.deepStrictEqual(incomplete, [], 'test cases must contain string inputs and expected outputs, not placeholders');

console.log(`Validated ${PROBLEMS.length} problem IDs and non-placeholder test-case metadata`);
