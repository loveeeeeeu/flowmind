import type { WorkflowCanvas } from './workflow-engine.types.js';
import { WorkflowGraph } from './workflow-graph.js';

describe('WorkflowGraph', () => {
  const nodes = [
    { id: 'a', type: 'if', data: {} },
    { id: 'b', type: 'end', data: {} },
  ];

  it('rejects malformed canvas', () => {
    expect(() => new WorkflowGraph({ nodes: [] } as unknown as WorkflowCanvas)).toThrow(
      'Workflow canvas is malformed',
    );
  });

  it('rejects node without id or type', () => {
    expect(
      () => new WorkflowGraph({ nodes: [{ id: '', type: 'start', data: {} }], edges: [] }),
    ).toThrow('Workflow node must have id and type');
  });

  it('rejects duplicate node id', () => {
    expect(() => new WorkflowGraph({ nodes: [nodes[0], nodes[0]], edges: [] })).toThrow(
      'Duplicate node id a',
    );
  });

  it('rejects edge pointing to missing node', () => {
    expect(() => new WorkflowGraph({ nodes, edges: [{ source: 'a', target: 'x' }] })).toThrow(
      'Target node x does not exist',
    );
  });

  it('rejects duplicate edge, treating null and missing handles as equal', () => {
    expect(
      () =>
        new WorkflowGraph({
          nodes,
          edges: [
            { source: 'a', target: 'b' },
            { source: 'a', target: 'b', sourceHandle: null },
          ],
        }),
    ).toThrow('Duplicate edge');
  });

  it('allows different handles to point to the same target', () => {
    expect(
      () =>
        new WorkflowGraph({
          nodes,
          edges: [
            { source: 'a', target: 'b', sourceHandle: 'true' },
            { source: 'a', target: 'b', sourceHandle: 'false' },
          ],
        }),
    ).not.toThrow();
  });
});
