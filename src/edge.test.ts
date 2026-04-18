// src/edge.test.ts
import { test, expect } from 'bun:test';
import { when, otherwise, edge } from './edge.js';

test('when() creates a conditional edge', () => {
  const e = when(() => true, 'next_node');
  expect(e._type).toBe('when');
  expect(e.target).toBe('next_node');
  expect(e.condition({ initial: {}, answers: {}, answer: undefined })).toBe(true);
});

test('when() predicate receives context', () => {
  const e = when(
    (ctx) => ctx.initial.age >= 18,
    'adult',
  );
  expect(e.condition({ initial: { age: 20 }, answers: {}, answer: undefined })).toBe(true);
  expect(e.condition({ initial: { age: 15 }, answers: {}, answer: undefined })).toBe(false);
});

test('when() predicate can use answer', () => {
  const e = when(
    (ctx) => ctx.answer > 5,
    'high_score',
  );
  expect(e.condition({ initial: {}, answers: {}, answer: 8 })).toBe(true);
  expect(e.condition({ initial: {}, answers: {}, answer: 3 })).toBe(false);
});

test('otherwise() creates a fallback edge that always matches', () => {
  const e = otherwise('fallback');
  expect(e._type).toBe('otherwise');
  expect(e.target).toBe('fallback');
  expect(e.condition({ initial: {}, answers: {}, answer: undefined })).toBe(true);
});

test('edge() creates an unconditional edge', () => {
  const e = edge('next');
  expect(e._type).toBe('edge');
  expect(e.target).toBe('next');
  expect(e.condition({ initial: {}, answers: {}, answer: undefined })).toBe(true);
});

test('edge target is preserved as a literal type (runtime check)', () => {
  const e = edge('specific_id');
  expect(e.target).toBe('specific_id');
});
