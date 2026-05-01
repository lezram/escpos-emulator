/**
 * Test script: sends a sample receipt to the ESC/POS emulator via TCP.
 * Usage: npx tsx test-print.ts
 */
import net from 'node:net';

const PORT = parseInt(process.env.TCP_PORT || '9100', 10);
const HOST = process.env.TCP_HOST || '127.0.0.1';

// ESC/POS constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

function cmd(...bytes: number[]): Buffer {
  return Buffer.from(bytes);
}

function text(str: string): Buffer {
  return Buffer.from(str, 'latin1');
}

const socket = net.createConnection({ host: HOST, port: PORT }, () => {
  console.log(`Connected to ${HOST}:${PORT}`);

  const chunks: Buffer[] = [];
  const send = (...bufs: Buffer[]) => bufs.forEach(b => chunks.push(b));

  // Initialize printer
  send(cmd(ESC, 0x40));

  // Select code table: ISO 8859-15
  send(cmd(ESC, 0x74, 40));

  // --- Header (centered, bold, double size) ---
  send(cmd(ESC, 0x61, 1));           // Center
  send(cmd(ESC, 0x45, 1));           // Bold ON
  send(cmd(GS, 0x21, 0x11));         // Double width + double height
  send(text('CAFE RECEIPT'), cmd(LF));

  // Reset size, keep center
  send(cmd(GS, 0x21, 0x00));
  send(cmd(ESC, 0x45, 0));           // Bold OFF
  send(text('------------------------------------------------'), cmd(LF));

  // --- Body (left aligned, font B, column layout with ESC $) ---
  send(cmd(ESC, 0x61, 0));           // Left
  send(cmd(ESC, 0x4d, 1));           // Font B
  // Row: "1x    Cappuccino              3.50€"
  send(cmd(ESC, 0x24, 0, 0));        // Position 0
  send(text('1x'));
  send(cmd(ESC, 0x24, 50, 0));       // Position 50 dots
  send(text('Cappuccino'));
  send(cmd(ESC, 0x24, 230, 1));      // Position 486 dots (right area)
  send(text('3.50'), Buffer.from([0xa4])); // €
  send(cmd(LF));

  send(cmd(ESC, 0x24, 0, 0));
  send(text('2x'));
  send(cmd(ESC, 0x24, 50, 0));
  send(text('Croissant'));
  send(cmd(ESC, 0x24, 230, 1));
  send(text('5.60'), Buffer.from([0xa4]));
  send(cmd(LF));

  send(cmd(ESC, 0x24, 0, 0));
  send(text('1x'));
  send(cmd(ESC, 0x24, 50, 0));
  send(text('Orange Juice'));
  send(cmd(ESC, 0x24, 230, 1));
  send(text('4.20'), Buffer.from([0xa4]));
  send(cmd(LF));
  send(text(''), cmd(LF));

  // --- Separator ---
  send(cmd(ESC, 0x4d, 0));           // Font A
  send(text('------------------------------------------------'), cmd(LF));

  // --- Total (bold, double width) ---
  send(cmd(ESC, 0x24, 0, 0));        // Position 0
  send(cmd(ESC, 0x45, 1));           // Bold ON
  send(text('Total'));
  send(cmd(ESC, 0x24, 230, 1));      // Position 486
  send(cmd(GS, 0x21, 0x10));         // Double width
  send(text('13.30'), Buffer.from([0xa4]));
  send(cmd(GS, 0x21, 0x00));
  send(cmd(ESC, 0x45, 0));
  send(cmd(LF));

  // --- Footer (centered, underline) ---
  send(cmd(ESC, 0x61, 1));           // Center
  send(text(''), cmd(LF));
  send(cmd(ESC, 0x2d, 1));           // Underline ON
  send(text('Thank you!'), cmd(LF));
  send(cmd(ESC, 0x2d, 0));           // Underline OFF
  send(text('Visit us again'), cmd(LF));

  // Feed and cut
  send(cmd(ESC, 0x64, 3));           // Feed 3 lines
  send(cmd(GS, 0x56, 0));            // Full cut

  // Send all at once
  const payload = Buffer.concat(chunks);
  socket.write(payload, () => {
    console.log(`Sent ${payload.length} bytes`);
    socket.end();
  });
});

socket.on('error', (err) => {
  console.error('Connection error:', err.message);
  process.exit(1);
});

socket.on('close', () => {
  console.log('Done.');
});
