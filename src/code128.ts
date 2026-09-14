// CODE128 symbol patterns: widths of alternating bar/space modules, indexed by symbol value (106 is the stop symbol).
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212',
  '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221',
  '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221',
  '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321',
  '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131',
  '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131',
  '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111',
  '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242',
  '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311',
  '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

const START: Record<string, number> = { A: 103, B: 104, C: 105 };
const CODE_SWITCH: Record<string, number> = { A: 101, B: 100, C: 99 };
const STOP = 106;
const BRACE = 0x7b;

export interface Code128 {
  /** Human readable interpretation, as printed by the HRI */
  text: string;
  /** One character per module: '1' bar, '0' space */
  modules: string;
}

/**
 * Encodes the data of GS k 73 (CODE128) the way an Epson printer does: the data opens with a {A / {B / {C code set
 * selector, {{ is a literal brace, {1 {2 {3 {4 {S are FNC1..FNC4 and SHIFT, and in code set C every byte is one
 * value from 0 to 99.
 *
 * @returns null when the data is not valid CODE128, which the printer would refuse to print
 */
export function encodeCode128(data: number[]): Code128 | null {
  const values: number[] = [];
  let codeSet: string | null = null;
  let text = '';

  for (let i = 0; i < data.length; i++) {
    const byte = data[i];

    if (byte === BRACE && i + 1 < data.length) {
      const selector = String.fromCharCode(data[++i]);
      if (selector in START) {
        values.push(codeSet === null ? START[selector] : CODE_SWITCH[selector]);
        codeSet = selector;
        continue;
      }
      if (codeSet === null) return null;
      switch (selector) {
        case '{':
          if (codeSet !== 'B') return null;
          values.push(BRACE - 32);
          text += '{';
          continue;
        case '1': values.push(102); continue;
        case '2': values.push(97); continue;
        case '3': values.push(96); continue;
        case '4': values.push(codeSet === 'A' ? 101 : 100); continue;
        case 'S': values.push(98); continue;
        default: return null;
      }
    }

    if (codeSet === 'C') {
      if (byte > 99) return null;
      values.push(byte);
      text += String(byte).padStart(2, '0');
    } else if (codeSet === 'B') {
      if (byte < 32 || byte > 127) return null;
      values.push(byte - 32);
      text += String.fromCharCode(byte);
    } else if (codeSet === 'A') {
      if (byte > 95) return null;
      values.push(byte < 32 ? byte + 64 : byte - 32);
      if (byte >= 32) text += String.fromCharCode(byte);
    } else {
      return null;
    }
  }

  if (values.length < 2) return null;

  const checksum = values.reduce((sum, value, i) => sum + value * Math.max(i, 1), 0) % 103;
  let modules = '';
  for (const value of [...values, checksum, STOP]) {
    const widths = PATTERNS[value];
    for (let i = 0; i < widths.length; i++) {
      modules += (i % 2 === 0 ? '1' : '0').repeat(Number(widths[i]));
    }
  }
  return { text, modules };
}
