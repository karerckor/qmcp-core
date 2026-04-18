// src/integration.test.ts
import { test, expect } from 'bun:test';
import { createGraph } from './graph.js';
import { entry, question, result, end } from './node.js';
import { text, radio, checkbox, nps, view } from './test-utils.js';
import { edge, when, otherwise } from './edge.js';

test('full survey: adult path', async () => {
  const survey = createGraph<{ name: string; age: number }>()([
    entry({
      title: ({ initial }) => `Hi, ${initial.name}!`,
      edges: [
        when(({ initial }) => initial.age >= 18, 'profession'),
        otherwise('school_subject'),
      ],
    }),
    question({
      id: 'profession',
      title: 'What is your profession?',
      question: text({ placeholder: 'e.g. developer' }),
      edges: [edge('food')],
    }),
    question({
      id: 'school_subject',
      title: 'Favourite school subject?',
      question: radio({
        options: [
          { label: 'Math', value: 'math' as const },
          { label: 'English', value: 'english' as const },
        ],
      }),
      edges: [edge('food')],
    }),
    question({
      id: 'food',
      title: 'Favourite cuisine?',
      question: checkbox({
        options: [
          { label: 'Italian', value: 'italian' as const },
          { label: 'Japanese', value: 'japanese' as const },
          { label: 'Georgian', value: 'georgian' as const },
        ],
      }),
      edges: [
        when<'sushi_result', ('italian' | 'japanese' | 'georgian')[]>(
          ({ answer }) => answer.includes('japanese'),
          'sushi_result',
        ),
        otherwise('generic_result'),
      ],
    }),
    question({
      id: 'rating',
      title: 'Rate our survey',
      question: nps({ min: 0, max: 10 }),
      edges: [
        when<'positive_result', number>(({ answer }) => answer >= 7, 'positive_result'),
        otherwise('generic_result'),
      ],
    }),
    view({
      id: 'info',
      title: 'About us',
      text: 'We are a survey company.',
      edges: [edge('rating')],
    }),
    result({ id: 'sushi_result', title: 'You love sushi!' }),
    result({ id: 'positive_result', title: 'Thank you!' }),
    result({ id: 'generic_result', title: 'Thanks for participating' }),
    end(),
  ]);

  const engine = survey.start({ name: 'Alice', age: 30 });
  expect(engine.currentNode._kind).toBe('entry');

  await engine.next();
  expect(engine.currentNode.id).toBe('profession');

  await engine.submit('developer');
  expect(engine.currentNode.id).toBe('food');

  await engine.submit(['japanese', 'italian']);
  expect(engine.currentNode.id).toBe('sushi_result');
  expect(engine.status).toBe('completed');

  expect(engine.getAnswer('profession')).toBe('developer');
  expect(engine.getAnswer('food')).toEqual(['japanese', 'italian']);
});

test('full survey: minor path', async () => {
  const survey = createGraph<{ name: string; age: number }>()([
    entry({
      title: 'Hi',
      edges: [
        when(({ initial }) => initial.age >= 18, 'profession'),
        otherwise('school_subject'),
      ],
    }),
    question({
      id: 'profession',
      title: 'Profession?',
      question: text({}),
      edges: [edge('food')],
    }),
    question({
      id: 'school_subject',
      title: 'Subject?',
      question: radio({
        options: [
          { label: 'Math', value: 'math' as const },
          { label: 'English', value: 'english' as const },
        ],
      }),
      edges: [edge('food')],
    }),
    question({
      id: 'food',
      title: 'Cuisine?',
      question: checkbox({
        options: [
          { label: 'Italian', value: 'italian' as const },
          { label: 'Japanese', value: 'japanese' as const },
        ],
      }),
      edges: [otherwise('generic_result')],
    }),
    result({ id: 'generic_result', title: 'Thanks!' }),
    end(),
  ]);

  const engine = survey.start({ name: 'Bob', age: 15 });
  await engine.next();
  expect(engine.currentNode.id).toBe('school_subject');

  await engine.submit('math');
  expect(engine.currentNode.id).toBe('food');

  await engine.submit(['italian']);
  expect(engine.currentNode.id).toBe('generic_result');
  expect(engine.status).toBe('completed');
});

test('navigation: back and re-answer', async () => {
  const survey = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);

  const engine = survey.start({});
  await engine.next();
  await engine.submit('first_answer');
  engine.back();

  expect(engine.currentNode.id).toBe('q1');
  expect(engine.getAnswer('q1')).toBe('first_answer');

  await engine.submit('second_answer');
  expect(engine.getAnswer('q1')).toBe('second_answer');
  expect(engine.currentNode.id).toBe('q2');
});

test('navigation: jumpTo and re-traverse', async () => {
  const survey = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('q3')] }),
    question({ id: 'q3', title: 'Q3', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);

  const engine = survey.start({});
  await engine.next();
  await engine.submit('a1');
  await engine.submit('a2');

  engine.jumpTo('q1');
  expect(engine.history).toEqual(['__entry__', 'q1']);

  expect(engine.getAnswer('q2')).toBe('a2');

  await engine.submit('a1_v2');
  expect(engine.getAnswer('q1')).toBe('a1_v2');
  expect(engine.currentNode.id).toBe('q2');
});

test('events fire correctly through full traversal', async () => {
  const survey = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);

  const engine = survey.start({});
  const events: string[] = [];

  engine.on('nodeEnter', (n) => events.push(`enter:${n.id}`));
  engine.on('nodeExit', (n) => events.push(`exit:${n.id}`));
  engine.on('complete', () => events.push('complete'));

  await engine.next();
  await engine.submit('x');

  expect(events).toEqual([
    'exit:__entry__',
    'enter:q1',
    'exit:q1',
    'enter:done',
    'complete',
  ]);
});

test('graph validation catches errors', () => {
  expect(() => {
    createGraph<{}>()([
      // @ts-expect-error — 'nonexistent' is not a valid node ID
      entry({ title: 'Hi', edges: [edge('nonexistent')] }),
      result({ id: 'done', title: 'Done' }),
      end(),
    ]);
  }).toThrow();
});

test('async edge predicate works end-to-end in a survey', async () => {
  // Userland scenario: gate a transition on an async check (e.g. HTTP call).
  const graph = createGraph<{ userId: string }>()([
    entry({
      title: 'Check eligibility',
      edges: [
        when(async ({ initial }) => {
          // Simulate async lookup.
          await new Promise((r) => setTimeout(r, 1));
          return initial.userId === 'vip';
        }, 'vip_result'),
        otherwise('regular_result'),
      ],
    }),
    result({ id: 'vip_result', title: 'VIP' }),
    result({ id: 'regular_result', title: 'Regular' }),
    end(),
  ]);

  const vipEngine = graph.start({ userId: 'vip' });
  await vipEngine.next();
  expect(vipEngine.currentNode.id).toBe('vip_result');

  const regEngine = graph.start({ userId: 'anon' });
  await regEngine.next();
  expect(regEngine.currentNode.id).toBe('regular_result');
});
