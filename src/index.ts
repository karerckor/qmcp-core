// src/index.ts

// Graph construction
export { createGraph, GraphDefinition } from './graph.js';

// Node factories
export { entry, question, result, end, defineNodeType } from './node.js';

// Edge helpers
export { when, otherwise, edge } from './edge.js';

// Question type factory — core ships no built-in question types;
// consumers declare their own.
export { defineQuestionType } from './question-type.js';

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
} from './types.js';

export { GraphError } from './types.js';
export { GraphEngine } from './engine.js';
