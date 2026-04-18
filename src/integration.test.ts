// src/integration.test.ts
import { test, expect } from 'bun:test';
import { createGraph } from './graph.js';
import { welcome, question, view, result, end } from './node.js';
import { text, radio, checkbox, nps } from './question.js';
import { edge, when, otherwise } from './edge.js';

test('full survey: adult path', () => {
  const survey = createGraph<{ name: string; age: number }>()([
    welcome({
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
        when(
          ({ answer }: any) => answer.includes('japanese'),
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
        when(({ answer }: any) => answer >= 7, 'positive_result'),
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

  // Adult path: welcome -> profession -> food -> sushi_result
  const engine = survey.start({ name: 'Alice', age: 30 });
  expect(engine.currentNode._kind).toBe('welcome');

  engine.next();
  expect(engine.currentNode.id).toBe('profession');

  engine.submit('developer');
  expect(engine.currentNode.id).toBe('food');

  engine.submit(['japanese', 'italian']);
  expect(engine.currentNode.id).toBe('sushi_result');
  expect(engine.status).toBe('completed');

  expect(engine.getAnswer('profession')).toBe('developer');
  expect(engine.getAnswer('food')).toEqual(['japanese', 'italian']);
});

test('full survey: minor path', () => {
  const survey = createGraph<{ name: string; age: number }>()([
    welcome({
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

  // Minor path: welcome -> school_subject -> food -> generic_result
  const engine = survey.start({ name: 'Bob', age: 15 });
  engine.next();
  expect(engine.currentNode.id).toBe('school_subject');

  engine.submit('math');
  expect(engine.currentNode.id).toBe('food');

  engine.submit(['italian']);
  expect(engine.currentNode.id).toBe('generic_result');
  expect(engine.status).toBe('completed');
});

test('navigation: back and re-answer', () => {
  const survey = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);

  const engine = survey.start({});
  engine.next();        // -> q1
  engine.submit('first_answer');  // -> q2
  engine.back();        // -> q1

  expect(engine.currentNode.id).toBe('q1');
  expect(engine.getAnswer('q1')).toBe('first_answer');

  // Re-answer q1 with different value
  engine.submit('second_answer');
  expect(engine.getAnswer('q1')).toBe('second_answer');
  expect(engine.currentNode.id).toBe('q2');
});

test('navigation: jumpTo and re-traverse', () => {
  const survey = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('q3')] }),
    question({ id: 'q3', title: 'Q3', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);

  const engine = survey.start({});
  engine.next();        // -> q1
  engine.submit('a1');  // -> q2
  engine.submit('a2');  // -> q3

  engine.jumpTo('q1');
  expect(engine.history).toEqual(['__welcome__', 'q1']);

  // Old answers are still accessible
  expect(engine.getAnswer('q2')).toBe('a2');

  // Re-traverse from q1
  engine.submit('a1_v2'); // -> q2
  expect(engine.getAnswer('q1')).toBe('a1_v2');
  expect(engine.currentNode.id).toBe('q2');
});

test('events fire correctly through full traversal', () => {
  const survey = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);

  const engine = survey.start({});
  const events: string[] = [];

  engine.on('nodeEnter', (n: any) => events.push(`enter:${n.id}`));
  engine.on('nodeExit', (n: any) => events.push(`exit:${n.id}`));
  engine.on('complete', () => events.push('complete'));

  engine.next();         // exit welcome, enter q1
  engine.submit('x');    // exit q1, enter done, complete

  expect(events).toEqual([
    'exit:__welcome__',
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
      welcome({ title: 'Hi', edges: [edge('nonexistent')] }),
      result({ id: 'done', title: 'Done' }),
      end(),
    ]);
  }).toThrow();
});
