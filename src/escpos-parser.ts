import { type PrinterModel } from './printer-model.js';
import { type Alignment, type TextSegment, type ReceiptLine, createReceipt, type Receipt } from './receipt.js';

// Control bytes
const LF = 0x0a;
const CR = 0x0d;
const HT = 0x09;
const ESC = 0x1b;
const FS = 0x1c;
const GS = 0x1d;

// ISO 8859-15 differs from 8859-1 at these byte positions
const ISO_8859_15_MAP: Record<number, string> = {
  0xa4: '\u20ac', 0xa6: '\u0160', 0xa8: '\u0161', 0xb4: '\u017d',
  0xb8: '\u017e', 0xbc: '\u0152', 0xbd: '\u0153', 0xbe: '\u0178',
};

type ParserCallback = (receipt: Receipt) => void;

interface PrintState {
  font: string;
  bold: boolean;
  underline: 0 | 1 | 2;
  align: Alignment;
  width: number;
  height: number;
  reverse: boolean;
}

export class EscPosParser {
  private model: PrinterModel;
  private state: PrintState;
  private lines: ReceiptLine[];
  private onReceipt: ParserCallback;

  // Current line accumulation
  private lineSegments: TextSegment[] = [];
  private currentText: string = '';
  private currentPosDots: number = 0;
  private lineUsedAbsPos: boolean = false; // true if ESC $ was used on this line

  // Command parsing state
  private commandHandler: ((byte: number) => boolean) | null = null;

  constructor(model: PrinterModel, onReceipt: ParserCallback) {
    this.model = model;
    this.onReceipt = onReceipt;
    this.lines = [];
    this.state = this.defaultState();
  }

  private defaultState(): PrintState {
    return {
      font: this.model.defaultFont,
      bold: false,
      underline: 0,
      align: 'left',
      width: 1,
      height: 1,
      reverse: false,
    };
  }

  /** Width of one character in dots at current settings */
  private get charWidthDots(): number {
    const font = this.model.fonts[this.state.font] || this.model.fonts[this.model.defaultFont];
    return font.widthPx * this.state.width;
  }

  /** Base character width in dots (no size multiplier) */
  private get baseCharWidthDots(): number {
    const font = this.model.fonts[this.state.font] || this.model.fonts[this.model.defaultFont];
    return font.widthPx;
  }

  process(data: Buffer): void {
    for (let i = 0; i < data.length; i++) {
      const byte = data[i];

      if (this.commandHandler) {
        const currentHandler = this.commandHandler;
        const done = currentHandler(byte);
        if (done && this.commandHandler === currentHandler) {
          this.commandHandler = null;
        }
        continue;
      }

      switch (byte) {
        case LF:
        case CR:
          this.flushLine();
          break;

        case HT:
          this.currentText += '    ';
          this.currentPosDots += this.charWidthDots * 4;
          break;

        case ESC:
          this.commandHandler = this.handleEsc();
          break;

        case FS:
          this.commandHandler = this.handleFs();
          break;

        case GS:
          this.commandHandler = this.handleGs();
          break;

        default:
          if (byte >= 0x20) {
            this.currentText += ISO_8859_15_MAP[byte] ?? String.fromCharCode(byte);
            this.currentPosDots += this.charWidthDots;
          }
          break;
      }
    }
  }

  flush(): void {
    if (this.currentText.length > 0 || this.lineSegments.length > 0) {
      this.flushLine();
    }
    if (this.lines.length > 0) {
      this.emitReceipt();
    }
  }

  private flushLine(): void {
    this.flushSegment();
    const segments = this.lineSegments.length > 0
      ? this.lineSegments
      : [{ text: '', bold: false, underline: 0 as const, font: this.state.font, width: 1, height: 1, reverse: false }];
    // If absolute positioning was used, alignment is handled by spacing — force left
    const align = this.lineUsedAbsPos ? 'left' as const : this.state.align;
    this.lines.push({ segments, align });
    this.lineSegments = [];
    this.currentPosDots = 0;
    this.lineUsedAbsPos = false;
  }

  private flushSegment(): void {
    if (this.currentText.length > 0) {
      this.lineSegments.push({
        text: this.currentText,
        bold: this.state.bold,
        underline: this.state.underline,
        font: this.state.font,
        width: this.state.width,
        height: this.state.height,
        reverse: this.state.reverse,
      });
      this.currentText = '';
    }
  }

  private setAbsolutePosition(posDots: number): void {
    this.flushSegment();
    this.lineUsedAbsPos = true;
    if (posDots > this.currentPosDots) {
      const gapDots = posDots - this.currentPosDots;
      const spaces = Math.round(gapDots / this.baseCharWidthDots);
      if (spaces > 0) {
        this.lineSegments.push({
          text: ' '.repeat(spaces),
          bold: false,
          underline: 0,
          font: this.state.font,
          width: 1,
          height: 1,
          reverse: false,
        });
      }
    }
    this.currentPosDots = posDots;
  }

