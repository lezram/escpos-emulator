import net from 'node:net';
import { EscPosParser } from './escpos-parser.js';
import { type PrinterModel } from './printer-model.js';
import { type ReceiptStore } from './receipt-store.js';

export function createTcpServer(model: PrinterModel, store: ReceiptStore, port: number): net.Server {
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

  return server;
}
