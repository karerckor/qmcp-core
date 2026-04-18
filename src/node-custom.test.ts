// src/node-custom.test.ts
import { test, expect } from 'bun:test';
import { defineNodeType } from './node.js';
import { edge } from './edge.js';
import { createGraph } from './graph.js';
import { welcome, result, end } from './node.js';

test('defineNodeType creates a factory function', () => {
  const consent = defineNodeType<{ text: string; checkboxLabel: string }, boolean>({
    kind: 'consent',
  });

  expect(typeof consent).toBe('function');
});

test('custom node factory produces correct structure', () => {
  const consent = defineNodeType<{ text: string; checkboxLabel: string }, boolean>({
    kind: 'consent',
  });

  const node = consent({
    id: 'gdpr',
    text: 'Privacy policy...',
    checkboxLabel: 'I agree',
    edges: [edge('next')],
  });

  expect(node._kind).toBe('consent');
  expect(node.id).toBe('gdpr');
  expect((node as any).text).toBe('Privacy policy...');
  expect((node as any).checkboxLabel).toBe('I agree');
});

test('custom node has _answerType phantom field', () => {
  const consent = defineNodeType<{ text: string }, boolean>({
    kind: 'consent',
  });

  const node = consent({
    id: 'gdpr',
    text: 'Policy',
    edges: [edge('next')],
  });

  expect(node).toHaveProperty('_answerType');
});

test('custom node works in a graph', () => {
  const consent = defineNodeType<{ text: string }, boolean>({
    kind: 'consent',
  });

  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('gdpr')] }),
    consent({
      id: 'gdpr',
      text: 'Accept our terms',
      edges: [edge('done')],
    }) as any, // cast needed because AnyNodeDef doesn't include custom types
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);

  expect(graph.nodes).toHaveLength(4);
  expect((graph.nodeMap.get('gdpr') as any)?._kind).toBe('consent');
});
