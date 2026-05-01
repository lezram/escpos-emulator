import { randomUUID } from 'node:crypto';

export type Alignment = 'left' | 'center' | 'right';

export interface TextSegment {
  text: string;
  bold: boolean;
  underline: 0 | 1 | 2;
  font: string;
  width: number;  // 1-8 multiplier
  height: number; // 1-8 multiplier
  reverse: boolean;
}

export interface ReceiptLine {
  segments: TextSegment[];
  align: Alignment;
}

export interface Receipt {
  id: string;
  lines: ReceiptLine[];
  receivedAt: string; // ISO timestamp
}

export function createReceipt(lines: ReceiptLine[]): Receipt {
  return {
    id: randomUUID(),
    lines,
    receivedAt: new Date().toISOString(),
  };
}
