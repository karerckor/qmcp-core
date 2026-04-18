// src/index.ts

// Graph construction
export { createGraph, GraphDefinition } from './graph.js';

// Node factories
export { entry, question, result, end, defineNodeType } from './node.js';

// Edge helpers
export { when, otherwise, edge } from './edge.js';

// Question type factory — core ships no built-in question types.
export { defineQuestionType } from './question-type.js';

// Expression carriers for serializable graphs
export { expr, whenExpr, readExpr, compileExpressions } from './expr.js';

// Serialization / deserialization
export { serializeGraph } from './serialize.js';
export type { SerializeOptions, OnFunctionPolicy } from './serialize.js';
export { deserializeGraph, createGraphFromSpec } from './deserialize.js';

// Types
export type {
  QuestionDef,
  DynamicValue,
  DynContext,
  Awaitable,
  EdgeDef,
  EdgeContext,
  EdgeType,
  AnyNodeDef,
  EntryNodeDef,
  QuestionNodeDef,
  ResultNodeDef,
  EndNodeDef,
  CustomNodeDef,
  ExtractAnswers,
  ExtractNodeIds,
  ValidationError,
  EngineStatus,
  EngineEvent,
  EngineEventMap,
  EngineSnapshot,
  ExprSpec,
  NodeSpec,
  EdgeSpec,
  GraphSpec,
  ExpressionAdapter,
  DeserializeOptions,
} from './types.js';

export { GraphError } from './types.js';
export { GraphEngine } from './engine.js';
