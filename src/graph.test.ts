// src/graph.test.ts
import { test, expect } from 'bun:test';
import { createGraph } from './graph.js';
import { welcome, question, view, result, end } from './node.js';
import { text, radio, checkbox, nps } from './question.js';
import { edge, when, otherwise } from './edge.js';

test('createGraph produces a GraphDefinition', () => {
  const graph = createGraph<{ name: string }>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({
      id: 'q1',
      title: 'Name?',
      question: text({ placeholder: 'name' }),
      edges: [edge('done')],
    }),
    result({ id: 'done', title: 'Thanks' }),
    end(),
  ]);

  expect(graph).toBeDefined();
  expect(graph.nodes).toHaveLength(4);
});

test('GraphDefinition.nodes preserves node order', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({
      id: 'q1',
      title: 'Q?',
      question: text({}),
      edges: [edge('r1')],
    }),
    result({ id: 'r1', title: 'Done' }),
    end(),
  ]);

  expect(graph.nodes[0]!._kind).toBe('welcome');
  expect(graph.nodes[1]!._kind).toBe('question');
  expect(graph.nodes[2]!._kind).toBe('result');
  expect(graph.nodes[3]!._kind).toBe('end');
});

test('GraphDefinition.nodeMap provides O(1) lookup by id', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({
      id: 'q1',
      title: 'Q?',
      question: text({}),
      edges: [edge('r1')],
    }),
    result({ id: 'r1', title: 'Done' }),
    end(),
  ]);

  expect(graph.nodeMap.get('__welcome__')?._kind).toBe('welcome');
  expect(graph.nodeMap.get('q1')?._kind).toBe('question');
  expect(graph.nodeMap.get('r1')?._kind).toBe('result');
  expect(graph.nodeMap.get('__end__')?._kind).toBe('end');
});

test('graph with conditional edges', () => {
  const graph = createGraph<{ age: number }>()([
    welcome({
      title: 'Hello',
      edges: [
        when(({ initial }) => initial.age >= 18, 'adult'),
        otherwise('minor'),
      ],
    }),
    question({
      id: 'adult',
      title: 'Profession?',
      question: text({}),
      edges: [edge('done')],
    }),
    question({
      id: 'minor',
      title: 'School subject?',
      question: radio({
        options: [
          { label: 'Math', value: 'math' },
          { label: 'English', value: 'english' },
        ],
      }),
      edges: [edge('done')],
    }),
    result({ id: 'done', title: 'Thanks' }),
    end(),
  ]);

  expect(graph.nodes).toHaveLength(5);
  expect(graph.nodeMap.size).toBe(5);
});

test('graph with view node', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('info')] }),
    view({
      id: 'info',
      title: 'Info',
      text: 'Some info text',
      edges: [edge('done')],
    }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);

  expect(graph.nodeMap.get('info')?._kind).toBe('view');
});