  private emitReceipt(): void {
    if (this.lines.length === 0) return;
    const receipt = createReceipt(this.lines);
    this.lines = [];
    this.onReceipt(receipt);
  }

  // --- ESC commands (0x1B ...) ---

  private handleEsc(): (byte: number) => boolean {
    return (byte: number): boolean => {
      switch (byte) {
        case 0x40: // ESC @ — Initialize printer
          this.state = this.defaultState();
          this.currentText = '';
          this.lineSegments = [];
          this.currentPosDots = 0;
          return true;

        case 0x21: // ESC ! n — Select print mode
          this.commandHandler = this.readBytes(1, ([n]) => {
            this.flushSegment();
            this.state.font = (n & 0x01) ? 'B' : 'A';
            this.state.bold = !!(n & 0x08);
            this.state.height = (n & 0x10) ? 2 : 1;
            this.state.width = (n & 0x20) ? 2 : 1;
            this.state.underline = (n & 0x80) ? 1 : 0;
          });
          return true;

        case 0x24: // ESC $ nL nH — Set absolute print position
          this.commandHandler = this.readBytes(2, ([nL, nH]) => {
            this.setAbsolutePosition(nL + nH * 256);
          });
          return true;

        case 0x2d: // ESC - n — Underline
          this.commandHandler = this.readBytes(1, ([n]) => {
            this.flushSegment();
            this.state.underline = (n === 0 || n === 48) ? 0 : (n === 2 || n === 50) ? 2 : 1;
          });
          return true;

        case 0x32: // ESC 2 — Default line spacing
          return true;

        case 0x33: // ESC 3 n — Set line spacing
          this.commandHandler = this.readBytes(1, () => {});
          return true;

        case 0x45: // ESC E n — Bold on/off
          this.commandHandler = this.readBytes(1, ([n]) => {
            this.flushSegment();
            this.state.bold = !!(n & 0x01);
          });
          return true;

        case 0x4d: // ESC M n — Select font
          this.commandHandler = this.readBytes(1, ([n]) => {
            this.flushSegment();
            if (n === 0 || n === 48) this.state.font = 'A';
            else if (n === 1 || n === 49) this.state.font = 'B';
          });
          return true;

        case 0x52: // ESC R n — Select international charset
          this.commandHandler = this.readBytes(1, () => {});
          return true;

        case 0x61: // ESC a n — Justification
          this.commandHandler = this.readBytes(1, ([n]) => {
            this.flushSegment();
            if (n === 0 || n === 48) this.state.align = 'left';
            else if (n === 1 || n === 49) this.state.align = 'center';
            else if (n === 2 || n === 50) this.state.align = 'right';
          });
          return true;

        case 0x64: // ESC d n — Feed n lines
          this.commandHandler = this.readBytes(1, ([n]) => {
            this.flushLine();
            for (let i = 0; i < n - 1; i++) {
              this.lines.push({ segments: [{ text: '', bold: false, underline: 0, font: this.state.font, width: 1, height: 1, reverse: false }], align: this.state.align });
            }
          });
          return true;

        case 0x74: // ESC t n — Select code table
          this.commandHandler = this.readBytes(1, () => {});
          return true;

        case 0x70: // ESC p m t1 t2 — Generate pulse (cash drawer)
          this.commandHandler = this.readBytes(3, () => {});
          return true;

        case 0x5c: // ESC \ nL nH — Set relative print position
          this.commandHandler = this.readBytes(2, ([nL, nH]) => {
            const offset = nL + nH * 256;
            this.setAbsolutePosition(this.currentPosDots + offset);
          });
          return true;

        case 0x63: // ESC c — Paper sensor (subcommand + 1 byte)
          this.commandHandler = this.readBytes(2, () => {});
          return true;

        case 0x69: // ESC i — Partial cut (obsolete)
          this.flushLine();
          this.emitReceipt();
          return true;

        case 0x6d: // ESC m — Full cut (obsolete)
          this.flushLine();
          this.emitReceipt();
          return true;

        default:
          console.warn(`[escpos-parser] Unknown ESC command: 0x${byte.toString(16)}`);
          this.commandHandler = this.readBytes(1, () => {});
          return true;
      }
    };
  }

  // --- FS commands (0x1C ...) ---

