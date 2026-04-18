// src/node.test.ts
import { test, expect } from 'bun:test';
import { entry, question, result, end } from './node.js';
import { text, view } from './test-utils.js';
import { edge } from './edge.js';

test('entry() produces an EntryNodeDef', () => {
  const n = entry({
    title: 'Hello!',
    edges: [edge('next')],
  });
  expect(n._kind).toBe('entry');
  expect(n.id).toBe('__entry__');
  expect(n.title).toBe('Hello!');
  expect(n.edges).toHaveLength(1);
});

test('entry() with dynamic title', () => {
  const n = entry({
    title: ({ initial }) => `Hi, ${(initial as { name: string }).name}`,
    edges: [edge('next')],
  });
  expect(n._kind).toBe('entry');
  expect(typeof n.title).toBe('function');
});

test('entry() with description', () => {
  const n = entry({
    title: 'Hello',
    description: 'A description',
    edges: [edge('next')],
  });
  expect(n.description).toBe('A description');
});

test('question() produces a QuestionNodeDef with literal id', () => {
  const n = question({
    id: 'my_question',
    title: 'Favourite food?',
    question: text({ placeholder: 'e.g. pizza' }),
    edges: [edge('next')],
  });
  expect(n._kind).toBe('question');
  expect(n.id).toBe('my_question');
  expect(n.question.kind).toBe('text');
  expect(n.edges).toHaveLength(1);
});

test('view (userland custom node) produces a node with _kind: "view"', () => {
  const n = view({
    id: 'info_page',
    title: 'About Us',
    text: 'Lorem ipsum...',
    edges: [edge('next')],
  });
  expect(n._kind).toBe('view');
  expect(n.id).toBe('info_page');
  expect(n.text).toBe('Lorem ipsum...');
});

test('result() produces a ResultNodeDef', () => {
  const n = result({
    id: 'final_result',
    title: 'Thank you!',
  });
  expect(n._kind).toBe('result');
  expect(n.id).toBe('final_result');
});

test('result() with description', () => {
  const n = result({
    id: 'score_result',
    title: 'Your score',
    description: 'You did great!',
  });
  expect(n.description).toBe('You did great!');
});

test('end() produces an EndNodeDef', () => {
  const n = end();
  expect(n._kind).toBe('end');
  expect(n.id).toBe('__end__');
});
