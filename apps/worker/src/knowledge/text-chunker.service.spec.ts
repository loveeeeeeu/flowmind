import { TextChunker } from './text-chunker.service.js';

describe('TextChunker', () => {
  it('normalizes text and emits one continuous chunk for short content', () => {
    const chunks = new TextChunker(20, 4).chunk(' hello\r\n\r\n\r\nworld ');
    expect(chunks).toEqual([{ index: 0, content: 'hello\n\nworld', startOffset: 0, endOffset: 12 }]);
  });

  it('keeps overlap and prefers a nearby natural boundary', () => {
    const chunks = new TextChunker(12, 3).chunk('alpha beta. gamma delta. epsilon');
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.index)).toEqual(chunks.map((_, index) => index));
    expect(chunks[0].content).toContain('alpha beta.');
    expect(chunks[1].startOffset).toBeLessThan(chunks[0].endOffset);
  });

  it('rejects a configuration that could cause a non-advancing chunk loop', () => {
    expect(() => new TextChunker(100, 100)).toThrow('Invalid knowledge chunk configuration');
  });
});
