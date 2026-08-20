/**
 * @exelixi/shared
 *
 * Contratos de comunicacion entre modulos Exelixi.
 * SOLO tipos y bus de eventos — sin UI, sin stores, sin logica de negocio.
 * Cada modulo sigue siendo completamente independiente.
 */

// Tipos compartidos: TomadorData, VehicleData, OcrDocumentResult, etc.
export type {
  DocumentType,
  OcrDocumentResult,
  TomadorData,
  VehicleData,
  PaymentMethod,
  PaymentResult,
  EmissionResult,
  ModuleSource,
  ModuleMessage,
  ModuleMessageType,
} from './lib/protocol';

// Bus de eventos: publish / subscribe / waitFor
export { publish, subscribe, waitFor } from './lib/event-bus';
// Utilidades compartidas
export { formatTelefono, isValidPhonePrefix, validateTelefono, VE_PHONE_PREFIXES, formatCedulaRif, validateCedulaRif } from './lib/utils';
export {
  areDocumentsComplete,
  canNavigateToStep,
  getDefaultRequiredDocs,
  getNavigationBlockReason,
  getPreviousAllowedStep,
  hasPlanSelected,
  type WizardNavSnapshot,
} from './lib/wizard-navigation';
export {
  attachNexusTokenAxios,
  getNexusToken,
  persistNexusToken,
} from './lib/nexus-token-client';
