#!/usr/bin/env node
import { getModel, TM_M30III } from './printer-model.js';
import { ReceiptStore } from './receipt-store.js';
import { createTcpServer } from './tcp-server.js';
import { createHttpServer } from './http-server.js';

const TCP_PORT = parseInt(process.env.TCP_PORT || '9100', 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000', 10);
const MODEL_NAME = process.env.PRINTER_MODEL || 'TM-M30III';

const model = getModel(MODEL_NAME);
const store = new ReceiptStore();

console.log(`[escpos-emulator] Emulating: ${model.vendor} ${model.name}`);
console.log(`[escpos-emulator] Paper: ${model.paperWidthMm}mm, Font A: ${model.fonts['A']?.charsPerLine} chars/line`);

createTcpServer(model, store, TCP_PORT);
createHttpServer(store, HTTP_PORT);
