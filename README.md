# escpos-emulator

A lightweight ESC/POS thermal receipt printer emulator for development and testing. Receives raw ESC/POS byte streams over TCP (like a real printer), parses them, and provides:

- **Live HTML preview** — receipts render in your browser as they arrive
- **REST API** — retrieve and validate receipt content in automated tests
- **WebSocket** — real-time updates pushed to connected browsers

Currently emulates an **Epson TM-M30III** (80mm paper, Font A: 42 chars/line, Font B: 56 chars/line).

## Quick Use

```bash
npx escpos-emulator          # no install, just run
npm i -g escpos-emulator     # or install globally
escpos-emulator              # then run anytime
```

## Quick Start (from source)

```bash
npm ci
npm run dev
```

- **TCP printer**: `localhost:9100` — point your POS app here
- **Web UI**: `http://localhost:3000` — live receipt viewer
- **API**: `http://localhost:3000/api/receipts` — JSON access

## Test Print

```bash
npm run test-print
```

Sends a sample formatted receipt to verify the emulator works.

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `TCP_PORT` | `9100` | Port the virtual printer listens on |
| `HTTP_PORT` | `3000` | Port for web UI and REST API |
| `PRINTER_MODEL` | `TM-M30III` | Printer model to emulate |

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/receipts` | All stored receipts |
| GET | `/api/receipts/last` | Most recent receipt |
| GET | `/api/receipts/:id` | Single receipt by ID |
| DELETE | `/api/receipts` | Clear all receipts |

## Supported ESC/POS Commands

| Command | Bytes | Function |
|---------|-------|----------|
| ESC @ | `1B 40` | Initialize printer |
| ESC ! | `1B 21 n` | Select print mode (font/bold/size/underline) |
| ESC - | `1B 2D n` | Underline on/off |
| ESC 2 | `1B 32` | Default line spacing |
| ESC 3 | `1B 33 n` | Set line spacing |
| ESC E | `1B 45 n` | Bold on/off |
| ESC M | `1B 4D n` | Select font (A/B) |
| ESC R | `1B 52 n` | International charset |
| ESC a | `1B 61 n` | Justification (left/center/right) |
| ESC d | `1B 64 n` | Feed n lines |
| ESC t | `1B 74 n` | Select code table |
| ESC p | `1B 70 m t1 t2` | Cash drawer pulse |
| GS ! | `1D 21 n` | Character size (width/height multiplier) |
| GS B | `1D 42 n` | Reverse print on/off |
| GS V | `1D 56 m` | Paper cut |
| GS v 0 | `1D 76 30 ...` | Raster bit image (skipped) |
| GS ( k | `1D 28 6B ...` | 2D codes / QR (skipped) |
| GS k | `1D 6B m ...` | Barcode (skipped) |

Unsupported commands are gracefully skipped with a console warning.

## Adding a Printer Model

Edit `src/printer-model.ts` and add a new object conforming to `PrinterModel`:

```typescript
export const MY_PRINTER: PrinterModel = {
  name: 'My-Printer',
  vendor: 'Vendor',
  paperWidthMm: 80,
  printableWidthMm: 72,
  dpi: 203,
  fonts: {
    A: { charsPerLine: 42, widthPx: 12, heightPx: 24 },
    B: { charsPerLine: 56, widthPx: 9, heightPx: 24 },
  },
  defaultFont: 'A',
  defaultCodePage: 'iso-8859-15',
};
```

Then add it to the `models` record and set `PRINTER_MODEL=My-Printer` env var.

## Architecture

```
POS App ──TCP:9100──► EscPosParser ──► ReceiptStore ──► HTTP API
                                                    └──► WebSocket ──► Browser
```

## License

MIT
