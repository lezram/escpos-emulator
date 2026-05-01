# AGENTS.md — AI Context for escpos-emulator

## Project Purpose

A Node.js TypeScript ESC/POS thermal receipt printer emulator. Receives raw ESC/POS byte streams over TCP (port 9100) like a real Epson TM-M30III printer, parses them, and provides:

1. Live HTML preview via WebSocket
2. REST API for automated test validation

Target use case: replace a physical printer during development/testing of a Flutter/Dart POS app.

## Build & Run

```bash
npm install          # install deps
npm run dev          # dev mode with hot reload (tsx --watch)
npm run build        # compile TypeScript to dist/
npm start            # run compiled version
npm run test-print   # send a sample receipt to TCP:9100
```

Environment: `TCP_PORT=9100`, `HTTP_PORT=3000`, `PRINTER_MODEL=TM-M30III`

## Architecture

```
src/
├── index.ts            # Entry point, reads env config
├── printer-model.ts    # Printer hardware specs (fonts, paper width, DPI)
├── receipt.ts          # Data model: Receipt, ReceiptLine, TextSegment
├── escpos-parser.ts    # Core: byte-stream state machine → Receipt
├── receipt-store.ts    # In-memory store (max 100, EventEmitter)
├── tcp-server.ts       # net.Server on port 9100, one parser per connection
├── http-server.ts      # HTTP routes + WebSocket broadcast
└── html/index.html     # Single-file SPA (receipt viewer, sidebar, WS client)
```

- **No Express** — uses native `http` module
- **Single runtime dep** — `ws` for WebSocket
- ESM modules (`"type": "module"`), TypeScript strict mode, ES2022 target

## Target Printer: Epson TM-M30III

- 80mm paper, 72mm printable width (576 dots at 203 DPI)
- Font A: 48 chars/line, 12px wide per char
- Font B: 64 chars/line, 9px wide per char
- Default code page: ISO 8859-15 (code page 40, selected via `ESC t 40`)

## ESC/POS Protocol Reference

### Official Epson Documentation

- Command reference: https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/ref_escpos_en/index.html
- Code page tables: https://download4.epson.biz/sec_pubs/pos/reference_en/charcode/page_00.html
- TM-M30III spec sheet: https://www.epson-biz.com/modules/pos/index.php?page=single_doc&cid=8073&scat=31&pcat=3

### Command Format

Commands are prefixed by escape bytes:
- `ESC` (0x1B) — standard commands
- `GS` (0x1D) — graphic/status commands
- `FS` (0x1C) — kanji/special commands

Printable ASCII range: 0x20–0x7E. Bytes 0x80–0xFF decoded via active code page.

### Key Commands Implemented

| Command | Bytes | Description |
|---------|-------|-------------|
| ESC @ | 1B 40 | Initialize/reset |
| ESC ! | 1B 21 n | Print mode composite (font+bold+underline+size) |
| ESC $ | 1B 24 nL nH | Absolute print position (dots = nL + nH×256) |
| ESC \ | 1B 5C nL nH | Relative print position |
| ESC E | 1B 45 n | Bold on (n&1) / off |
| ESC M | 1B 4D n | Font select: 0=A, 1=B |
| ESC a | 1B 61 n | Alignment: 0=left, 1=center, 2=right |
| ESC t | 1B 74 n | Select code page |
| GS ! | 1D 21 n | Size: width=(n>>4)+1, height=(n&0F)+1 |
| GS V | 1D 56 m | Paper cut |

### How Column Layout Works (Dart esc_pos_utils_plus)

The Dart library uses a 12-column grid on 576-dot width:
- `_colIndToPosition(colInd) = (width × colInd) / 12`
- Each column starts at an absolute dot position via ESC $ (0x1B 0x24 nL nH)
- Positions: col0=0, col1=48, col2=96, ..., col11=528 (for 576-dot width)

The parser converts dot positions to character-space padding by dividing gap by font pixel width.

## Client Dart Code Context

The POS app uses:
- `esc_pos_utils_plus` (Dart) for ESC/POS generation
- `enough_convert` Latin15Codec / Latin16Encoder for text encoding
- Code page 40 (ISO 8859-15) where byte 0xA4 = € (euro sign)
- Font B with `maxCharsPerLine: 48` explicitly set
- `PosColumn` with 12-unit width grid for multi-column rows
- Direct TCP socket connection to printer port

