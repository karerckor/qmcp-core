// src/question.test.ts
import { test, expect } from 'bun:test';
import { text, radio, checkbox, nps } from './question.js';

// ---- Runtime structure tests ----

test('text() returns a QuestionDef with kind "text"', () => {
  const q = text({ placeholder: 'Enter name' });
  expect(q.kind).toBe('text');
  expect(q.config).toEqual({ placeholder: 'Enter name' });
});

test('text() with all options', () => {
  const q = text({ placeholder: 'Name', min: 2, max: 100, required: true });
  expect(q.config.min).toBe(2);
  expect(q.config.max).toBe(100);
  expect(q.config.required).toBe(true);
});

test('radio() returns a QuestionDef with kind "radio"', () => {
  const q = radio({
    options: [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
    ],
  });
  expect(q.kind).toBe('radio');
  expect(q.config.options).toHaveLength(2);
});

test('checkbox() returns a QuestionDef with kind "checkbox"', () => {
  const q = checkbox({
    options: [
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b' },
    ],
  });
  expect(q.kind).toBe('checkbox');
  expect(q.config.options).toHaveLength(2);
});

test('nps() returns a QuestionDef with kind "nps"', () => {
  const q = nps({ min: 0, max: 10 });
  expect(q.kind).toBe('nps');
  expect(q.config.min).toBe(0);
  expect(q.config.max).toBe(10);
});

// ---- Phantom type tests (compile-time only) ----
test('text()._answerType is a string at runtime', () => {
  const q = text({ placeholder: '' });
  expect(typeof q._answerType).toBe('string');
});

test('radio()._answerType exists', () => {
  const q = radio({ options: [{ label: 'A', value: 42 }] });
  expect(q).toHaveProperty('_answerType');
});

test('checkbox()._answerType is an array', () => {
  const q = checkbox({ options: [{ label: 'A', value: 'a' }] });
  expect(Array.isArray(q._answerType)).toBe(true);
});

test('nps()._answerType is a number', () => {
  const q = nps({ min: 0, max: 10 });
  expect(typeof q._answerType).toBe('number');
});
