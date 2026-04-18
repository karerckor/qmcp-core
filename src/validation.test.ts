// src/validation.test.ts
import { test, expect } from 'bun:test';
import { validateGraph } from './validation.js';
import { welcome, question, view, result, end } from './node.js';
import { text } from './question.js';
import { edge, when, otherwise } from './edge.js';
import type { AnyNodeDef } from './types.js';

function errorCodes(nodes: readonly AnyNodeDef[]): string[] {
  return validateGraph(nodes)
    .filter((e) => e.severity === 'error')
    .map((e) => e.code);
}

function warningCodes(nodes: readonly AnyNodeDef[]): string[] {
  return validateGraph(nodes)
    .filter((e) => e.severity === 'warning')
    .map((e) => e.code);
}

test('valid simple graph produces no errors', () => {
  const errors = validateGraph([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const errs = errors.filter((e) => e.severity === 'error');
  expect(errs).toHaveLength(0);
});

test('DUPLICATE_ID: two nodes with same id', () => {
  const codes = errorCodes([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q1b')] }),
    question({ id: 'q1', title: 'Q1 again', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  expect(codes).toContain('DUPLICATE_ID');
});

test('MISSING_TARGET: edge points to non-existent node', () => {
  const codes = errorCodes([
    welcome({ title: 'Hi', edges: [edge('nonexistent')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  expect(codes).toContain('MISSING_TARGET');
});

test('WELCOME_POSITION: welcome is not the first node', () => {
  const codes = errorCodes([
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }) as AnyNodeDef,
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  expect(codes).toContain('WELCOME_POSITION');
});

test('END_POSITION: end is not the last node', () => {
  const codes = errorCodes([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    end(),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
  ]);
  expect(codes).toContain('END_POSITION');
});

test('OTHERWISE_POSITION: otherwise is not the last edge', () => {
  const codes = errorCodes([
    welcome({
      title: 'Hi',
      edges: [
        otherwise('q1'),
        when(() => true, 'q2'),
      ],
    }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('done')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  expect(codes).toContain('OTHERWISE_POSITION');
});

test('ORPHAN_NODE: node with no incoming edges', () => {
  const codes = warningCodes([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('done')] }),
    question({ id: 'orphan', title: 'Orphan', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  expect(codes).toContain('ORPHAN_NODE');
});

test('NO_TERMINAL_PATH: no path reaches result or end', () => {
  const codes = warningCodes([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('q1')] }),
    result({ id: 'unreachable', title: 'Never reached' }),
    end(),
  ]);
  expect(codes).toContain('NO_TERMINAL_PATH');
});
