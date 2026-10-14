import { resolveRunCanvas } from './resolve-run-canvas.js';

const versionCanvas = { nodes: [{ id: 'v' }], edges: [] };
const snapshotCanvas = { nodes: [{ id: 's' }], edges: [] };

describe('resolveRunCanvas', () => {
  it('PUBLISHED runs execute the bound version canvas', () => {
    expect(
      resolveRunCanvas({
        source: 'PUBLISHED',
        workflowVersion: { canvas: versionCanvas },
        draftSnapshot: null,
      }),
    ).toBe(versionCanvas);
  });

  it('DRAFT runs execute their own snapshot', () => {
    expect(
      resolveRunCanvas({ source: 'DRAFT', workflowVersion: null, draftSnapshot: snapshotCanvas }),
    ).toBe(snapshotCanvas);
  });

  it('a PUBLISHED run without a version (legacy) fails with WORKFLOW_VERSION_MISSING', () => {
    expect(() =>
      resolveRunCanvas({ source: 'PUBLISHED', workflowVersion: null, draftSnapshot: null }),
    ).toThrow(expect.objectContaining({ code: 'WORKFLOW_VERSION_MISSING' }));
  });

  it('a DRAFT run without a snapshot fails with DRAFT_SNAPSHOT_MISSING', () => {
    expect(() =>
      resolveRunCanvas({ source: 'DRAFT', workflowVersion: null, draftSnapshot: null }),
    ).toThrow(expect.objectContaining({ code: 'DRAFT_SNAPSHOT_MISSING' }));
  });

  it('an unknown source fails instead of guessing a canvas', () => {
    expect(() =>
      resolveRunCanvas({
        source: 'SOMETHING_ELSE',
        workflowVersion: { canvas: versionCanvas },
        draftSnapshot: snapshotCanvas,
      }),
    ).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_RUN_SOURCE' }));
  });
});
