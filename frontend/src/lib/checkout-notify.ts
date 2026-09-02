import type { CheckoutData, CheckoutRules, PaymentCapture } from '../types';
import { notifyCheckoutStatus } from './api';
import { getCheckoutNotifyUrl, hasGenericCheckout } from './checkout';
import { toast } from '../store/toastStore';

/** Campos de pago móvil/OTP que nest-api necesita para registrar pago_movil antes del cobro. */
export function mergePaymentNotifyFields(
  capture: PaymentCapture | null | undefined,
  payment: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!capture && !payment) return null;
  const p = payment && typeof payment === 'object' ? payment : {};
  const c = capture || {};
  return {
    ...p,
    method: p.method ?? c.method,
    reference: p.reference ?? c.reference,
    transactionId: p.transactionId ?? c.transactionId,
    amount: p.amount ?? c.amount,
    paidOn: p.paidOn ?? c.paidOn,
    verifiedOn: p.verifiedOn ?? c.paidOn,
    bankCode: p.bankCode ?? c.bankCode,
    sourcePhone: p.sourcePhone ?? c.sourcePhone,
    cci_rif: p.cci_rif ?? c.cci_rif,
    telefonoDest: p.telefonoDest ?? c.telefonoDest,
    cbanco_dest_ref: p.cbanco_dest_ref ?? c.cbanco_dest_ref,
    cbanco: p.cbanco ?? c.cbanco,
    cbanco_destino: p.cbanco_destino ?? c.cbanco_destino,
  };
}

/** Notifica al notifyUrl del cliente (metadata.payload) vía pagos-api. */
export async function notifyClientCheckoutStatus(params: {
  checkout: CheckoutData | null;
  checkoutRules: CheckoutRules | null;
  checkoutPayload: Record<string, unknown> | null;
  paymentVerified: boolean;
  code?: string | null;
  message?: string | null;
  payment?: Record<string, unknown> | null;
}): Promise<boolean> {
  if (!hasGenericCheckout({ checkout: params.checkout })) return false;
  if (!getCheckoutNotifyUrl(params.checkoutPayload, params.checkoutRules)) return true;

  try {
    const res = await notifyCheckoutStatus({
      status: params.paymentVerified ? 'ok' : 'error',
      paymentVerified: params.paymentVerified,
      code: params.code ?? null,
      message: params.message ?? null,
      payment: params.payment ?? null,
      checkout: params.checkout,
      payload: params.checkoutPayload,
    });

    if (!res.success) {
      throw new Error(res.message || 'notify failed');
    }

    if (params.paymentVerified) {
      const domiciliacion = params.payment?.method === 'domiciliacion';
      toast.success(
        domiciliacion ? 'Domiciliación autorizada' : 'Pago verificado',
        'Tu sistema recibió la confirmación. Regresando al portal…',
        5000,
      );
    }
    return true;
  } catch {
    toast.error(
      'Aviso al sistema',
      'No se pudo notificar a tu sistema. Contacta soporte.',
      6000,
    );
    return false;
  }
}
