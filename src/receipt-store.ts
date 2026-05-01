import { EventEmitter } from 'node:events';
import { type Receipt } from './receipt.js';

export class ReceiptStore extends EventEmitter {
  private receipts: Receipt[] = [];
  private maxSize: number;

  constructor(maxSize = 100) {
    super();
    this.maxSize = maxSize;
  }

  add(receipt: Receipt): void {
    this.receipts.push(receipt);
    if (this.receipts.length > this.maxSize) {
      this.receipts.shift();
    }
    this.emit('receipt', receipt);
  }

  getAll(): Receipt[] {
    return this.receipts;
  }

  getLast(): Receipt | undefined {
    return this.receipts[this.receipts.length - 1];
  }

  getById(id: string): Receipt | undefined {
    return this.receipts.find(r => r.id === id);
  }

  clear(): void {
    this.receipts = [];
  }
}
