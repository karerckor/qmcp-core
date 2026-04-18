// src/node.test.ts
import { test, expect } from 'bun:test';
import { welcome, question, view, result, end } from './node.js';
import { text } from './question.js';
import { edge, when, otherwise } from './edge.js';

test('welcome() produces a WelcomeNodeDef', () => {
  const n = welcome({
    title: 'Hello!',
    edges: [edge('next')],
  });
  expect(n._kind).toBe('welcome');
  expect(n.id).toBe('__welcome__');
  expect(n.title).toBe('Hello!');
  expect(n.edges).toHaveLength(1);
});

test('welcome() with dynamic title', () => {
  const n = welcome({
    title: ({ initial }) => `Hi, ${initial.name}`,
    edges: [edge('next')],
  });
  expect(n._kind).toBe('welcome');
  expect(typeof n.title).toBe('function');
});

test('welcome() with description', () => {
  const n = welcome({
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

test('view() produces a ViewNodeDef', () => {
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
