// src/engine.test.ts
import { test, expect } from 'bun:test';
import { createGraph } from './graph.js';
import { welcome, question, view, result, end } from './node.js';
import { text, nps } from './question.js';
import { edge, when, otherwise } from './edge.js';
import type { AnyNodeDef } from './types.js';

test('start() returns an engine positioned at welcome', () => {
  const graph = createGraph<{ name: string }>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({ name: 'Alice' });
  expect(engine.currentNode._kind).toBe('welcome');
  expect(engine.status).toBe('active');
  expect(engine.history).toEqual(['__welcome__']);
});

test('next() advances from welcome to next node', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  engine.next();
  expect(engine.currentNode._kind).toBe('question');
  expect(engine.currentNode.id).toBe('q1');
  expect(engine.history).toEqual(['__welcome__', 'q1']);
});

test('next() throws on question nodes', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  engine.next();
  expect(() => engine.next()).toThrow();
});

test('next() advances through view nodes', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('info')] }),
    view({ id: 'info', title: 'Info', text: 'Text', edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  engine.next();
  expect(engine.currentNode.id).toBe('info');
  engine.next();
  expect(engine.currentNode.id).toBe('done');
  expect(engine.status).toBe('completed');
});

test('submit() stores answer and advances', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  engine.next();
  engine.submit('my answer');
  expect(engine.answers).toEqual({ q1: 'my answer' });
  expect(engine.currentNode.id).toBe('done');
  expect(engine.status).toBe('completed');
});

test('submit() throws on non-question nodes', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  expect(() => engine.submit('answer')).toThrow();
});

test('edges are evaluated in order, first match wins', () => {
  const graph = createGraph<{ age: number }>()([
    welcome({
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
  adultEngine.next();
  expect(adultEngine.currentNode.id).toBe('adult');
  const minorEngine = graph.start({ age: 15 });
  minorEngine.next();
  expect(minorEngine.currentNode.id).toBe('minor');
});

test('answer is available in edge predicates', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
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
  engine1.next();
  engine1.submit(9);
  expect(engine1.currentNode.id).toBe('positive');
  const engine2 = graph.start({});
  engine2.next();
  engine2.submit(3);
  expect(engine2.currentNode.id).toBe('negative');
});

test('reaching a result node sets status to completed', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  expect(engine.status).toBe('active');
  engine.next();
  expect(engine.status).toBe('completed');
});

test('submit/next throws when status is completed', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  engine.next();
  expect(() => engine.next()).toThrow();
  expect(() => engine.submit('x')).toThrow();
});

test('getAnswer returns stored answer for a node', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  engine.next();
  engine.submit('hello');
  expect(engine.getAnswer('q1')).toBe('hello');
  expect(engine.getAnswer('nonexistent' as any)).toBeUndefined();
});

// ---- back() ----

test('back() moves to previous node in history', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  engine.next();
  engine.submit('a');
  engine.back();
  expect(engine.currentNode.id).toBe('q1');
  expect(engine.status).toBe('active');
});

test('back() preserves the answer of the current node', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  engine.next();
  engine.submit('a1');
  engine.back();
  expect(engine.getAnswer('q1')).toBe('a1');
});

test('back() throws at the first node (welcome)', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  expect(() => engine.back()).toThrow();
});

test('back() throws when status is completed', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  engine.next();
  expect(() => engine.back()).toThrow();
});

test('canGoBack() returns false at welcome', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  expect(engine.canGoBack()).toBe(false);
});

test('canGoBack() returns true after advancing', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  engine.next();
  expect(engine.canGoBack()).toBe(true);
});

// ---- jumpTo() ----

test('jumpTo() moves to a visited node', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('q3')] }),
    question({ id: 'q3', title: 'Q3', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  engine.next();
  engine.submit('a1');
  engine.submit('a2');
  engine.jumpTo('q1');
  expect(engine.currentNode.id).toBe('q1');
});

test('jumpTo() trims history after the target', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('q3')] }),
    question({ id: 'q3', title: 'Q3', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  engine.next();
  engine.submit('a1');
  engine.submit('a2');
  engine.jumpTo('q1');
  expect(engine.history).toEqual(['__welcome__', 'q1']);
});

test('jumpTo() keeps answers from trimmed nodes', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  engine.next();
  engine.submit('a1');
  engine.submit('a2');
  engine.jumpTo('q1');
  expect(engine.getAnswer('q2')).toBe('a2');
});

test('jumpTo() throws for non-visited node', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  engine.next();
  expect(() => engine.jumpTo('q2')).toThrow();
});

test('jumpTo() throws when completed', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  engine.next();
  expect(() => engine.jumpTo('__welcome__')).toThrow();
});

// ---- visitedNodes() ----

test('visitedNodes() returns list of all visited node IDs', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q1', question: text({}), edges: [edge('q2')] }),
    question({ id: 'q2', title: 'Q2', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  expect(engine.visitedNodes()).toEqual(['__welcome__']);
  engine.next();
  expect(engine.visitedNodes()).toEqual(['__welcome__', 'q1']);
  engine.submit('a');
  expect(engine.visitedNodes()).toEqual(['__welcome__', 'q1', 'q2']);
});

// ---- Events ----

test('nodeEnter fires when advancing to a node', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  const entered: string[] = [];
  engine.on('nodeEnter', (node) => entered.push(node.id));
  engine.next();
  expect(entered).toEqual(['q1']);
  engine.submit('x');
  expect(entered).toEqual(['q1', 'done']);
});

test('nodeExit fires when leaving a node', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  const exited: string[] = [];
  engine.on('nodeExit', (node) => exited.push(node.id));
  engine.next();
  expect(exited).toEqual(['__welcome__']);
  engine.submit('x');
  expect(exited).toEqual(['__welcome__', 'q1']);
});

test('nodeExit passes the answer for question nodes', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  const answers: unknown[] = [];
  engine.on('nodeExit', (_node, answer) => answers.push(answer));
  engine.next();
  expect(answers).toEqual([undefined]);
  engine.submit('my_answer');
  expect(answers).toEqual([undefined, 'my_answer']);
});

test('complete event fires when reaching a terminal node', () => {
  const graph = createGraph<{}>()([
    welcome({ title: 'Hi', edges: [edge('q1')] }),
    question({ id: 'q1', title: 'Q?', question: text({}), edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const engine = graph.start({});
  let completedAnswers: unknown = null;
  engine.on('complete', (a) => { completedAnswers = a; });
  engine.next();
  expect(completedAnswers).toBeNull();
  engine.submit('answer');
  expect(completedAnswers).toEqual({ q1: 'answer' });
});

test('error event fires when no edge matches', () => {
  const graph = createGraph<{}>()([
    welcome({
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
  expect(() => engine.next()).toThrow();
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain('No edge matched');
});
