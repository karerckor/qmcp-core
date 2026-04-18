// src/types.test.ts
import { test, expect } from 'bun:test';
import type { ExtractAnswers, ExtractNodeIds } from './types.js';
import { createGraph } from './graph.js';
import { entry, question, result, end, defineNodeType } from './node.js';
import { text, radio, checkbox, nps } from './test-utils.js';
import { edge, when, otherwise } from './edge.js';

// ============================================================
// ExtractAnswers type tests
// ============================================================

test('ExtractAnswers extracts answer types from question nodes', () => {
  const nodes = [
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({
      id: 'q1',
      title: 'Name?',
      question: text({ placeholder: '' }),
      edges: [edge('q2')],
    }),
    question({
      id: 'q2',
      title: 'Pick one',
      question: radio({
        options: [
          { label: 'A', value: 'a' as const },
          { label: 'B', value: 'b' as const },
        ],
      }),
      edges: [edge('done')],
    }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ];

  type Answers = ExtractAnswers<typeof nodes>;
  const _check: Answers = {} as { q1: string; q2: 'a' | 'b' };
  expect(nodes).toHaveLength(5);
});

test('ExtractAnswers includes custom nodes with non-undefined _answerType', () => {
  // Userland: a custom node that captures a boolean answer.
  const consent = defineNodeType<'consent', { text: string }, boolean>({ kind: 'consent' });

  const nodes = [
    entry({ title: 'Hi', edges: [edge('gdpr')] }),
    consent({
      id: 'gdpr',
      text: 'Accept policy?',
      edges: [edge('done')],
    }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ];

  type Answers = ExtractAnswers<typeof nodes>;
  // This assignment fails until ExtractAnswers is extended to include
  // custom nodes' _answerType. The direction matters: we need Answers to
  // be ASSIGNABLE TO { gdpr: boolean } — i.e. Answers must already carry
  // the 'gdpr' key typed as boolean. With the current naive implementation
  // (question-only), Answers is `{}` and the assignment errors.
  const _check: { gdpr: boolean } = {} as Answers;
  expect(nodes).toHaveLength(4);
});

// ============================================================
// Node ID extraction type tests
// ============================================================

test('ExtractNodeIds extracts all node IDs', () => {
  const nodes = [
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({
      id: 'q1',
      title: 'Q?',
      question: text({}),
      edges: [edge('done')],
    }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ] as const;

  type Ids = ExtractNodeIds<typeof nodes>;

  const _id1: Ids = '__entry__';
  const _id2: Ids = 'q1';
  const _id3: Ids = 'done';
  const _id4: Ids = '__end__';

  // @ts-expect-error — 'nonexistent' is not a valid node ID
  const _bad: Ids = 'nonexistent';

  expect(true).toBe(true);
});

// ============================================================
// Question phantom type tests
// ============================================================

test('text() answer type is string', () => {
  const q = text({ placeholder: '' });
  const _check: string = q._answerType;
  expect(true).toBe(true);
});

test('radio() answer type matches option values', () => {
  const q = radio({
    options: [
      { label: 'A', value: 'a' as const },
      { label: 'B', value: 'b' as const },
    ],
  });
  const _check: 'a' | 'b' = q._answerType;
  expect(true).toBe(true);
});

test('checkbox() answer type is array of option values', () => {
  const q = checkbox({
    options: [
      { label: 'X', value: 1 as const },
      { label: 'Y', value: 2 as const },
    ],
  });
  const _check: (1 | 2)[] = q._answerType;
  expect(true).toBe(true);
});

test('nps() answer type is number', () => {
  const q = nps({ min: 0, max: 10 });
  const _check: number = q._answerType;
  expect(true).toBe(true);
});

// ============================================================
// Edge target compile-time validation
// ============================================================

test('createGraph rejects invalid edge targets at compile time', () => {
  expect(() =>
    createGraph<{}>()([
      // @ts-expect-error — 'nonexistent' is not a valid node ID
      entry({ title: 'Hi', edges: [edge('nonexistent')] }),
      question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
      result({ id: 'done', title: 'Done' }),
      end(),
    ]),
  ).toThrow('non-existent node');
});

test('createGraph accepts valid edge targets', () => {
  const _ok = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  expect(true).toBe(true);
});

// ============================================================
// DynamicValue Init typing
// ============================================================

test('DynamicValue callbacks get Init type from createGraph', () => {
  const _ok = createGraph<{ name: string; age: number }>()([
    entry({
      title: ({ initial }) => `Hi, ${initial.name}!`,
      edges: [edge('done')],
    }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  expect(true).toBe(true);
});

// ============================================================
// Edge predicate answer typing
// ============================================================

test('edge predicate answer is typed from question config', () => {
  const _ok = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({
      id: 'q1',
      title: 'Name?',
      question: text({}),
      edges: [
        when<'done', string>(({ answer }) => answer.length > 3, 'done'),
        otherwise('done'),
      ],
    }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  expect(true).toBe(true);
});
