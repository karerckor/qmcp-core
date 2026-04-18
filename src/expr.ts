// src/expr.ts
//
// Code-level helpers for building *serializable* graphs in TypeScript
// (as opposed to deserializing them from a GraphSpec JSON).
//
// A serializable graph needs to retain the original DSL source strings
// for its edge predicates and dynamic values — otherwise `serializeGraph`
// has nothing to write. These helpers attach the source string as an
// `_expr` marker on the produced function, so `serializeGraph` can
// extract it back out.
//
// Without an adapter the produced callable throws when invoked. Adapters
// are wired in by `compileExpressions(graph, adapters)` or automatically
// inside `deserializeGraph`.

import type {
  Awaitable,
  DynamicValue,
  EdgeContext,
  EdgeDef,
} from './types.js';

/** Narrow marker — a function carrying its original expression source. */
export interface ExprCarrier<R> {
  (...args: any[]): Awaitable<R>;
  readonly _expr: string;
  /** Mutable so `compileExpressions` can swap the placeholder for a real
   *  compiled callable after adapters become available. */
  _compiled?: (ctx: any) => Awaitable<R>;
}

function makeCarrier<R>(source: string): ExprCarrier<R> {
  const carrier = ((ctx: unknown): Awaitable<R> => {
    if (carrier._compiled) return carrier._compiled(ctx);
    throw new Error(
      `Expression "${source}" has not been compiled — pass a matching adapter ` +
      `to createGraph/compileExpressions or use deserializeGraph.`,
    );
  }) as ExprCarrier<R>;
  Object.defineProperty(carrier, '_expr', { value: source, enumerable: true });
  return carrier;
}

/** Dynamic value backed by a DSL expression source string (e.g. JSONata).
 *  Use in place of a literal or arrow function:
 *
 *    entry({
 *      title: expr<string>("'Hi, ' & initial.name"),
 *      edges: [...],
 *    })
 *
 *  The resulting graph is serializable by `serializeGraph`, and the
 *  expression will be compiled by the `dynamicAdapter` at deserialize
 *  time (or eagerly if the adapter is provided to `compileExpressions`). */
export function expr<R = string>(source: string): DynamicValue<any, any, R> {
  return makeCarrier<R>(source) as unknown as DynamicValue<any, any, R>;
}

/** Conditional edge backed by a DSL expression source string (e.g. Jexl).
 *  Symmetric to `when(predicate, target)`, but stores `_expr` for roundtrip. */
export function whenExpr<const Target extends string, Answer = unknown>(
  source: string,
  target: Target,
): EdgeDef<Target, Answer> {
  const carrier = makeCarrier<boolean>(source);
  return {
    _type: 'when',
    target,
    condition: carrier as unknown as (ctx: EdgeContext<unknown, unknown, Answer>) => Awaitable<boolean>,
  };
}

/** Returns the DSL source string carried by a function, or `null` if the
 *  function is a plain code callback. Used by `serializeGraph`. */
export function readExpr(fn: unknown): string | null {
  if (typeof fn !== 'function') return null;
  const src = (fn as Partial<ExprCarrier<unknown>>)._expr;
  return typeof src === 'string' ? src : null;
}

/** Swap the placeholder inside every `ExprCarrier` reachable from the
 *  given nodes for a real compiled callable. Idempotent: already-compiled
 *  carriers are left alone. Walks all known carriers sites —
 *  `edge.condition`, `node.title`, `node.description`, and any custom
 *  node field whose value is a carrier. */
export function compileExpressions(
  nodes: readonly unknown[],
  adapters: {
    conditionAdapter?: { compile(src: string): (ctx: any) => Awaitable<boolean> };
    dynamicAdapter?: { compile(src: string): (ctx: any) => Awaitable<unknown> };
  },
): void {
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    for (const [key, value] of Object.entries(node)) {
      compileCarrier(value, key === 'edges' ? 'condition' : 'dynamic', adapters);
    }
    const edges = (node as { edges?: readonly unknown[] }).edges;
    if (Array.isArray(edges)) {
      for (const e of edges) {
        if (e && typeof e === 'object') {
          compileCarrier((e as { condition?: unknown }).condition, 'condition', adapters);
        }
      }
    }
  }
}

function compileCarrier(
  value: unknown,
  kind: 'condition' | 'dynamic',
  adapters: {
    conditionAdapter?: { compile(src: string): (ctx: any) => Awaitable<boolean> };
    dynamicAdapter?: { compile(src: string): (ctx: any) => Awaitable<unknown> };
  },
): void {
  if (typeof value !== 'function') return;
  const carrier = value as ExprCarrier<unknown>;
  if (!carrier._expr || carrier._compiled) return;
  const adapter = kind === 'condition' ? adapters.conditionAdapter : adapters.dynamicAdapter;
  if (!adapter) return;
  carrier._compiled = adapter.compile(carrier._expr) as (ctx: any) => Awaitable<unknown>;
}
