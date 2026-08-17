/** Tipos de documento admitidos en campos cédula/RIF (pago móvil, Meritop). */
const CEDULA_RIF_TYPES = new Set(['V', 'E', 'J', 'P', 'G']);

/** Máximo de dígitos numéricos según tipo (normativa VE: cédula V/E hasta 8). */
const CEDULA_RIF_MAX_DIGITS: Record<string, number> = {
  V: 8,
  E: 8,
  J: 9,
  G: 9,
  P: 9,
};

const CEDULA_RIF_MIN_DIGITS: Record<string, number> = {
  V: 6,
  E: 6,
  J: 8,
  G: 8,
  P: 5,
};

/**
 * Formatea cédula/RIF mientras el usuario escribe: `V-12345678`.
 * Limita dígitos según tipo (V/E: 8; RIF J/G: 9).
 */
export function formatCedulaRif(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^VEJPG0-9-]/g, '').replace(/-/g, '');
  if (!cleaned) return '';

  if (!/^[VEJPG]/.test(cleaned)) {
    return cleaned.replace(/\D/g, '').slice(0, 9);
  }

  const tipo = cleaned[0];
  const digits = cleaned.slice(1).replace(/\D/g, '').slice(0, CEDULA_RIF_MAX_DIGITS[tipo] ?? 8);
  if (!digits) return tipo;
  return `${tipo}-${digits}`;
}

/**
 * Valida cédula/RIF para pago móvil. Devuelve mensaje de error o cadena vacía si es válido.
 */
export function validateCedulaRif(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'La cédula/RIF es obligatoria';

  const match = /^([VEJPG])-?(\d+)$/.exec(trimmed.toUpperCase());
  if (!match || !CEDULA_RIF_TYPES.has(match[1])) {
    return 'Formato inválido (Ej: V-12345678)';
  }

  const [, tipo, digits] = match;
  const min = CEDULA_RIF_MIN_DIGITS[tipo] ?? 6;
  const max = CEDULA_RIF_MAX_DIGITS[tipo] ?? 8;

  if (digits.length < min) {
    return tipo === 'V' || tipo === 'E'
      ? `La cédula debe tener entre ${min} y ${max} dígitos`
      : `El RIF/documento debe tener entre ${min} y ${max} dígitos`;
  }
  if (digits.length > max) {
    return tipo === 'V' || tipo === 'E'
      ? `La cédula no puede superar ${max} dígitos`
      : `El RIF/documento no puede superar ${max} dígitos`;
  }

  return '';
}
