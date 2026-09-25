import type { ShippoLabelResult } from '../types';
import { shippoRequest } from './client';

interface ShippoTransactionResponse {
  object_id: string;
  status: string;
  tracking_number?: string;
  label_url?: string;
  tracking_url_provider?: string;
  rate?: {
    provider?: string;
    servicelevel_name?: string;
  };
  messages?: { text?: string }[];
}

export async function purchaseShippoLabel(
  rateId: string,
  orderId: string,
  options?: { dryRun?: boolean }
): Promise<ShippoLabelResult> {
  const isDryRun = options?.dryRun || process.env.SHIPPO_DRY_RUN === 'true';
  if (isDryRun) {
    return {
      transactionId: `dry_run_${Date.now()}`,
      trackingNumber: `DRYRUN${orderId}${Date.now().toString().slice(-6)}`,
      labelUrl: 'https://preview.himalayankoh.com/test-label-preview.pdf',
      trackingUrl: 'https://tools.usps.com/go/TrackConfirmAction',
      carrier: 'USPS (Dry Run)',
      serviceName: 'Priority Mail (Dry Run)',
    };
  }

  const transaction = await shippoRequest<ShippoTransactionResponse>('/transactions/', {
    method: 'POST',
    body: {
      rate: rateId,
      label_file_type: 'PDF',
      async: false,
      metadata: orderId,
    },
  });

  if (transaction.status !== 'SUCCESS') {
    const message =
      transaction.messages?.map((entry) => entry.text).filter(Boolean).join(' ') ||
      `Label purchase failed with status: ${transaction.status}`;
    throw new Error(message);
  }

  if (!transaction.tracking_number || !transaction.label_url) {
    throw new Error('Shippo did not return a tracking number or label URL.');
  }

  return {
    transactionId: transaction.object_id,
    trackingNumber: transaction.tracking_number,
    labelUrl: transaction.label_url,
    trackingUrl: transaction.tracking_url_provider || null,
    carrier: transaction.rate?.provider || 'Carrier',
    serviceName: transaction.rate?.servicelevel_name || 'Shipping',
  };
}
