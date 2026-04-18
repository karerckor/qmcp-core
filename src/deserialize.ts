// src/deserialize.ts
import type {
  AnyNodeDef,
  Awaitable,
  DeserializeOptions,
  DynamicValue,
  EdgeDef,
  EdgeSpec,
  ExprSpec,
  GraphSpec,
  NodeSpec,
  QuestionDef,
} from './types.js';
import { GraphError } from './types.js';
import { GraphDefinition } from './graph.js';
import { validateGraph } from './validation.js';
import { entry, question, result, end } from './node.js';
import { readExpr } from './expr.js';

/** Rehydrate a `GraphSpec` into a live `GraphDefinition`.
 *
 *  Required `options`:
 *  - `conditionAdapter` — if any `_type: 'when'` edge has a `condition` string
 *  - `dynamicAdapter`   — if any title/description/etc is `{ _expr: ... }`
 *  - `questionTypes`    — if there are `_kind: 'question'` nodes
 *  - `nodeTypes`        — if there are custom node kinds
 *
 *  The library validates the resulting graph via `validateGraph`, so
 *  structural errors (missing entry, duplicate ids, dangling edge
 *  targets, ...) surface with the same error codes as `createGraph`. */
export function deserializeGraph<Init = unknown>(
  spec: GraphSpec,
  options: DeserializeOptions = {},
): GraphDefinition<Init, Record<string, unknown>, AnyNodeDef> {
  if (spec.version !== 1) {
    throw new GraphError('INVALID_SPEC', `Unsupported GraphSpec version: ${spec.version}`);
  }

  const nodes: AnyNodeDef[] = spec.nodes.map((ns) => rehydrateNode(ns, options));

  const validationResults = validateGraph(nodes);
  const errors = validationResults.filter((e) => e.severity === 'error');
  if (errors.length > 0) {
    throw new GraphError(
      'VALIDATION_ERROR',
      errors.map((e) => e.message).join('; '),
    );
  }
  return new GraphDefinition<Init, Record<string, unknown>, AnyNodeDef>(nodes, validationResults);
}

function rehydrateNode(spec: NodeSpec, options: DeserializeOptions): AnyNodeDef {
  const edges = (spec.edges ?? []).map((e, i) => rehydrateEdge(e, `${spec.id}.edges[${i}]`, options));

  switch (spec._kind) {
    case 'entry': {
      return entry({
        title: rehydrateDynamic(spec.title, `${spec.id}.title`, options),
        description: spec.description !== undefined
          ? rehydrateDynamic(spec.description, `${spec.id}.description`, options)
          : undefined,
        edges,
      });
    }
    case 'question': {
      if (!spec.question) {
        throw new GraphError('INVALID_SPEC', `Question node "${spec.id}" is missing \`question\` field`);
      }
      const factory = options.questionTypes?.[spec.question.kind];
      if (!factory) {
        throw new GraphError(
          'MISSING_QUESTION_TYPE',
          `No factory registered for question kind "${spec.question.kind}" ` +
          `(node "${spec.id}"). Pass it via options.questionTypes.`,
        );
      }
      const q: QuestionDef = factory(spec.question.config);
      return question({
        id: spec.id,
        title: rehydrateDynamic(spec.title, `${spec.id}.title`, options),
        description: spec.description !== undefined
          ? rehydrateDynamic(spec.description, `${spec.id}.description`, options)
          : undefined,
        question: q,
        edges,
      });
    }
    case 'result': {
      return result({
        id: spec.id,
        title: rehydrateDynamic(spec.title, `${spec.id}.title`, options),
        description: spec.description !== undefined
          ? rehydrateDynamic(spec.description, `${spec.id}.description`, options)
          : undefined,
      });
    }
    case 'end': {
      return end();
    }
    default: {
      // Custom node kind — dispatch via user-supplied factory.
      const factory = options.nodeTypes?.[spec._kind];
      if (!factory) {
        throw new GraphError(
          'MISSING_NODE_TYPE',
          `No factory registered for node kind "${spec._kind}" ` +
          `(node "${spec.id}"). Pass it via options.nodeTypes.`,
        );
      }
      const fields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(spec)) {
        if (key === '_kind') continue;
        if (key === 'edges') { fields.edges = edges; continue; }
        if (key === 'title' || key === 'description') {
          fields[key] = rehydrateDynamic(value as string | ExprSpec, `${spec.id}.${key}`, options);
          continue;
        }
        if (value && typeof value === 'object' && '_expr' in (value as object)) {
          fields[key] = rehydrateDynamic(value as ExprSpec, `${spec.id}.${key}`, options);
          continue;
        }
        fields[key] = value;
      }
      return factory(fields);
    }
  }
}

function rehydrateEdge(spec: EdgeSpec, location: string, options: DeserializeOptions): EdgeDef {
  if (spec._type === 'when') {
    if (typeof spec.condition !== 'string') {
      throw new GraphError(
        'INVALID_SPEC',
        `Edge at ${location} is \`when\` but has no \`condition\` source string`,
      );
    }
    if (!options.conditionAdapter) {
      throw new GraphError(
        'MISSING_ADAPTER',
        `Edge at ${location} has a condition string but no \`conditionAdapter\` was provided`,
      );
    }
    const fn = options.conditionAdapter.compile(spec.condition);
    // Attach _expr back onto the compiled function so round-tripping
    // serialize(deserialize(spec)) returns the same spec.
    Object.defineProperty(fn, '_expr', { value: spec.condition, enumerable: true });
    return { _type: 'when', target: spec.target, condition: fn as (ctx: any) => Awaitable<boolean> };
  }
  // `edge` / `otherwise` always match — no adapter call needed.
  return {
    _type: spec._type,
    target: spec.target,
    condition: () => true,
  };
}

function rehydrateDynamic(
  value: string | ExprSpec | undefined,
  location: string,
  options: DeserializeOptions,
): DynamicValue {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as ExprSpec)._expr === 'string') {
    const source = (value as ExprSpec)._expr;
    if (!options.dynamicAdapter) {
      throw new GraphError(
        'MISSING_ADAPTER',
        `Dynamic value at ${location} requires \`dynamicAdapter\` to compile "${source}"`,
      );
    }
    const compiled = options.dynamicAdapter.compile(source);
    const wrapper: any = (ctx: any) => compiled(ctx);
    Object.defineProperty(wrapper, '_expr', { value: source, enumerable: true });
    return wrapper as DynamicValue;
  }
  return value as unknown as DynamicValue;
}

/** Alias for readability — construct a graph directly from a spec. */
export const createGraphFromSpec = deserializeGraph;

/** Re-export so callers can check whether a function is a compiled expression. */
export { readExpr };