### Dart Capability Profile (TM-M30III)

```json
{
  "TM": {
    "codePages": {
      "0": "PC437",
      "19": "PC858",
      "40": "ISO8859-15"
    },
    "vendor": "Epson",
    "model": "TM-M30III",
    "description": "Epson TM-M30III ESC/POS profile"
  }
}
```

### Full Code Page Table (Epson default profile)

| ID | Code Page | ID | Code Page |
|----|-----------|-----|-----------|
| 0 | CP437 | 30 | TCVN-3-1 |
| 1 | CP932 | 31 | TCVN-3-2 |
| 2 | CP850 | 32 | CP720 |
| 3 | CP860 | 33 | CP775 |
| 4 | CP863 | 34 | CP855 |
| 5 | CP865 | 35 | CP861 |
| 11 | CP851 | 36 | CP862 |
| 12 | CP853 | 37 | CP864 |
| 13 | CP857 | 38 | CP869 |
| 14 | CP737 | 39 | ISO 8859-2 |
| 15 | ISO 8859-7 | **40** | **ISO 8859-15** |
| 16 | CP1252 | 41 | CP1098 |
| 17 | CP866 | 42 | CP774 |
| 18 | CP852 | 43 | CP772 |
| 19 | CP858 | 44 | CP1125 |
| 20 | Unknown | 45 | CP1250 |
| 21 | CP874 | 46 | CP1251 |

## Data Model

```typescript
interface TextSegment {
  text: string;
  bold: boolean;
  underline: 0 | 1 | 2;
  font: string;       // 'A' or 'B'
  width: number;      // 1-8 multiplier
  height: number;     // 1-8 multiplier
  reverse: boolean;
}

interface ReceiptLine {
  segments: TextSegment[];
  align: 'left' | 'center' | 'right';
}

interface Receipt {
  id: string;          // UUID
  lines: ReceiptLine[];
  receivedAt: string;  // ISO timestamp
}
```

Lines with ESC $ positioning are forced to `align: 'left'` (spacing handles layout).

## Design Decisions

- **Segment-based lines**: A line can have multiple `TextSegment`s with different styles (needed for ESC $ column positioning within a line)
- **Position tracking**: Parser tracks `currentPosDots` to convert absolute dot positions into space-character padding
- **ISO 8859-15 map**: Only 8 bytes differ from Latin-1; hardcoded map for those positions (0xA4=€, 0xA6=Š, etc.)
- **Paper reduction**: HTML viewer has a toggle to hide whitespace-only lines (Dart lib emits `emptyLines()` between rows)
- **No image/barcode rendering**: GS v 0 and GS k are parsed/skipped, placeholder `[IMAGE]` emitted
- **Graceful unknown command handling**: Logs warning, skips 1 byte for ESC prefix, immediate return for GS/FS

## Known Limitations

- Only ISO 8859-15 code page fully mapped (code page 40). Other pages decode as Latin-1 fallback.
- No bidirectional communication (DLE/ENQ status responses not implemented)
- Images/barcodes/QR codes are skipped (not rendered)
- No cash drawer pulse emulation (ESC p parsed but no-op)
- Italics (ESC 4/5) not implemented — likely deprecated in modern ESC/POS, not used by Epson TM series

## Protocol Notes

- ESC/POS is a command standard created by Epson, well supported by modern receipt printers
- Commands are sent over TCP/IP (port 9100) as raw bytes
- Text is sent as plain ASCII/encoded bytes with line breaks (LF = 0x0A)
- Each line is executed as it arrives, in order
- `ESC` (0x1B) or `GS` (0x1D) characters denote the start of a command
- Italics (`ESC 4`/`ESC 5`) are probably deprecated in modern ESC/POS — not in official Epson TM docs, possibly vendor-specific (Pyramid) or from dot-matrix era (Epson FX)
- The node-escpos library and other open-source implementations often reference old/deprecated commands — always verify against official Epson TM-M30III docs

## Testing

Send raw bytes to TCP:9100, then query REST API:
```bash
curl http://localhost:3000/api/receipts/last | jq '.lines[].segments[].text'
```

Or open http://localhost:3000 for live visual preview.
