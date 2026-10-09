import { createWorkflowValidator } from './create-workflow-engine.js';
import type { WorkflowCanvas } from './engine/workflow-engine.types.js';
import { WorkflowGraph } from './engine/workflow-graph.js';

function canvasWith(type: string): WorkflowCanvas {
  return {
    nodes: [
      { id: 'start', type: 'start', data: {} },
      { id: 'node', type, data: {} },
      { id: 'end', type: 'end', data: {} },
    ],
    edges: [
      { source: 'start', target: 'node' },
      { source: 'node', target: 'end' },
    ],
  };
}

describe('createWorkflowValidator', () => {
  const validator = createWorkflowValidator();

  it.each(['llm', 'code', 'http', 'template', 'variable'])(
    'knows node type %s without runtime capabilities',
    (type) => {
      const { executionPlan } = validator.validate(new WorkflowGraph(canvasWith(type)));

      expect(executionPlan.map((node) => node.id)).toEqual(['start', 'node', 'end']);
    },
  );

  it('rejects unknown node type', () => {
    expect(() => validator.validate(new WorkflowGraph(canvasWith('magic')))).toThrow(
      'Unsupported node type: magic',
    );
  });
});
