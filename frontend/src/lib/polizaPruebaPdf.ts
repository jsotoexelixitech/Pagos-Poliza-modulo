/**
 * Cuadro-recibo de póliza de PRUEBA (marca neutra): PDF A4 generado en el navegador, sin
 * librerías. Misma estructura que el cuadro-recibo de una aseguradora (tomador, póliza,
 * vehículo o asegurados, coberturas y recibos), pero sin logos, RIF ni textos de La Mundial.
 * Solo para pólizas simuladas (`PRUEBA-…`), que no traen `urlpoliza`.
 */

export interface PersonaCuadro {
  nombre: string;
  documento: string;
  fechaNac?: string;
  parentesco?: string;
}

export interface CoberturaCuadro {
  nombre: string;
  suma?: number | null;
  prima?: number | null;
}

export interface VehiculoCuadro {
  marca?: string;
  modelo?: string;
  anio?: string;
  placa?: string;
  serial?: string;
  serialMotor?: string;
  color?: string;
  uso?: string;
}

export interface DatosPolizaPrueba {
  numero: string;
  recibo?: string | null;
  plan: string;
  tomador: {
    nombre: string;
    documento: string;
    email?: string;
    telefono?: string;
    direccion?: string;
    ciudad?: string;
    estado?: string;
  };
  asegurado?: { nombre: string; documento: string } | null;
  /** Funerario: personas aseguradas (la primera es el titular). */
  asegurados?: PersonaCuadro[];
  /** RCV: datos del vehículo. */
  vehiculo?: VehiculoCuadro | null;
  coberturas?: CoberturaCuadro[];
  primaUsd?: number | null;
  tasa?: number | null;
  /** Código de frecuencia (A, S, T, C, M). */
  frecuencia?: string | null;
  referencia?: string | null;
  emitida?: Date;
}

/** Póliza simulada por la emisión de prueba (Emisión → datosPruebaMarcaNeutra). */
export function esPolizaPrueba(numero: string | null | undefined): boolean {
  return /^PRUEBA-/i.test(String(numero ?? '').trim());
}

// ── Métricas Helvetica / Helvetica-Bold (AFM estándar, códigos 32–126) ──────────
const D10 = Array(10).fill(556);
const ANCHO_REG = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, ...D10,
  278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667,
  611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500,
  278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];
const ANCHO_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, ...D10,
  333, 333, 584, 584, 584, 611, 975,
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667,
  611, 722, 667, 944, 667, 667, 611,
  333, 278, 333, 584, 556, 333,
  556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556,
  333, 611, 556, 778, 556, 556, 500,
  389, 280, 389, 584,
];

/** Solo caracteres de Latin-1 (WinAnsiEncoding); el resto se reemplaza. */
function latin1(s: string): string {
  return String(s ?? '').normalize('NFC').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?').trim();
}

function ancho(s: string, bold: boolean, size: number): number {
  const tabla = bold ? ANCHO_BOLD : ANCHO_REG;
  let w = 0;
  for (const ch of s) {
    const c = ch.normalize('NFD').charCodeAt(0);
    w += c >= 32 && c <= 126 ? tabla[c - 32] : 556;
  }
  return (w * size) / 1000;
}

