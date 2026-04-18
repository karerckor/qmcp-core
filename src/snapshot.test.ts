// src/snapshot.test.ts
import { test, expect } from 'bun:test';
import { createGraph } from './graph.js';
import { entry, question, result, end } from './node.js';
import { text } from './test-utils.js';
import { edge, when, otherwise } from './edge.js';

function buildGraph() {
  return createGraph<{ name: string }>()([
    entry({
      title: 'Hi',
      edges: [
        when(({ initial }) => initial.name === 'admin', 'admin_q'),
        otherwise('user_q'),
      ],
    }),
    question({ id: 'admin_q', title: 'Admin?', question: text({}), edges: [edge('done')] }),
    question({ id: 'user_q', title: 'User?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
}

test('snapshot captures runtime state as JSON-safe data', async () => {
  const graph = buildGraph();
  const engine = graph.start({ name: 'admin' });
  await engine.next();
  await engine.submit('yes');

  const snap = engine.snapshot();
  const roundtripped = JSON.parse(JSON.stringify(snap));

  expect(roundtripped).toEqual({
    version: 1,
    currentNodeId: 'done',
    answers: { admin_q: 'yes' },
    history: ['__entry__', 'admin_q', 'done'],
    status: 'completed',
  });
});

test('restore resumes an engine at the captured state', async () => {
  const graph = buildGraph();
  const engine = graph.start({ name: 'user' });
  await engine.next();

  const snap = engine.snapshot();
  const restored = graph.restore(snap, { name: 'user' });

  expect(restored.currentNode.id).toBe('user_q');
  expect(restored.history).toEqual(['__entry__', 'user_q']);
  expect(restored.status).toBe('active');

  await restored.submit('my_answer');
  expect(restored.getAnswer('user_q')).toBe('my_answer');
  expect(restored.currentNode.id).toBe('done');
  expect(restored.status).toBe('completed');
});

test('restore preserves answer map identity', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  await engine.next();
  await engine.submit('first');
  await engine.submit('second');

  const restored = graph.restore(engine.snapshot(), {});
  expect(restored.answers).toEqual({ q1: 'first', q2: 'second' });
});

test('restore throws when snapshot references an unknown node', () => {
  const graph = buildGraph();
  expect(() =>
    graph.restore(
      {
        version: 1,
        currentNodeId: 'ghost',
        answers: {},
        history: ['__entry__', 'ghost'],
        status: 'active',
      },
      { name: 'x' },
    ),
  ).toThrow(/not in the graph|unknown node/);
});

test('restore rejects an unsupported snapshot version', () => {
  const graph = buildGraph();
  expect(() =>
    graph.restore(
      {
        version: 99 as unknown as 1,
        currentNodeId: '__entry__',
        answers: {},
        history: ['__entry__'],
        status: 'active',
      },
      { name: 'x' },
    ),
  ).toThrow(/version/);
});

test('restore survives a full JSON.stringify / JSON.parse round-trip', async () => {
  const graph = buildGraph();
  const engine = graph.start({ name: 'admin' });
  await engine.next();

  const json = JSON.stringify(engine.snapshot());
  const parsed = JSON.parse(json);

  const restored = graph.restore(parsed, { name: 'admin' });
  expect(restored.currentNode.id).toBe('admin_q');
});
