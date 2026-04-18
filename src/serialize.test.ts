// src/serialize.test.ts
//
// Exercises serialize/deserialize roundtrip. Uses stub adapters that
// look up expression sources in a pre-registered dictionary — users in
// real code plug in Jexl (for conditions) and JSONata (for dynamic
// values). The library itself stays dependency-free of those packages.

import { test, expect } from 'bun:test';
import type { ExpressionAdapter, GraphSpec } from './types.js';
import { createGraph } from './graph.js';
import { entry, question, result, end, defineNodeType } from './node.js';
import { edge, otherwise } from './edge.js';
import { expr, whenExpr, readExpr } from './expr.js';
import { serializeGraph } from './serialize.js';
import { deserializeGraph } from './deserialize.js';
import { text } from './test-utils.js';

// ---- Stub adapters ----
//
// A real conditionAdapter would delegate to Jexl; a dynamicAdapter to
// JSONata. For tests we map known source strings to JS predicates.

function makeConditionAdapter(map: Record<string, (ctx: any) => boolean>): ExpressionAdapter<boolean> {
  return {
    compile: (src) => {
      const fn = map[src];
      if (!fn) throw new Error(`Stub adapter: unknown condition source "${src}"`);
      return fn;
    },
  };
}

function makeDynamicAdapter(map: Record<string, (ctx: any) => unknown>): ExpressionAdapter<unknown> {
  return {
    compile: (src) => {
      const fn = map[src];
      if (!fn) throw new Error(`Stub adapter: unknown dynamic source "${src}"`);
      return fn;
    },
  };
}

// ---- Roundtrip tests (direct spec input) ----

test('deserializeGraph builds a working graph from a spec', async () => {
  const spec: GraphSpec = {
    version: 1,
    nodes: [
      {
        _kind: 'entry',
        id: '__entry__',
        title: 'Hi',
        edges: [
          { _type: 'when', target: 'adult', condition: 'initial.age >= 18' },
          { _type: 'otherwise', target: 'minor' },
        ],
      },
      {
        _kind: 'question',
        id: 'adult',
        title: 'Adult?',
        question: { kind: 'text', config: { placeholder: '' } },
        edges: [{ _type: 'edge', target: 'done' }],
      },
      {
        _kind: 'question',
        id: 'minor',
        title: 'Minor?',
        question: { kind: 'text', config: {} },
        edges: [{ _type: 'edge', target: 'done' }],
      },
      { _kind: 'result', id: 'done', title: 'Done' },
      { _kind: 'end', id: '__end__' },
    ],
  };

  const graph = deserializeGraph<{ age: number }>(spec, {
    conditionAdapter: makeConditionAdapter({
      'initial.age >= 18': (ctx) => ctx.initial.age >= 18,
    }),
    questionTypes: { text },
  });

  const adult = graph.start({ age: 30 });
  await adult.next();
  expect(adult.currentNode.id).toBe('adult');

  const minor = graph.start({ age: 12 });
  await minor.next();
  expect(minor.currentNode.id).toBe('minor');
});

test('deserialize then serialize is identity (structural round-trip)', async () => {
  const spec: GraphSpec = {
    version: 1,
    nodes: [
      {
        _kind: 'entry',
        id: '__entry__',
        title: { _expr: "'Hi, ' & initial.name" },
        edges: [{ _type: 'edge', target: 'done' }],
      },
      { _kind: 'result', id: 'done', title: 'Done' },
      { _kind: 'end', id: '__end__' },
    ],
  };

  const graph = deserializeGraph(spec, {
    dynamicAdapter: makeDynamicAdapter({
      "'Hi, ' & initial.name": (ctx) => `Hi, ${ctx.initial.name}`,
    }),
  });

  const roundtripped = serializeGraph(graph);
  expect(roundtripped).toEqual(spec);
});

test('missing adapter for a required expression throws MISSING_ADAPTER', () => {
  const spec: GraphSpec = {
    version: 1,
    nodes: [
      {
        _kind: 'entry',
        id: '__entry__',
        title: 'Hi',
        edges: [{ _type: 'when', target: 'done', condition: 'initial.ok' }],
      },
      { _kind: 'result', id: 'done', title: 'Done' },
      { _kind: 'end', id: '__end__' },
    ],
  };
  expect(() => deserializeGraph(spec, {})).toThrow(/MISSING_ADAPTER|conditionAdapter/);
});

test('missing questionType factory throws MISSING_QUESTION_TYPE', () => {
  const spec: GraphSpec = {
    version: 1,
    nodes: [
      {
        _kind: 'entry',
        id: '__entry__',
        title: 'Hi',
        edges: [{ _type: 'edge', target: 'q1' }],
      },
      {
        _kind: 'question',
        id: 'q1',
        title: 'Q',
        question: { kind: 'unknown_kind', config: {} },
        edges: [{ _type: 'edge', target: 'done' }],
      },
      { _kind: 'result', id: 'done', title: 'Done' },
      { _kind: 'end', id: '__end__' },
    ],
  };
  expect(() => deserializeGraph(spec, { questionTypes: { text } })).toThrow(
    /MISSING_QUESTION_TYPE|unknown_kind/,
  );
});

