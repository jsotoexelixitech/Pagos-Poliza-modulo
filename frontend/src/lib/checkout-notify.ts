import type { CheckoutData } from '../types';
import { notifyCheckoutStatus } from './api';
import { getCheckoutNotifyUrl, hasGenericCheckout } from './checkout';
import { toast } from '../store/toastStore';

/** Notifica al notifyUrl del cliente (metadata.payload) vía pagos-api. */
export async function notifyClientCheckoutStatus(params: {
  checkout: CheckoutData | null;
  checkoutPayload: Record<string, unknown> | null;
  paymentVerified: boolean;
  code?: string | null;
  message?: string | null;
  payment?: Record<string, unknown> | null;
}): Promise<void> {
  if (!hasGenericCheckout({ checkout: params.checkout })) return;
  if (!getCheckoutNotifyUrl(params.checkoutPayload)) return;

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
      toast.success(
        'Pago verificado',
        'Tu sistema recibió la confirmación del pago.',
        5000,
      );
    }
  } catch {
    toast.error(
      'Aviso al sistema',
      'No se pudo notificar a tu sistema. Contacta soporte.',
      6000,
    );
  }
}
