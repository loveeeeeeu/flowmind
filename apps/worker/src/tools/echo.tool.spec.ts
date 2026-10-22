import { EchoTool } from './echo.tool.js';

describe('EchoTool', () => {
  it('returns valid text and rejects invalid or extra LLM arguments', async () => {
    const tool = new EchoTool();

    await expect(tool.execute({ text: 'hello' }, { projectId: 'project-1' }))
      .resolves.toEqual({ output: { text: 'hello' } });
    await expect(tool.execute({ text: 123 }, { projectId: 'project-1' }))
      .rejects.toMatchObject({ code: 'TOOL_INPUT_INVALID' });
    await expect(tool.execute({ text: 'hello', projectId: 'project-b' }, { projectId: 'project-1' }))
      .rejects.toMatchObject({ code: 'TOOL_INPUT_INVALID' });
  });
});
