import net from 'node:net';
import { EscPosParser } from './escpos-parser.js';
import { type PrinterModel } from './printer-model.js';
import { type ReceiptStore } from './receipt-store.js';

export interface PrinterState {
  enabled: boolean;
  setEnabled(value: boolean): void;
}

export function createTcpServer(model: PrinterModel, store: ReceiptStore, port: number): { server: net.Server; state: PrinterState } {
  const server = net.createServer((socket) => {
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`[tcp] Connection from ${remote}`);

    const parser = new EscPosParser(model, (receipt) => {
      store.add(receipt);
      console.log(`[tcp] Receipt ${receipt.id} (${receipt.lines.length} lines) from ${remote}`);
    });

    socket.on('data', (data) => {
      parser.process(data);
    });

    socket.on('end', () => {
      parser.flush();
      console.log(`[tcp] Disconnected: ${remote}`);
    });

    socket.on('error', (err) => {
      console.error(`[tcp] Socket error from ${remote}:`, err.message);
    });
  });

  server.listen(port, () => {
    console.log(`[tcp] ESC/POS printer listening on port ${port}`);
  });

  const state: PrinterState = {
    enabled: true,
    setEnabled(value: boolean) {
      if (value === this.enabled) return;
      this.enabled = value;
      if (value) {
        server.listen(port, () => {
          console.log(`[tcp] Printer ONLINE — listening on port ${port}`);
        });
      } else {
        // Close the listener so new connections get ECONNREFUSED
        server.close(() => {
          console.log(`[tcp] Printer OFFLINE — port ${port} closed`);
        });
      }
    },
  };

  return { server, state };
}
