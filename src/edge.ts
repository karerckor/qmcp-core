// src/edge.ts
import type { EdgeDef, EdgeContext } from './types.js';

/** Conditional edge — predicate receives typed context.
 *  Answer type parameter is inferred via contextual typing when
 *  edges are used inside question() — the question's _answerType
 *  flows into the Answer parameter. */
export function when<Target extends string, Answer = unknown>(
  predicate: (ctx: EdgeContext<any, any, Answer>) => boolean,
  target: Target,
): EdgeDef<Target, Answer> {
  return { _type: 'when', target, condition: predicate };
}

export function otherwise<Target extends string>(
  target: Target,
): EdgeDef<Target, any> {
  return { _type: 'otherwise', target, condition: () => true };
}

export function edge<Target extends string>(
  target: Target,
): EdgeDef<Target, any> {
  return { _type: 'edge', target, condition: () => true };
}