  private handleFs(): (byte: number) => boolean {
    return (byte: number): boolean => {
      switch (byte) {
        case 0x2e: // FS . — Cancel Kanji character mode
          return true;

        case 0x70: // FS p n m — Print NV bit image
          this.commandHandler = this.readBytes(2, () => {});
          return true;

        case 0x28: // FS ( — multi-byte FS commands
          this.commandHandler = this.handleFsExtended();
          return true;

        default:
          console.warn(`[escpos-parser] Unknown FS command: 0x${byte.toString(16)}`);
          return true;
      }
    };
  }

  private handleFsExtended(): (byte: number) => boolean {
    const prefix: number[] = [];
    return (byte: number): boolean => {
      prefix.push(byte);
      if (prefix.length < 3) return false;
      const pL = prefix[1], pH = prefix[2];
      const dataLen = pL + pH * 256 - 2;
      if (dataLen > 0) {
        this.commandHandler = this.readBytes(dataLen, () => {});
      }
      return true;
    };
  }

  // --- GS commands (0x1D ...) ---

  private handleGs(): (byte: number) => boolean {
    return (byte: number): boolean => {
      switch (byte) {
        case 0x21: // GS ! n — Select character size
          this.commandHandler = this.readBytes(1, ([n]) => {
            this.flushSegment();
            this.state.width = ((n >> 4) & 0x07) + 1;
            this.state.height = (n & 0x07) + 1;
          });
          return true;

        case 0x42: // GS B n — Reverse print
          this.commandHandler = this.readBytes(1, ([n]) => {
            this.flushSegment();
            this.state.reverse = !!(n & 0x01);
          });
          return true;

        case 0x56: // GS V m [n] — Cut paper
          this.commandHandler = this.handleGsCut();
          return true;

        case 0x76: // GS v 0 — Print raster bit image
          this.commandHandler = this.handleGsRasterImage();
          return true;

        case 0x28: // GS ( — multi-byte GS commands
          this.commandHandler = this.handleGsExtended();
          return true;

        case 0x6b: // GS k — Print barcode
          this.commandHandler = this.handleGsBarcode();
          return true;

        case 0x48: // GS H n — HRI position
        case 0x68: // GS h n — Barcode height
        case 0x77: // GS w n — Barcode width
        case 0x66: // GS f n — HRI font
          this.commandHandler = this.readBytes(1, () => {});
          return true;

        default:
          console.warn(`[escpos-parser] Unknown GS command: 0x${byte.toString(16)}`);
          return true;
      }
    };
  }

  private handleGsCut(): (byte: number) => boolean {
    return (byte: number): boolean => {
      if (byte === 65 || byte === 66) {
        this.commandHandler = this.readBytes(1, () => {
          this.flushLine();
          this.emitReceipt();
        });
      } else {
        this.flushLine();
        this.emitReceipt();
      }
      return true;
    };
  }

  private handleGsRasterImage(): (byte: number) => boolean {
    const header: number[] = [];
    return (byte: number): boolean => {
      header.push(byte);
      if (header.length < 5) return false;
      const xL = header[1], xH = header[2], yL = header[3], yH = header[4];
      const dataLen = (xL + xH * 256) * (yL + yH * 256);
      if (dataLen > 0) {
        this.commandHandler = this.readBytes(dataLen, () => {
          this.lineSegments.push({ text: '[IMAGE]', bold: false, underline: 0, font: this.state.font, width: 1, height: 1, reverse: false });
        });
      }
      return true;
    };
  }

  private handleGsExtended(): (byte: number) => boolean {
    const header: number[] = [];
    return (byte: number): boolean => {
      header.push(byte);
      if (header.length < 3) return false;
      const pL = header[1], pH = header[2];
      const dataLen = pL + pH * 256;
      if (dataLen > 0) {
        this.commandHandler = this.readBytes(dataLen, () => {});
      }
      return true;
    };
  }

  private handleGsBarcode(): (byte: number) => boolean {
    let m = -1;
    return (byte: number): boolean => {
      if (m === -1) {
        m = byte;
        this.commandHandler = m >= 65 ? this.readBarcodeLengthPrefixed() : this.readUntilNull();
        return true;
      }
      return true;
    };
  }

  private readBarcodeLengthPrefixed(): (byte: number) => boolean {
    let len = -1;
    let read = 0;
    return (byte: number): boolean => {
      if (len === -1) { len = byte; return len === 0; }
      return ++read >= len;
    };
  }

  private readUntilNull(): (byte: number) => boolean {
    return (byte: number): boolean => byte === 0x00;
  }

  private readBytes(count: number, fn: (bytes: number[]) => void): (byte: number) => boolean {
    const buf: number[] = [];
    return (byte: number): boolean => {
      buf.push(byte);
      if (buf.length >= count) { fn(buf); return true; }
      return false;
    };
  }
}
