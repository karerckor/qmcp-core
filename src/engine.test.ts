// src/engine.test.ts
import { test, expect } from 'bun:test';
import { createGraph } from './graph.js';
import { entry, question, result, end } from './node.js';
import { text, nps, view } from './test-utils.js';
import { edge, when, otherwise } from './edge.js';

test('start() returns an engine positioned at entry', () => {
  const graph = createGraph<{ name: string }>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({ name: 'Alice' });
  expect(engine.currentNode._kind).toBe('entry');
  expect(engine.status).toBe('active');
  expect(engine.history).toEqual(['__entry__']);
});

test('next() advances from entry to next node', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  await engine.next();
  expect(engine.currentNode._kind).toBe('question');
  expect(engine.currentNode.id).toBe('q1');
  expect(engine.history).toEqual(['__entry__', 'q1']);
});

test('next() throws on question nodes', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  await engine.next();
  await expect(engine.next()).rejects.toThrow();
});

test('next() advances through userland custom (view) nodes', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('info')] }),
    view({ id: 'info', title: 'Info', text: 'Text', edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  await engine.next();
  expect(engine.currentNode.id).toBe('info');
  await engine.next();
  expect(engine.currentNode.id).toBe('done');
  expect(engine.status).toBe('completed');
});

test('submit() stores answer and advances', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  await engine.next();
  await engine.submit('my answer');
  expect(engine.answers).toEqual({ q1: 'my answer' });
  expect(engine.currentNode.id).toBe('done');
  expect(engine.status).toBe('completed');
});

test('submit() throws on non-question nodes', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  await expect(engine.submit('answer')).rejects.toThrow();
});

test('edges are evaluated in order, first match wins', async () => {
  const graph = createGraph<{ age: number }>()([
    entry({
      title: 'Hi',
      edges: [
        when(({ initial }) => initial.age >= 18, 'adult'),
        otherwise('minor'),
      ],
    }),
    question({ id: 'adult', title: 'Adult Q', question: text({}), edges: [edge('done')] }),
    question({ id: 'minor', title: 'Minor Q', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const adultEngine = graph.start({ age: 25 });
  await adultEngine.next();
  expect(adultEngine.currentNode.id).toBe('adult');
  const minorEngine = graph.start({ age: 15 });
  await minorEngine.next();
  expect(minorEngine.currentNode.id).toBe('minor');
});

test('answer is available in edge predicates', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({
      id: 'q1',
      title: 'Rate',
      question: nps({ min: 0, max: 10 }),
      edges: [
        when<'positive', number>(({ answer }) => answer > 7, 'positive'),
        otherwise('negative'),
      ],
    }),
    result({ id: 'positive', title: 'Great!' }),
    result({ id: 'negative', title: 'Sorry' }),
    end(),
  ]);
  const engine1 = graph.start({});
  await engine1.next();
  await engine1.submit(9);
  expect(engine1.currentNode.id).toBe('positive');
  const engine2 = graph.start({});
  await engine2.next();
  await engine2.submit(3);
  expect(engine2.currentNode.id).toBe('negative');
});

test('async edge predicate is awaited', async () => {
  const graph = createGraph<{}>()([
    entry({
      title: 'Hi',
      edges: [
        when(async () => {
          await new Promise((r) => setTimeout(r, 1));
          return true;
        }, 'done'),
      ],
    }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  await engine.next();
  expect(engine.currentNode.id).toBe('done');
});

test('first matching edge wins even when earlier async predicates resolve later', async () => {
  // Simulates: first edge returns Promise<false> (slow), second Promise<true> (fast).
  // The engine must still evaluate in order and pick the first true — i.e.
  // await the slow false, see false, only then try the second.
  const order: string[] = [];
  const graph = createGraph<{}>()([
    entry({
      title: 'Hi',
      edges: [
        when(async () => {
          await new Promise((r) => setTimeout(r, 10));
          order.push('first');
          return false;
        }, 'a'),
        when(async () => {
          order.push('second');
          return true;
        }, 'b'),
      ],
    }),
    result({ id: 'a', title: 'A' }),
    result({ id: 'b', title: 'B' }),
    end(),
  ]);
  const engine = graph.start({});
  await engine.next();
  expect(engine.currentNode.id).toBe('b');
  expect(order).toEqual(['first', 'second']);
});

test('reaching a result node sets status to completed', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  expect(engine.status).toBe('active');
  await engine.next();
  expect(engine.status).toBe('completed');
});

test('submit/next throws when status is completed', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  await engine.next();
  await expect(engine.next()).rejects.toThrow();
  await expect(engine.submit('x')).rejects.toThrow();
});

test('getAnswer returns stored answer for a node', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  await engine.next();
  await engine.submit('hello');
  expect(engine.getAnswer('q1')).toBe('hello');
  expect(engine.getAnswer('nonexistent' as any)).toBeUndefined();
});

// ---- back() (sync) ----

test('back() moves to previous node in history', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  await engine.next();
  await engine.submit('a');
  engine.back();
  expect(engine.currentNode.id).toBe('q1');
  expect(engine.status).toBe('active');
});