// ---- Code-level serializable graphs via expr()/whenExpr() ----

test('whenExpr + expr produce a graph that serializes roundtrip', async () => {
  const graph = createGraph<{ age: number }>()([
    entry({
      title: expr<string>("'Hi ' & initial.name"),
      edges: [
        whenExpr('initial.age >= 18', 'adult'),
        otherwise('minor'),
      ],
    }),
    question({
      id: 'adult',
      title: 'What is your profession?',
      question: text({}),
      edges: [edge('done')],
    }),
    question({
      id: 'minor',
      title: 'Favourite subject?',
      question: text({}),
      edges: [edge('done')],
    }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);

  const spec = serializeGraph(graph);

  expect(spec.version).toBe(1);
  expect(spec.nodes[0]).toMatchObject({
    _kind: 'entry',
    id: '__entry__',
    title: { _expr: "'Hi ' & initial.name" },
    edges: [
      { _type: 'when', target: 'adult', condition: 'initial.age >= 18' },
      { _type: 'otherwise', target: 'minor' },
    ],
  });

  const rehydrated = deserializeGraph<{ age: number }>(spec, {
    conditionAdapter: makeConditionAdapter({
      'initial.age >= 18': (ctx) => ctx.initial.age >= 18,
    }),
    dynamicAdapter: makeDynamicAdapter({
      "'Hi ' & initial.name": (ctx) => `Hi ${ctx.initial.name}`,
    }),
    questionTypes: { text },
  });

  const engine = rehydrated.start({ age: 20 });
  await engine.next();
  expect(engine.currentNode.id).toBe('adult');
});

test('serializeGraph with onFunction:"throw" rejects raw lambdas', () => {
  const graph = createGraph<{ age: number }>()([
    entry({
      title: 'Hi',
      edges: [
        // Raw lambda — has no `_expr` metadata attached.
        { _type: 'when', target: 'done', condition: (ctx: any) => ctx.initial.age >= 18 } as any,
      ],
    }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  expect(() => serializeGraph(graph)).toThrow(/SERIALIZE_FUNCTION|_expr/);
});

test('serializeGraph with onFunction:"placeholder" emits unknown markers', () => {
  const graph = createGraph<{}>()([
    entry({
      title: (() => 'computed') as any,
      edges: [{ _type: 'edge', target: 'done' } as any],
    }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);
  const spec = serializeGraph(graph, { onFunction: 'placeholder' });
  expect(spec.nodes[0]!.title).toEqual({ _expr: '<unknown>' });
});

// ---- Custom node kinds roundtrip ----

test('custom node kinds roundtrip via nodeTypes registry', async () => {
  const consent = defineNodeType<'consent', { text: string }, boolean>({ kind: 'consent' });

  const graph = createGraph<{}>()([
    entry({ title: 'Hi', edges: [edge('gdpr')] }),
    consent({ id: 'gdpr', text: 'Accept policy?', edges: [edge('done')] }),
    result({ id: 'done', title: 'Done' }),
    end(),
  ]);

  const spec = serializeGraph(graph);
  expect(spec.nodes[1]).toMatchObject({
    _kind: 'consent',
    id: 'gdpr',
    text: 'Accept policy?',
    edges: [{ _type: 'edge', target: 'done' }],
  });

  const rehydrated = deserializeGraph(spec, {
    nodeTypes: { consent: (fields: any) => consent(fields) },
  });
  expect(rehydrated.nodeMap.get('gdpr')?._kind).toBe('consent');
});

// ---- Combining snapshot + serialize ----

test('spec + snapshot together let you persist graph AND progress', async () => {
  const spec: GraphSpec = {
    version: 1,
    nodes: [
      {
        _kind: 'entry',
        id: '__entry__',
        title: 'Hi',
        edges: [{ _type: 'edge', target: 'q1' }],
      },
      {
        _kind: 'question',
        id: 'q1',
        title: 'Name?',
        question: { kind: 'text', config: {} },
        edges: [{ _type: 'edge', target: 'done' }],
      },
      { _kind: 'result', id: 'done', title: 'Done' },
      { _kind: 'end', id: '__end__' },
    ],
  };

  const graph1 = deserializeGraph<{}>(spec, { questionTypes: { text } });
  const engine1 = graph1.start({});
  await engine1.next(); // -> q1

  // Save both the graph definition AND the engine state as JSON.
  const persisted = JSON.stringify({ spec, snap: engine1.snapshot() });

  // ... time passes / process restarts ...

  const { spec: loadedSpec, snap } = JSON.parse(persisted);
  const graph2 = deserializeGraph<{}>(loadedSpec, { questionTypes: { text } });
  const engine2 = graph2.restore(snap, {});

  expect(engine2.currentNode.id).toBe('q1');
  await engine2.submit('Alice');
  expect(engine2.status).toBe('completed');
  expect(engine2.getAnswer('q1')).toBe('Alice');
});

// ---- readExpr helper ----

test('readExpr returns source for carrier, null otherwise', () => {
  const carrier = whenExpr('answer > 5', 'done').condition;
  expect(readExpr(carrier)).toBe('answer > 5');
  expect(readExpr(() => true)).toBeNull();
  expect(readExpr('not a function')).toBeNull();
});
