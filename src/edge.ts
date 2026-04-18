// src/edge.ts
import type { Awaitable, EdgeDef, EdgeContext } from './types.js';

/** Conditional edge — predicate receives typed context and may be either
 *  sync or async. The engine awaits each edge's `condition` before moving
 *  on, so returning a Promise just makes `engine.next()` / `engine.submit()`
 *  resolve a tick later — no separate API is needed.
 *
 *  `Answer` is inferred from the enclosing `question()` via its
 *  `edges: readonly EdgeDef<string, Q['_answerType']>[]` constraint, so
 *  `ctx.answer` is correctly typed inside the predicate.
 *
 *  `Init` / `Answers` aren't threaded into the callback — edges are
 *  constructed *before* being attached to a graph. See `edge.ts` docs for
 *  the rationale; annotate the predicate explicitly when you need them. */
export function when<const Target extends string, Answer = unknown>(
  predicate: (ctx: EdgeContext<any, any, Answer>) => Awaitable<boolean>,
  target: Target,
): EdgeDef<Target, Answer> {
  return { _type: 'when', target, condition: predicate };
}

/** Fallback edge — always matches synchronously. Must be the last edge on a node. */
export function otherwise<const Target extends string, Answer = unknown>(
  target: Target,
): EdgeDef<Target, Answer> {
  return { _type: 'otherwise', target, condition: () => true };
}

/** Unconditional edge — single-target transition, matches synchronously. */
export function edge<const Target extends string, Answer = unknown>(
  target: Target,
): EdgeDef<Target, Answer> {
  return { _type: 'edge', target, condition: () => true };
}
