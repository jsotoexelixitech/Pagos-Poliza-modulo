/**
 * Cuadro de póliza de PRUEBA (marca neutra): PDF de una página generado en el navegador, sin
 * librerías y sin nada de La Mundial. Solo para pólizas simuladas (número `PRUEBA-…`), que no
 * traen `urlpoliza` porque no existen en ninguna aseguradora.
 */

export interface DatosPolizaPrueba {
  numero: string;
  plan: string;
  titular: string;
  montoUsd?: number | null;
  referencia?: string | null;
  emitida?: Date;
}

/** Póliza simulada por la emisión de prueba (Emisión → datosPruebaMarcaNeutra). */
export function esPolizaPrueba(numero: string | null | undefined): boolean {
  return /^PRUEBA-/i.test(String(numero ?? '').trim());
}

function productoDe(numero: string): string {
  if (/^PRUEBA-FUN/i.test(numero)) return 'Funerario';
  if (/^PRUEBA-RCV/i.test(numero)) return 'RCV (Responsabilidad Civil Vehicular)';
  return 'Seguro';
}

/** Solo caracteres de Latin-1 (Helvetica con WinAnsiEncoding); el resto se reemplaza. */
function latin1(s: string): string {
  return s.normalize('NFC').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

function texto(s: string, max = 60): string {
  const t = latin1(s).trim();
  const corto = t.length > max ? `${t.slice(0, max - 3)}...` : t;
  return corto.replace(/[\\()]/g, (c) => `\\${c}`);
}

function fecha(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Bytes del PDF (A4). */
export function construirPdfPolizaPrueba(d: DatosPolizaPrueba): Uint8Array {
  const emitida = d.emitida ?? new Date();
  const hasta = new Date(emitida);
  hasta.setFullYear(hasta.getFullYear() + 1);
  const filas: [string, string][] = [
    ['Número de póliza', d.numero],
    ['Producto', productoDe(d.numero)],
    ['Plan', d.plan || '-'],
    ['Titular', d.titular || '-'],
    ['Vigencia', `${fecha(emitida)} al ${fecha(hasta)}`],
    ['Prima', d.montoUsd && d.montoUsd > 0 ? `USD ${d.montoUsd.toFixed(2)}` : '-'],
    ['Referencia de pago', d.referencia || '-'],
  ];

  const ops: string[] = [
    // Marca de agua diagonal.
    'q 0.92 g BT /F2 60 Tf 0.7071 0.7071 -0.7071 0.7071 110 210 Tm (PRUEBA - SIN VALOR) Tj ET Q',
    // Encabezado.
    'q 0.106 0.129 0.369 rg 0 752 595 90 re f Q',
    `BT 1 g /F2 24 Tf 48 800 Td (${texto('Exélixi')}) Tj ET`,
    `BT 1 g /F1 11 Tf 48 776 Td (${texto('Cuadro de póliza de prueba')}) Tj ET`,
    `BT 0.1 g /F2 18 Tf 48 705 Td (${texto('Póliza de prueba')}) Tj ET`,
    `BT 0.4 g /F1 10 Tf 48 686 Td (${texto('Documento generado en ambiente de pruebas. No tiene validez como póliza.', 90)}) Tj ET`,
  ];
  let y = 640;
  for (const [etiqueta, valor] of filas) {
    ops.push(`BT 0.45 g /F1 10 Tf 48 ${y} Td (${texto(etiqueta)}) Tj ET`);
    ops.push(`BT 0.1 g /F2 12 Tf 200 ${y} Td (${texto(valor)}) Tj ET`);
    ops.push(`q 0.88 G 0.5 w 48 ${y - 12} m 547 ${y - 12} l S Q`);
    y -= 34;
  }
  ops.push(
    `BT 0.45 g /F1 9 Tf 48 70 Td (${texto('Solo de prueba: no se emitió ninguna póliza ni se registró en ninguna aseguradora.', 100)}) Tj ET`,
    `BT 0.45 g /F1 9 Tf 48 56 Td (${texto(`Generado el ${fecha(new Date())}.`)}) Tj ET`,
  );
  const contenido = ops.join('\n');

  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
  ];
  // Todo es Latin-1: un carácter = un byte, así que las posiciones son las del string.
  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];
  objetos.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i += 1) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

/** URL `blob:` del PDF para abrirlo en otra pestaña. Quien la crea la revoca. */
export function crearUrlPolizaPrueba(d: DatosPolizaPrueba): string {
  const blob = new Blob([construirPdfPolizaPrueba(d)], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
}
