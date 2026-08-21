/**
 * Prefijos telefónicos válidos en Venezuela (móviles, fijos por estado, servicios).
 * Plan nacional CONATEL — no confundir con prefijos de placa vehicular.
 *
 * Móviles: Digitel 0412/0422 · Movistar 0414/0424 · Movilnet 0416/0426
 * Legacy aún en circulación: 0415 (Tesan), 0417/0418 (ex-Digicel/Infonet → Digitel)
 */
export const VE_PHONE_PREFIXES = [
  // Móviles — Digitel
  '0412', '0422',
  // Móviles — Movistar
  '0414', '0424',
  // Móviles — Movilnet
  '0416', '0426',
  // Móviles — legacy
  '0415', '0417', '0418',
  // Fijos — Distrito Capital, Miranda, Vargas
  '0212', '0234', '0235', '0237', '0238', '0239',
  // Fijos — Centro (Carabobo, Aragua, Guárico, Cojedes, Apure)
  '0240', '0241', '0242', '0243', '0244', '0245', '0246', '0247', '0248', '0249',
  // Fijos — Centro-Occidente (Lara, Portuguesa, Yaracuy, Falcón)
  '0251', '0252', '0253', '0254', '0255', '0256', '0257', '0258', '0259',
  // Fijos — Zulia / binacional Colombia
  '0260', '0261', '0262', '0263', '0264', '0265', '0266', '0267', '0268', '0269',
  // Fijos — Andina, Táchira / binacional
  '0270', '0271', '0272', '0273', '0274', '0275', '0276', '0277', '0278', '0279',
  // Fijos — Oriente, Guayana, Amazonas
  '0281', '0282', '0283', '0284', '0285', '0286', '0287', '0288', '0289',
  // Fijos — Oriente, Nueva Esparta
  '0291', '0292', '0293', '0294', '0295',
  // Servicios especiales (050x local, 0800 gratuito, 0900 tarifa premium)
  '0500', '0501', '0800', '0900',
] as const;

const PREFIX_SET = new Set<string>(VE_PHONE_PREFIXES);

function normalizeDigits(raw: string): string {
  let d = raw.replace(/\D/g, '');

  // Pegado sin cero inicial: 412… → 0412…
  if (d.length > 0 && /^[24589]/.test(d[0])) d = `0${d}`;

  if (d.length >= 1 && d[0] !== '0') return '';

  // 2º dígito: 2 fijo · 4 móvil · 5 local · 8 gratuito · 9 premium
  if (d.length >= 2 && !/^[24589]/.test(d[1])) d = d.slice(0, 1);

  // Móvil 04: tercer dígito 1 o 2 (041X / 042X)
  if (d.length >= 3 && d[1] === '4' && !/^[12]/.test(d[2])) d = d.slice(0, 2);

  if (d.length >= 4) {
    const pref = d.slice(0, 4);
    if (!PREFIX_SET.has(pref)) d = d.slice(0, 3);
  }

  return d.slice(0, 11);
}

/** Máscara visual: (0412) 123-4567 */
export function formatTelefono(raw: string): string {
  const d = normalizeDigits(raw);
  if (d.length === 0) return '';
  if (d.length <= 4) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 4)}) ${d.slice(4)}`;
  return `(${d.slice(0, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
}

/** Valida prefijo + longitud completa (11 dígitos nacionales). */
export function isValidPhonePrefix(phone: string): boolean {
  if (!phone) return false;
  const d = phone.replace(/\D/g, '');
  if (d.length !== 11) return false;
  return PREFIX_SET.has(d.slice(0, 4));
}

/** Mensaje de error para teléfono inválido, o cadena vacía si es válido. */
export function validateTelefono(phone: string, required = true): string {
  const trimmed = (phone ?? '').trim();
  if (!trimmed) return required ? 'El teléfono es obligatorio' : '';
  const d = trimmed.replace(/\D/g, '');
  if (d.length !== 11) {
    return 'El teléfono debe tener exactamente 11 dígitos (ej. 04121234567)';
  }
  if (!PREFIX_SET.has(d.slice(0, 4))) {
    return 'El prefijo no es válido (Digitel 0412/0422 · Movistar 0414/0424 · Movilnet 0416/0426 · fijos 02XX)';
  }
  return '';
}