/** Recorta con «...» para que quepa en `max` puntos. */
function ajustar(s: string, bold: boolean, size: number, max: number): string {
  let t = latin1(s);
  if (ancho(t, bold, size) <= max) return t;
  while (t.length > 1 && ancho(`${t}...`, bold, size) > max) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

function esc(s: string): string {
  return s.replace(/[\\()]/g, (c) => `\\${c}`);
}

function fecha(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** 1234.5 → «1.234,50» (como el cuadro de la aseguradora). */
function monto(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  const [ent, dec] = Math.abs(Number(n)).toFixed(2).split('.');
  return `${Number(n) < 0 ? '-' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

const FRECUENCIAS: Record<string, string> = {
  A: 'ANUAL',
  S: 'SEMESTRAL',
  C: 'CUATRIMESTRAL',
  T: 'TRIMESTRAL',
  M: 'MENSUAL',
};

const PAGINA_ALTO = 842;
const IZQ = 40;
const DER = 555;
const NAVY = '0.106 0.129 0.369 rg';

type Estilo = { bold?: boolean; size?: number; color?: string };

/** Lienzo con coordenadas desde arriba (t = distancia al borde superior). */
class Lienzo {
  ops: string[] = [];

  texto(x: number, t: number, s: string, e: Estilo = {}) {
    const size = e.size ?? 7.5;
    const color = e.color ?? '0.12 g';
    this.ops.push(
      `BT ${color} /F${e.bold ? 2 : 1} ${size} Tf ${x.toFixed(2)} ${(PAGINA_ALTO - t).toFixed(2)} Td (${esc(latin1(s))}) Tj ET`,
    );
  }

  derecha(x: number, t: number, s: string, e: Estilo = {}) {
    this.texto(x - ancho(latin1(s), !!e.bold, e.size ?? 7.5), t, s, e);
  }

  centro(x1: number, x2: number, t: number, s: string, e: Estilo = {}) {
    this.texto((x1 + x2 - ancho(latin1(s), !!e.bold, e.size ?? 7.5)) / 2, t, s, e);
  }

  rect(x: number, t: number, w: number, h: number, color: string) {
    this.ops.push(`q ${color} ${x} ${PAGINA_ALTO - t - h} ${w} ${h} re f Q`);
  }

  linea(x1: number, x2: number, t: number, gris = 0.75) {
    this.ops.push(`q ${gris} G 0.5 w ${x1} ${PAGINA_ALTO - t} m ${x2} ${PAGINA_ALTO - t} l S Q`);
  }

  /** Franja gris con el título centrado; devuelve la t debajo de la franja. */
  franja(t: number, titulo: string): number {
    this.rect(IZQ, t, DER - IZQ, 15, '0.80 g');
    this.centro(IZQ, DER, t + 10.8, titulo, { bold: true, size: 9 });
    return t + 27;
  }

  /** Fila de pares ETIQUETA: valor en 3 columnas; devuelve la t siguiente. */
  pares(t: number, pares: ([string, string] | null)[], cols = [IZQ, 222, 404]): number {
    const fin = [cols[1] - 6, cols[2] - 6, DER];
    pares.forEach((par, i) => {
      if (!par) return;
      const [etq, val] = par;
      const etiqueta = `${etq}:`;
      this.texto(cols[i], t, etiqueta, { bold: true });
      const x = cols[i] + ancho(latin1(etiqueta), true, 7.5) + 4;
      this.texto(x, t, ajustar(val || '-', false, 7.5, fin[i] - x - 4));
    });
    return t + 12;
  }

  /** Párrafo con ajuste de línea; devuelve la t siguiente. */
  parrafo(t: number, s: string, e: Estilo = {}): number {
    const size = e.size ?? 7.5;
    const max = DER - IZQ;
    let linea = '';
    for (const palabra of latin1(s).split(/\s+/)) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (ancho(prueba, !!e.bold, size) > max && linea) {
        this.texto(IZQ, t, linea, e);
        t += size + 3;
        linea = palabra;
      } else {
        linea = prueba;
      }
    }
    if (linea) {
      this.texto(IZQ, t, linea, e);
      t += size + 3;
    }
    return t;
  }
}

/** Bytes del PDF (A4, una página). */
export function construirPdfPolizaPrueba(d: DatosPolizaPrueba): Uint8Array {
  const emitida = d.emitida ?? new Date();
  const hasta = new Date(emitida);
  hasta.setFullYear(hasta.getFullYear() + 1);
  const desde = fecha(emitida);
  const hastaTxt = fecha(hasta);
  const esFunerario = /^PRUEBA-FUN/i.test(d.numero) || (d.asegurados?.length ?? 0) > 0;
  const prima = d.primaUsd ?? null;
  const asegurado = d.asegurado ?? { nombre: d.tomador.nombre, documento: d.tomador.documento };
  const recibo = d.recibo || d.numero.replace(/^PRUEBA-/i, 'R-');
  const lz = new Lienzo();

  // Marca de agua (debajo de todo).
  lz.ops.push('q 0.90 g BT /F2 60 Tf 0.7071 0.7071 -0.7071 0.7071 73 197 Tm (PRUEBA - SIN VALOR) Tj ET Q');

  // Encabezado: marca neutra a la izquierda, aviso de prueba a la derecha.
  lz.texto(IZQ, 60, 'Exélixi', { bold: true, size: 24, color: NAVY });
  lz.texto(IZQ, 73, 'Marketplace de seguros', { size: 8.5, color: '0.40 g' });
  lz.derecha(DER, 48, 'AMBIENTE DE PRUEBAS', { bold: true, size: 9, color: NAVY });
  lz.derecha(DER, 60, 'Documento sin validez legal', { size: 8.5, color: '0.35 g' });
  lz.derecha(DER, 72, `Generado el ${fecha(new Date())}`, { size: 8.5, color: '0.35 g' });

  lz.centro(IZQ, DER, 106, 'CUADRO - RECIBO DE PÓLIZA', { bold: true, size: 13 });
  lz.centro(IZQ, DER, 122, esFunerario ? 'FUNERARIO' : 'AUTOMÓVIL - RCV', { bold: true, size: 12 });

  // Tomador y asegurado.
  const colsPersona = [IZQ, 252, 400];
  let t = lz.franja(136, 'DATOS DEL TOMADOR - ASEGURADO');
  t = lz.pares(t, [['TOMADOR', d.tomador.nombre], ['C.I./R.I.F.', d.tomador.documento], ['PÓLIZA', d.numero]], colsPersona);
  t = lz.pares(t, [['DIRECCIÓN', d.tomador.direccion ?? ''], ['EMAIL', d.tomador.email ?? ''], ['ESTATUS', 'PAGADO']], colsPersona);
  t = lz.pares(t, [['CIUDAD', d.tomador.ciudad ?? ''], ['ESTADO', d.tomador.estado ?? ''], ['TELÉFONO', d.tomador.telefono ?? '']], colsPersona);
  t = lz.pares(t, [['ASEGURADO', asegurado.nombre], ['C.I./R.I.F.', asegurado.documento], ['RECIBO', recibo]], colsPersona);

  // Póliza.
  const colsPoliza = [IZQ, 205, 400];
  t = lz.franja(t + 4, 'DATOS DE LA PÓLIZA');
  t = lz.pares(t, [['FECHA EMISIÓN', desde], ['VIGENCIA', `${desde} - ${hastaTxt}`], ['MONEDA', 'DÓLARES']], colsPoliza);
  t = lz.pares(t, [
    ['CANAL DE VENTA', 'MARKETPLACE'],
    ['PLAN CONTRATADO', d.plan],
    ['FRECUENCIA DE PAGO', FRECUENCIAS[String(d.frecuencia ?? 'A').toUpperCase()] ?? 'ANUAL'],
  ], colsPoliza);
  t = lz.pares(t, [
    ['REFERENCIA DE PAGO', d.referencia ?? ''],
    ['TIPO DE PRODUCTO', 'NUEVO'],
    d.tasa ? ['TASA DE CAMBIO', `Bs ${monto(d.tasa)}`] : null,
  ], colsPoliza);

  if (esFunerario) {
    t = lz.franja(t + 4, 'ASEGURADOS');
    const cols = [IZQ, 270, 370, 460];
    ['NOMBRE Y APELLIDO', 'C.I.', 'FECHA NAC.', 'PARENTESCO'].forEach((h, i) =>
      lz.texto(cols[i], t, h, { bold: true }),
    );
    t += 12;
    const personas = d.asegurados?.length ? d.asegurados : [{ ...asegurado, parentesco: 'TITULAR' }];
    for (const p of personas.slice(0, 8)) {
      lz.texto(cols[0], t, ajustar(p.nombre || '-', false, 7.5, cols[1] - cols[0] - 8));
      lz.texto(cols[1], t, p.documento || '-');
      const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(p.fechaNac ?? '');
      lz.texto(cols[2], t, iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : p.fechaNac || '-');
      lz.texto(cols[3], t, p.parentesco || '-');
      t += 12;
    }
  } else {
    const v = d.vehiculo ?? {};
    t = lz.franja(t + 4, 'DATOS DEL VEHÍCULO');
    t = lz.pares(t, [['MARCA', v.marca ?? ''], ['MODELO', v.modelo ?? ''], ['AÑO', v.anio ?? '']]);
    t = lz.pares(t, [['SERIAL CARR.', v.serial ?? ''], ['SERIAL MOT.', v.serialMotor ?? ''], ['PLACA', v.placa ?? '']]);
    t = lz.pares(t, [['USO', v.uso ?? ''], ['COLOR', v.color ?? ''], null]);
  }

  // Coberturas.
  t = lz.franja(t + 4, 'COBERTURAS CONTRATADAS');
  lz.derecha(470, t, 'SUMA ASEGURADA', { bold: true });
  lz.derecha(DER, t, 'PRIMA', { bold: true });
  t += 12;
  const coberturas = d.coberturas?.length ? d.coberturas : [{ nombre: d.plan || 'Cobertura', suma: null, prima }];
  for (const c of coberturas.slice(0, 8)) {
    lz.texto(IZQ, t, ajustar(c.nombre.toUpperCase(), true, 7.5, 330), { bold: true });
    lz.derecha(470, t, c.suma != null ? `${monto(c.suma)} USD` : '-');
    lz.derecha(DER, t, monto(c.prima));
    t += 12;
  }
  lz.linea(IZQ, DER, t - 7);
  lz.texto(IZQ, t + 2, 'TOTAL:', { bold: true });
  lz.derecha(DER, t + 2, monto(prima), { bold: true });
  t += 16;
  lz.centro(IZQ, DER, t, 'Montos expresados en dólares (USD).', { size: 7, color: '0.35 g' });
  t += 10;

  // Recibos.
  t = lz.franja(t + 4, 'RECIBOS DE PRIMAS - FRACCIONAMIENTO');
  const rc = [IZQ, 150, 245, 315, 385, 455];
  ['NO. RECIBO', 'TIPO DE RECIBO', 'FECHA DESDE', 'FECHA HASTA', 'FECHA COBRO', 'MONEDA'].forEach((h, i) =>
    lz.texto(rc[i], t, h, { bold: true }),
  );
  lz.derecha(DER, t, 'PRIMA', { bold: true });
  t += 12;
  [recibo, 'Primer Año (Nuevo)', desde, hastaTxt, desde, 'DÓLARES ($)'].forEach(
    (v, i) => lz.texto(rc[i], t, ajustar(v, false, 7.5, (rc[i + 1] ?? 525) - rc[i] - 6)),
  );
  lz.derecha(DER, t, monto(prima));
  t += 20;

  // Observaciones.
  t = lz.franja(t, 'OBSERVACIONES');
  lz.parrafo(
    t,
    'Documento de prueba generado en el ambiente de pruebas del Marketplace Exélixi. No constituye una póliza de seguro, no fue emitido por ninguna aseguradora y no genera coberturas ni obligaciones.',
    { color: '0.30 g' },
  );

  lz.centro(IZQ, DER, 812, 'Exélixi · Cuadro-recibo de póliza de prueba · Página 1 de 1', { size: 7, color: '0.45 g' });

  const contenido = lz.ops.join('\n');
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
