const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('./js/questions.js', 'utf8');
const start = source.indexOf('const DEBUGGING_SEED');
if (start < 0) {
  throw new Error('DEBUGGING_SEED is missing from js/questions.js');
}
const end = source.indexOf('const DEBUGGING_DIFFICULTY_COUNTS');
const extraction = source.slice(start, end >= 0 ? source.indexOf('if (DEBUGGING_DIFFICULTY_COUNTS', end) : source.length);
const sandbox = { console, globalThis: {} };
try {
  vm.runInNewContext(`${extraction}; globalThis.__debugging = DEBUGGING_QUESTIONS;`, sandbox);
} catch (error) {
  console.error('Failed to parse debugging question data:', error.message);
  process.exit(1);
}

const questions = sandbox.globalThis.__debugging || [];
if (!Array.isArray(questions)) {
  throw new Error('DEBUGGING_QUESTIONS is not an array');
}

if (questions.length !== 100) {
  throw new Error(`Expected 100 debugging questions, got ${questions.length}`);
}

const counts = { Easy: 0, Moderate: 0, Hard: 0 };
const ids = new Set();
const requiredFields = ['id','title','difficulty','topic','description','buggyCode','expectedBehavior','actualBehavior','tests','hints','solutionExplanation','starterCode','score','metadata'];

for (const q of questions) {
  if (ids.has(q.id)) throw new Error(`Duplicate debugging question ID: ${q.id}`);
  ids.add(q.id);
  if (!q || typeof q !== 'object') throw new Error(`Item is not an object: ${q}`);
  for (const field of requiredFields) {
    if (!(field in q)) throw new Error(`Missing field ${field} on question ${q.id}`);
  }
  if (!Array.isArray(q.tests) || q.tests.length === 0) throw new Error(`Question ${q.id} has no tests`);
  if (!Array.isArray(q.hints) || q.hints.length === 0) throw new Error(`Question ${q.id} has no hints`);
  if (!q.starterCode || typeof q.starterCode !== 'object') throw new Error(`Question ${q.id} has invalid starterCode`);
  counts[q.difficulty] = (counts[q.difficulty] || 0) + 1;
}

if (counts.Easy !== 35 || counts.Moderate !== 40 || counts.Hard !== 25) {
  throw new Error(`Difficulty distribution mismatch: ${JSON.stringify(counts)}`);
}

const originalCount = source.includes('const PROBLEMS');
if (!originalCount) {
  throw new Error('Original coding problem bank was not detected');
}

console.log(`Validated ${questions.length} debugging questions with distribution ${JSON.stringify(counts)}`);
