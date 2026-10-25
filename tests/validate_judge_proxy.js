'use strict';

const assert = require('assert');
const { normalizeOutput, outputsEqual, cleanSourceCode, classify } = require('../server');

const b64 = (value) => Buffer.from(value).toString('base64');

assert.strictEqual(normalizeOutput('  1  \r\n2   \r\n'), '1\n2');
assert.strictEqual(cleanSourceCode('```python\nprint("hello")\n```'), 'print("hello")');
assert.strictEqual(cleanSourceCode('print("```")'), 'print("```")');
assert.strictEqual(cleanSourceCode('```python\nprint("hello")\n```\nextra'), '```python\nprint("hello")\n```\nextra');
assert.strictEqual(outputsEqual(' {"a": 1, "b": [2]} \n', '{"b":[2],"a":1}'), true);
assert.strictEqual(outputsEqual('1.0000000001', '1'), true);
assert.strictEqual(outputsEqual('[1,2]', '[2,1]'), false);
assert.strictEqual(outputsEqual('[["a","b"],["c"]]', '[["c"],["a","b"]]', { unorderedTopLevelArray: true }), true);
assert.strictEqual(outputsEqual('[[1,2],[3]]', '[[2,1],[3]]', { unorderedTopLevelArray: true }), false);
assert.strictEqual(outputsEqual('[1,1,2]', '[1,2,2]', { unorderedTopLevelArray: true }), false);
assert.strictEqual(outputsEqual('hello world', 'hello  world'), false);
assert.strictEqual(classify({ status: { id: 6, description: 'Compilation Error' }, compile_output: b64('syntax error') }).verdict, 'Compilation Error');
assert.strictEqual(classify({ status: { id: 5, description: 'Time Limit Exceeded' } }).verdict, 'Time Limit Exceeded');
assert.strictEqual(classify({ status: { id: 7, description: 'Runtime Error' }, stderr: b64('crashed') }).verdict, 'Runtime Error');
assert.strictEqual(classify({ status: { id: 3, description: 'Accepted' } }).verdict, 'Accepted');
assert.strictEqual(classify({ status: { id: 11, description: 'Runtime Error (NZEC)' } }).verdict, 'Runtime Error');

console.log('Validated judge output normalization and Judge0 verdict classification');
