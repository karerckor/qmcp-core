# qmcp-core

Type-safe survey graph engine for TypeScript. Define branching surveys as directed graphs with compile-time validation of edge targets, typed answers, and a stateful traversal engine.

## Install

```bash
bun install
```

## Quick Start

```ts
import {
  createGraph, welcome, question, result, end,
  text, radio, checkbox,
  edge, when, otherwise,
} from 'qmcp-core';

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
        { label: 'Math', value: 'math' },
        { label: 'English', value: 'english' },
      ],
    }),
    edges: [edge('food')],
  }),
  question({
    id: 'food',
    title: 'Favourite cuisine?',
    question: checkbox({
      options: [
        { label: 'Italian', value: 'italian' },
        { label: 'Japanese', value: 'japanese' },
      ],
    }),
    edges: [
      when(({ answer }) => answer.includes('japanese'), 'sushi_result'),
      otherwise('generic_result'),
    ],
  }),
  result({ id: 'sushi_result', title: 'You love sushi!' }),
  result({ id: 'generic_result', title: 'Thanks for participating' }),
  end(),
]);

const engine = survey.start({ name: 'Alice', age: 30 });

engine.next();                    // welcome -> profession
engine.submit('developer');       // profession -> food
engine.submit(['japanese']);      // food -> sushi_result

engine.status;                    // 'completed'
engine.getAnswer('profession');   // 'developer'
engine.getAnswer('food');         // ['japanese']
```

## Concepts

### Graph

A graph is an ordered array of nodes passed to `createGraph<Init>()()`. The `Init` type parameter defines the shape of initial values available throughout the survey.

At construction time the graph is validated:
- First node must be `welcome`, last must be `end`
- No duplicate node IDs
- All edge targets must reference existing nodes
- `otherwise()` edges must be last in the edge list
- Orphan nodes and unreachable terminal paths produce warnings

Invalid graphs throw a `GraphError` with code `VALIDATION_ERROR`.

### Nodes

| Factory | Description | Has edges | Collects answer |
|---------|-------------|-----------|-----------------|
| `welcome(config)` | Entry point, always ID `__welcome__` | Yes | No |
| `question(config)` | Displays a question, collects typed answer | Yes | Yes |
| `view(config)` | Informational screen with text | Yes | No |
| `result(config)` | Terminal node with a title | No | No |
| `end()` | Terminal node, always ID `__end__` | No | No |

Node `title` and `description` support **dynamic values** — either a static string or a function `(ctx) => string` receiving `{ initial, answers }`.

### Questions

Built-in question factories produce typed `QuestionDef` objects:

| Factory | Answer type | Config |
|---------|------------|--------|
| `text(config)` | `string` | `placeholder`, `min`, `max`, `required` |
| `radio(config)` | `T` (option value type) | `options: { label, value }[]` |
| `checkbox(config)` | `T[]` | `options: { label, value }[]` |
| `nps(config)` | `number` | `min`, `max`, `labels` |

### Edges

Edges define transitions between nodes:

- **`edge(target)`** — unconditional transition
- **`when(predicate, target)`** — conditional, predicate receives `{ initial, answers, answer }`
- **`otherwise(target)`** — fallback, must be the last edge

Edges are evaluated in order; the first matching edge wins.

### Engine

`GraphEngine` is the runtime that traverses the graph:

```ts
const engine = survey.start(initialValues);

engine.currentNode;   // current node definition
engine.status;        // 'active' | 'completed'
engine.answers;       // collected answers so far
engine.history;       // ordered list of visited node IDs

engine.next();              // advance from non-question nodes
engine.submit(answer);      // submit answer for question nodes
engine.back();              // go to previous node
engine.jumpTo(nodeId);      // jump to a previously visited node
engine.canGoBack();         // true if back() is possible
engine.getAnswer('nodeId'); // get typed answer for a question
engine.visitedNodes();      // list of visited node IDs
```

### Events

```ts
engine.on('nodeEnter', (node) => { /* entered a node */ });
engine.on('nodeExit', (node, answer) => { /* leaving a node */ });
engine.on('complete', (answers) => { /* traversal finished */ });
engine.on('error', (error) => { /* GraphError occurred */ });
```

### Custom Node Types

Extend the graph with custom node types via `defineNodeType`:

```ts
const infoCard = defineNodeType<{ content: string }>({ kind: 'info-card' });

// Use like any other node
infoCard({ id: 'card1', content: 'Hello', edges: [edge('next')] });
```

## Type Safety

The library validates edge targets at compile time. TypeScript will error if an edge references a node ID that doesn't exist in the graph:

```ts
createGraph<{}>()([
  welcome({ title: 'Hi', edges: [edge('nonexistent')] }), // TS error
  result({ id: 'done', title: 'Done' }),
  end(),
]);
```

Answer types flow through the system — `getAnswer('profession')` returns `string` when the question uses `text()`, and `T[]` when it uses `checkbox<T>()`.

## Testing

```bash
bun test
```
