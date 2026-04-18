// src/graph.ts
import type {
  AnyNodeDef,
  ExtractAnswers,
  ValidateEdgeTargets,
  ConstrainDynamicValues,
  ValidationError,
} from './types.js';
import { GraphError } from './types.js';
import { validateGraph } from './validation.js';
import { GraphEngine } from './engine.js';

export class GraphDefinition<Init, Answers, NodeDef extends AnyNodeDef = AnyNodeDef> {
  readonly nodes: readonly NodeDef[];
  readonly nodeMap: Map<string, NodeDef>;
  readonly warnings: readonly ValidationError[];

  constructor(nodes: readonly NodeDef[], validationResults: readonly ValidationError[] = []) {
    this.nodes = nodes;
    this.nodeMap = new Map(nodes.map((n) => [n.id, n]));
    this.warnings = validationResults.filter((e) => e.severity === 'warning');
  }

  start(initialValues: Init): GraphEngine<Init, Answers, NodeDef> {
    return new GraphEngine<Init, Answers, NodeDef>(this.nodeMap, initialValues);
  }
}

/** Creates a graph builder. `Init` must be supplied explicitly — this is
 *  what shapes the `ctx.initial` type in every DynamicValue/edge predicate
 *  across the graph. There is no default. */
export function createGraph<Init>() {
  return <const Nodes extends readonly AnyNodeDef[]>(
    nodes:
      & [...Nodes]
      & ValidateEdgeTargets<Nodes>
      & ConstrainDynamicValues<Init, ExtractAnswers<Nodes>, Nodes>,
  ): GraphDefinition<Init, ExtractAnswers<Nodes>, Nodes[number]> => {
    const validationResults = validateGraph(nodes as readonly AnyNodeDef[]);
    const errors = validationResults.filter((e) => e.severity === 'error');
    if (errors.length > 0) {
      throw new GraphError(
        'VALIDATION_ERROR',
        errors.map((e) => e.message).join('; '),
      );
    }
    return new GraphDefinition<Init, ExtractAnswers<Nodes>, Nodes[number]>(
      nodes as unknown as readonly Nodes[number][],
      validationResults,
    );
  };
}
