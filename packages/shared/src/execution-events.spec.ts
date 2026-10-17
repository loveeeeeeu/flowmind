import { getRunEventChannel } from './execution-events.js';

describe('getRunEventChannel', () => {
  it('uses an isolated channel for each workflow run', () => {
    expect(getRunEventChannel('run-123')).toBe('flowmind:run:run-123:events');
  });
});
