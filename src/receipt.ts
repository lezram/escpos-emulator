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

export interface Barcode {
  /** One character per module: '1' bar, '0' space */
  modules: string;
  moduleWidthDots: number; // GS w
  heightDots: number;      // GS h
}

export interface ReceiptLine {
  segments: TextSegment[];
  align: Alignment;
  barcode?: Barcode;
}

export interface Receipt {
  id: string;
  lines: ReceiptLine[];
  printAreaDots: number; // print area width (GS W) in force when the paper was cut
  receivedAt: string; // ISO timestamp
}

export function createReceipt(lines: ReceiptLine[], printAreaDots: number): Receipt {
  return {
    id: randomUUID(),
    lines,
    printAreaDots,
    receivedAt: new Date().toISOString(),
  };
}
