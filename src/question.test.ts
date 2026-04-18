// src/question.test.ts
//
// Tests for defineQuestionType — the single factory that ships in core.
// Exercises both its runtime shape and that userland-declared question
// types carry their answer types through the type system.

import { test, expect } from 'bun:test';
import { defineQuestionType } from './question-type.js';
import { text, radio, checkbox, nps } from './test-utils.js';

// ---- Runtime structure tests (userland types declared in test-utils) ----

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

// ---- defineQuestionType itself ----

test('defineQuestionType returns a usable factory', () => {
  interface MyConfig { readonly label: string }
  const slider = defineQuestionType<'slider', MyConfig, number>('slider');

  const q = slider({ label: 'Volume' });
  expect(q.kind).toBe('slider');
  expect(q.config).toEqual({ label: 'Volume' });
});

test('defineQuestionType preserves literal Kind on the runtime object', () => {
  const picker = defineQuestionType<'date-picker', { format: string }, string>('date-picker');
  const q = picker({ format: 'YYYY-MM-DD' });
  expect(q.kind).toBe('date-picker');
});

test('_answerType phantom field exists on produced QuestionDef', () => {
  const q = text({ placeholder: '' });
  // The field is part of the type-level protocol; at runtime it must at
  // least be enumerable on the object (undefined value is acceptable).
  expect('_answerType' in q).toBe(true);
});
