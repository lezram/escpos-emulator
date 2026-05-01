export interface PrinterFont {
  charsPerLine: number;
  widthPx: number;
  heightPx: number;
}

export interface PrinterModel {
  name: string;
  vendor: string;
  paperWidthMm: number;
  printableWidthMm: number;
  dpi: number;
  fonts: Record<string, PrinterFont>;
  defaultFont: string;
  defaultCodePage: string;
}

export const TM_M30III: PrinterModel = {
  name: 'TM-M30III',
  vendor: 'Epson',
  paperWidthMm: 80,
  printableWidthMm: 72,
  dpi: 203,
  fonts: {
    A: { charsPerLine: 48, widthPx: 12, heightPx: 24 },
    B: { charsPerLine: 64, widthPx: 9, heightPx: 24 },
  },
  defaultFont: 'A',
  defaultCodePage: 'iso-8859-15',
};

export const models: Record<string, PrinterModel> = {
  'TM-M30III': TM_M30III,
};

export function getModel(name: string): PrinterModel {
  const model = models[name];
  if (!model) throw new Error(`Unknown printer model: ${name}. Available: ${Object.keys(models).join(', ')}`);
  return model;
}
