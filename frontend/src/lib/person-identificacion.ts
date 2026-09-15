/** Alineado con policyValidator.js (emision-api): rif 1–8 dígitos. */

export function countIdentificacionDigits(value?: string): number {
  return (value ?? '').replace(/\D/g, '').length;
}

const MIN_DIGITS = 1;
const MAX_DIGITS = 8;

export function validateSecondaryPersonIdentificacion(
  identificacion?: string,
  label = 'Identificación',
): string | undefined {
  const digits = countIdentificacionDigits(identificacion);
  if (!String(identificacion ?? '').trim() || digits === 0) {
    return `${label}: es obligatoria`;
  }
  if (digits < MIN_DIGITS) {
    return `${label}: debe tener al menos ${MIN_DIGITS} dígito`;
  }
  if (digits > MAX_DIGITS) {
    return `${label}: no puede tener más de ${MAX_DIGITS} dígitos`;
  }
  return undefined;
}

export function validateRcvEmitPersonas(state: {
  sameInsured?: boolean;
  tomador?: { identificacion?: string };
  asegurado?: { identificacion?: string };
  hasBeneficiary?: boolean;
  beneficiario?: { identificacion?: string };
  hasDriver?: boolean;
  conductor?: { identificacion?: string };
}): string | undefined {
  const titularIsTomador = state.sameInsured !== false;
  if (titularIsTomador) {
    const err = validateSecondaryPersonIdentificacion(
      state.tomador?.identificacion,
      'Cédula del tomador (titular)',
    );
    if (err) return err;
  } else {
    const err = validateSecondaryPersonIdentificacion(
      state.asegurado?.identificacion,
      'Cédula del asegurado (titular)',
    );
    if (err) return err;
  }
  if (state.hasBeneficiary) {
    const err = validateSecondaryPersonIdentificacion(
      state.beneficiario?.identificacion,
      'Cédula del beneficiario',
    );
    if (err) return err;
  }
  if (state.hasDriver) {
    const err = validateSecondaryPersonIdentificacion(
      state.conductor?.identificacion,
      'Cédula del conductor habitual',
    );
    if (err) return err;
  }
  return undefined;
}

export const SECONDARY_IDENTIFICACION_MAX_LENGTH = MAX_DIGITS;
