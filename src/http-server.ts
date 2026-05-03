import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { type ReceiptStore } from './receipt-store.js';
import { type Receipt } from './receipt.js';
import { type PrinterState } from './tcp-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.join(__dirname, 'html', 'index.html');
const HTML_PATH_DEV = path.join(__dirname, '..', 'src', 'html', 'index.html');

export interface PrinterInstance {
  id: string;
  name: string;
  tcpPort: number;
  store: ReceiptStore;
  state: PrinterState;
}

function getHtml(): string {
  if (fs.existsSync(HTML_PATH)) return fs.readFileSync(HTML_PATH, 'utf-8');
  if (fs.existsSync(HTML_PATH_DEV)) return fs.readFileSync(HTML_PATH_DEV, 'utf-8');
  return '<html><body><h1>index.html not found</h1></body></html>';
}

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

export function createHttpServer(printers: PrinterInstance[], port: number): http.Server {
  const printerMap = new Map(printers.map(p => [p.id, p]));
  const clients = new Set<WebSocket>();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const method = req.method || 'GET';

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (url.pathname === '/' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(getHtml());
      return;
    }

    if (url.pathname === '/api/printers' && method === 'GET') {
      json(res, printers.map(p => ({ id: p.id, name: p.name, tcpPort: p.tcpPort, enabled: p.state.enabled })));
      return;
    }

    // /api/printers/:id/...
    const printerMatch = url.pathname.match(/^\/api\/printers\/([^/]+)(\/.*)?$/);
    if (printerMatch) {
      const printerId = decodeURIComponent(printerMatch[1]);
      const subpath = printerMatch[2] || '/';
      const printer = printerMap.get(printerId);
      if (!printer) { json(res, { error: 'Printer not found' }, 404); return; }

      if (subpath === '/receipts' && method === 'GET') {
        json(res, printer.store.getAll());
        return;
      }
      if (subpath === '/receipts/last' && method === 'GET') {
        const last = printer.store.getLast();
        if (!last) { json(res, null, 404); return; }
        json(res, last);
        return;
      }
      if (subpath.startsWith('/receipts/') && method === 'GET') {
        const id = subpath.slice('/receipts/'.length);
        const receipt = printer.store.getById(id);
        if (!receipt) { json(res, null, 404); return; }
        json(res, receipt);
        return;
      }
      if (subpath === '/receipts' && method === 'DELETE') {
        printer.store.clear();
        json(res, { ok: true });
        return;
      }
      if (subpath === '/status' && method === 'GET') {
        json(res, { enabled: printer.state.enabled });
        return;
      }
      if (subpath === '/toggle' && method === 'POST') {
        printer.state.setEnabled(!printer.state.enabled);
        console.log(`[http] Printer "${printer.name}" ${printer.state.enabled ? 'ONLINE' : 'OFFLINE'}`);
        const msg = JSON.stringify({ type: 'printer-status', printerId: printer.id, enabled: printer.state.enabled });
        for (const ws of clients) {
          if (ws.readyState === ws.OPEN) ws.send(msg);
        }
        json(res, { enabled: printer.state.enabled });
        return;
      }
    }

    res.writeHead(404);
    res.end('Not found');
  });

  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
  });

  for (const printer of printers) {
    printer.store.on('receipt', (receipt: Receipt) => {
      const msg = JSON.stringify({ type: 'receipt', printerId: printer.id, receipt });
      for (const ws of clients) {
        if (ws.readyState === ws.OPEN) ws.send(msg);
      }
    });
  }

  server.listen(port, () => {
    console.log(`[http] Web UI: http://localhost:${port}`);
    console.log(`[http] API:    http://localhost:${port}/api/printers`);
  });

  return server;
}
