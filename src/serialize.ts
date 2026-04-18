// src/serialize.ts
import type {
  AnyNodeDef,
  EdgeSpec,
  GraphSpec,
  NodeSpec,
} from './types.js';
import { GraphError } from './types.js';
import type { GraphDefinition } from './graph.js';
import { readExpr } from './expr.js';

/** Behavior when a lambda is encountered that has no attached `_expr`
 *  metadata (i.e. was built with raw `when(predicate, target)` or
 *  `title: (ctx) => ...`). Such functions cannot be faithfully
 *  serialized — the library has no source to store. */
export type OnFunctionPolicy =
  /** Throw with a `SERIALIZE_FUNCTION` GraphError. Safest default. */
  | 'throw'
  /** Drop the field entirely (for dynamic values) or drop the condition
   *  (for edges — effectively converting `when` into `otherwise`). Fails
   *  on structural requirements like `edge.target`. */
  | 'omit'
  /** Replace with a placeholder ExprSpec `{ _expr: "<unknown>" }`. The
   *  resulting spec is not round-trippable but is valid JSON. */
  | 'placeholder';

export interface SerializeOptions {
  readonly onFunction?: OnFunctionPolicy;
}

/** Serialize a `GraphDefinition` to a JSON-safe `GraphSpec`. Edge
 *  conditions and dynamic value callbacks must have been built with
 *  `whenExpr()` / `expr()` (or loaded via `deserializeGraph`) so that
 *  their source strings are available — otherwise the policy in
 *  `options.onFunction` kicks in. */
export function serializeGraph(
  graph: GraphDefinition<unknown, unknown, AnyNodeDef>,
  options: SerializeOptions = {},
): GraphSpec {
  const onFunction: OnFunctionPolicy = options.onFunction ?? 'throw';
  const nodes: NodeSpec[] = graph.nodes.map((n) => serializeNode(n, onFunction));
  return { version: 1, nodes };
}

function serializeNode(node: AnyNodeDef, onFunction: OnFunctionPolicy): NodeSpec {
  const out: Record<string, unknown> = {
    _kind: node._kind,
    id: node.id,
  };

  for (const [key, value] of Object.entries(node)) {
    if (key === '_kind' || key === 'id' || key === 'edges' || key === '_answerType') continue;
    if (key === 'title' || key === 'description') {
      const serialized = serializeDynamic(value, `${node.id}.${key}`, onFunction);
      if (serialized !== DROP) out[key] = serialized;
      continue;
    }
    if (key === 'question') {
      // QuestionDef: { kind, config, _answerType }
      const q = value as { kind: string; config: unknown };
      out.question = { kind: q.kind, config: q.config };
      continue;
    }
    // Custom node extra fields: accept JSON-safe values verbatim; dynamic
    // expression carriers are serialized; raw functions get the policy.
    if (typeof value === 'function') {
      const serialized = serializeDynamic(value, `${node.id}.${key}`, onFunction);
      if (serialized !== DROP) out[key] = serialized;
      continue;
    }
    out[key] = value;
  }

  if ('edges' in node) {
    const edges = (node as { edges: readonly unknown[] }).edges;
    out.edges = edges.map((e, i) => serializeEdge(e, node.id, i, onFunction));
  }

  return out as NodeSpec;
}

const DROP = Symbol('drop');

function serializeDynamic(
  value: unknown,
  location: string,
  onFunction: OnFunctionPolicy,
): string | { _expr: string } | typeof DROP {
  if (typeof value === 'string') return value;
  if (typeof value === 'function') {
    const src = readExpr(value);
    if (src !== null) return { _expr: src };
    return handleFunctionPolicy(location, onFunction);
  }
  // Unknown dynamic value shape — pass through if JSON-safe.
  return value as any;
}

function serializeEdge(
  edge: unknown,
  nodeId: string,
  index: number,
  onFunction: OnFunctionPolicy,
): EdgeSpec {
  const e = edge as { _type: 'when' | 'otherwise' | 'edge'; target: string; condition: unknown };
  const out: EdgeSpec = { _type: e._type, target: e.target };
  if (e._type === 'when') {
    const src = readExpr(e.condition);
    if (src !== null) {
      return { ...out, condition: src };
    }
    const handled = handleFunctionPolicy(`${nodeId}.edges[${index}].condition`, onFunction);
    if (handled === DROP) return out; // `when` without condition — effectively downgrades behavior; caller is warned via policy
    if (typeof handled === 'object' && '_expr' in handled) return { ...out, condition: handled._expr };
  }
  return out;
}

function handleFunctionPolicy(
  location: string,
  policy: OnFunctionPolicy,
): { _expr: string } | typeof DROP {
  if (policy === 'throw') {
    throw new GraphError(
      'SERIALIZE_FUNCTION',
      `Cannot serialize function at "${location}" — it has no \`_expr\` source. ` +
      `Build the graph with whenExpr()/expr() or choose onFunction: 'omit' | 'placeholder'.`,
    );
  }
  if (policy === 'omit') return DROP;
  return { _expr: '<unknown>' };
}