test('back() preserves the answer of the current node', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  await engine.next();
  await engine.submit('a1');
  engine.back();
  expect(engine.getAnswer('q1')).toBe('a1');
});

test('back() throws at the first node (entry)', () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  expect(() => engine.back()).toThrow();
});

test('back() throws when status is completed', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  await engine.next();
  expect(() => engine.back()).toThrow();
});

test('canGoBack() returns false at entry', () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  expect(engine.canGoBack()).toBe(false);
});

test('canGoBack() returns true after advancing', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  await engine.next();
  expect(engine.canGoBack()).toBe(true);
});

// ---- jumpTo() (sync) ----

test('jumpTo() moves to a visited node', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('q3')] }),
    question({ id: 'q3', title: 'Q3', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  await engine.next();
  await engine.submit('a1');
  await engine.submit('a2');
  engine.jumpTo('q1');
  expect(engine.currentNode.id).toBe('q1');
});

test('jumpTo() trims history after the target', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('q3')] }),
    question({ id: 'q3', title: 'Q3', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  await engine.next();
  await engine.submit('a1');
  await engine.submit('a2');
  engine.jumpTo('q1');
  expect(engine.history).toEqual(['__entry__', 'q1']);
});

test('jumpTo() keeps answers from trimmed nodes', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  await engine.next();
  await engine.submit('a1');
  await engine.submit('a2');
  engine.jumpTo('q1');
  expect(engine.getAnswer('q2')).toBe('a2');
});

test('jumpTo() throws for non-visited node', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  await engine.next();
  expect(() => engine.jumpTo('q2')).toThrow();
});

test('jumpTo() throws when completed', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  await engine.next();
  expect(() => engine.jumpTo('__entry__')).toThrow();
});

// ---- visitedNodes() ----

test('visitedNodes() returns list of all visited node IDs', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  expect(engine.visitedNodes()).toEqual(['__entry__']);
  await engine.next();
  expect(engine.visitedNodes()).toEqual(['__entry__', 'q1']);
  await engine.submit('a');
  expect(engine.visitedNodes()).toEqual(['__entry__', 'q1', 'q2']);
});

// ---- Events ----

test('nodeEnter fires when advancing to a node', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  const entered: string[] = [];
  engine.on('nodeEnter', (node) => entered.push(node.id));
  await engine.next();
  expect(entered).toEqual(['q1']);
  await engine.submit('x');
  expect(entered).toEqual(['q1', 'done']);
});

test('nodeExit fires when leaving a node', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  const exited: string[] = [];
  engine.on('nodeExit', (node) => exited.push(node.id));
  await engine.next();
  expect(exited).toEqual(['__entry__']);
  await engine.submit('x');
  expect(exited).toEqual(['__entry__', 'q1']);
});

test('nodeExit passes the answer for question nodes', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  const answers: unknown[] = [];
  engine.on('nodeExit', (_node, answer) => answers.push(answer));
  await engine.next();
  expect(answers).toEqual([undefined]);
  await engine.submit('my_answer');
  expect(answers).toEqual([undefined, 'my_answer']);
});

test('complete event fires when reaching a terminal node', async () => {
  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  let completedAnswers: unknown = null;
  engine.on('complete', (a) => { completedAnswers = a; });
  await engine.next();
  expect(completedAnswers).toBeNull();
  await engine.submit('answer');
  expect(completedAnswers).toEqual({ q1: 'answer' });
});

test('error event fires when no edge matches', async () => {
  const graph = createGraph<{}>()([
    entry({
      title: 'Hi',
      edges: [
        when(() => false, 'q1'),
      ],
    }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  const errors: string[] = [];
  engine.on('error', (err) => errors.push(err.message));
  await expect(engine.next()).rejects.toThrow();
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain('No edge matched');
});
