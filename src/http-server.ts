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
// Fallback for dev mode (tsx runs from src/)
const HTML_PATH_DEV = path.join(__dirname, '..', 'src', 'html', 'index.html');

function getHtml(): string {
  if (fs.existsSync(HTML_PATH)) return fs.readFileSync(HTML_PATH, 'utf-8');
  if (fs.existsSync(HTML_PATH_DEV)) return fs.readFileSync(HTML_PATH_DEV, 'utf-8');
  return '<html><body><h1>index.html not found</h1></body></html>';
}

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

export function createHttpServer(store: ReceiptStore, port: number, printerState: PrinterState): http.Server {
  const clients = new Set<WebSocket>();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const method = req.method || 'GET';

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    // Routes
    if (url.pathname === '/' && method === 'GET') {
      const html = getHtml();
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }

    if (url.pathname === '/api/receipts' && method === 'GET') {
      json(res, store.getAll());
      return;
    }

    if (url.pathname === '/api/receipts/last' && method === 'GET') {
      const last = store.getLast();
      if (!last) { json(res, null, 404); return; }
      json(res, last);
      return;
    }

    if (url.pathname.startsWith('/api/receipts/') && method === 'GET') {
      const id = url.pathname.slice('/api/receipts/'.length);
      const receipt = store.getById(id);
      if (!receipt) { json(res, null, 404); return; }
      json(res, receipt);
      return;
    }

    if (url.pathname === '/api/receipts' && method === 'DELETE') {
      store.clear();
      json(res, { ok: true });
      return;
    }

    if (url.pathname === '/api/printer/status' && method === 'GET') {
      json(res, { enabled: printerState.enabled });
      return;
    }

    if (url.pathname === '/api/printer/toggle' && method === 'POST') {
      printerState.setEnabled(!printerState.enabled);
      console.log(`[http] Printer ${printerState.enabled ? 'ONLINE' : 'OFFLINE'}`);
      const msg = JSON.stringify({ type: 'printer-status', enabled: printerState.enabled });
      for (const ws of clients) {
        if (ws.readyState === ws.OPEN) ws.send(msg);
      }
      json(res, { enabled: printerState.enabled });
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  // WebSocket
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
  });

  store.on('receipt', (receipt: Receipt) => {
    const msg = JSON.stringify({ type: 'receipt', receipt });
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(msg);
      }
    }
  });

  server.listen(port, () => {
    console.log(`[http] Web UI: http://localhost:${port}`);
    console.log(`[http] API:    http://localhost:${port}/api/receipts`);
  });

  return server;
}
