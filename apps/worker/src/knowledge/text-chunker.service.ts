import { Injectable } from '@nestjs/common';

export interface TextChunk {
  index: number;
  content: string;
  startOffset: number;
  endOffset: number;
}

@Injectable()
export class TextChunker {
  readonly chunkSize: number;
  readonly overlap: number;

  constructor(chunkSize = 1200, overlap = 200) {
    if (!Number.isInteger(chunkSize) || !Number.isInteger(overlap) || chunkSize <= 0 || overlap < 0 || overlap >= chunkSize) {
      throw new Error('Invalid knowledge chunk configuration');
    }
    this.chunkSize = chunkSize;
    this.overlap = overlap;
  }

  chunk(rawText: string): TextChunk[] {
    const text = this.normalize(rawText);
    if (!text) return [];

    const chunks: TextChunk[] = [];
    let start = 0;
    while (start < text.length) {
      const rawEnd = Math.min(start + this.chunkSize, text.length);
      const end = this.findBetterBoundary(text, start, rawEnd);
      const content = text.slice(start, end).trim();
      if (content) {
        chunks.push({ index: chunks.length, content, startOffset: start, endOffset: end });
      }
      if (end >= text.length) break;
      start = Math.max(end - this.overlap, start + 1);
    }
    return chunks;
  }

  private normalize(text: string) {
    return text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  private findBetterBoundary(text: string, start: number, rawEnd: number) {
    if (rawEnd >= text.length) return text.length;
    const searchStart = Math.max(start, rawEnd - 200);
    const segment = text.slice(searchStart, rawEnd);
    const candidates = [
      { index: segment.lastIndexOf('\n\n'), length: 2 },
      { index: segment.lastIndexOf('\n'), length: 1 },
      { index: segment.lastIndexOf('。'), length: 1 },
      { index: segment.lastIndexOf('. '), length: 1 },
    ].filter((candidate) => candidate.index >= 0);
    if (candidates.length === 0) return rawEnd;
    const best = candidates.reduce((latest, candidate) => candidate.index > latest.index ? candidate : latest);
    return searchStart + best.index + best.length;
  }
}
