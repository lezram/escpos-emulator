#!/usr/bin/env node
import { getModel } from './printer-model.js';
import { ReceiptStore } from './receipt-store.js';
import { createTcpServer } from './tcp-server.js';
import { createHttpServer, type PrinterInstance } from './http-server.js';

interface PrinterConfig {
  id: string;
  name: string;
  tcpPort: number;
  model?: string;
}

function getPrinterConfigs(): PrinterConfig[] {
  if (process.env.PRINTERS) {
    try {
      return JSON.parse(process.env.PRINTERS);
    } catch {
      console.error('[escpos-emulator] Invalid PRINTERS env var, falling back to defaults');
    }
  }
  return [{
    id: 'default',
    name: process.env.PRINTER_NAME || 'Printer',
    tcpPort: parseInt(process.env.TCP_PORT || '9100', 10),
    model: process.env.PRINTER_MODEL,
  }];
}

const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000', 10);
const configs = getPrinterConfigs();

const printerInstances: PrinterInstance[] = configs.map(cfg => {
  const model = getModel(cfg.model || 'TM-M30III');
  console.log(`[escpos-emulator] Printer "${cfg.name}" (${cfg.id}) — ${model.vendor} ${model.name}, TCP port ${cfg.tcpPort}`);
  const store = new ReceiptStore();
  const { state } = createTcpServer(model, store, cfg.tcpPort);
  return { id: cfg.id, name: cfg.name, tcpPort: cfg.tcpPort, store, state };
});

createHttpServer(printerInstances, HTTP_PORT);
