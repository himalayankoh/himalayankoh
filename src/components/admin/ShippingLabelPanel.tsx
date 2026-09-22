import { Download, ExternalLink, Loader2, Printer, Truck } from 'lucide-react';
import { formatShippoLabelError } from '../../lib/shippo/carrierErrors';
import { AdminChip, AdminNotice } from './AdminUI';
import { BUTTON, SURFACE } from './adminTheme';

/**
 * What a label panel needs from an order — and nothing else.
 *
 * Declared here rather than imported from the admin order API: this block renders the
 * payment state, the carrier and the tracking keys, so it should depend on those five
 * fields and not on a row from whichever database used to hold orders. The WooCommerce
 * order the routes send is a superset, so it fits without adaptation.
 */
export interface LabelOrder {
  id: string;
  status: string;
  payment_status: string;
  shipping_carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  label_url: string | null;
  /** Present on the labels worklist; not read by this block. */
  profile?: { full_name?: string | null } | null;
}

interface ShippingLabelPanelProps {
  order: LabelOrder;
  shippoEnabled: boolean;
  labelCreating?: boolean;
  labelError?: string | null;
  labelNotice?: string | null;
  onCreateLabel?: () => void;
  /** full = order detail sidebar; page = labels list row */
  variant?: 'full' | 'page';
}

/**
 * The shipping-label block for one order.
 *
 * `variant="page"` is the compact form used inside the labels list rows (it
 * renders nothing when there is nothing to do); `variant="full"` is the order
 * detail form with the packing steps. Both are the same state machine — what a
 * label needs, what exists, and what failed — so the two surfaces can never
 * disagree about whether an order is ready to ship.
 */
export default function ShippingLabelPanel({
  order,
  shippoEnabled,
  labelCreating = false,
  labelError = null,
  labelNotice = null,
  onCreateLabel,
  variant = 'full',
}: ShippingLabelPanelProps) {
  const hasLabel = Boolean(order.label_url);
  const needsLabel =
    shippoEnabled &&
    order.payment_status === 'paid' &&
    !order.label_url &&
    order.status !== 'cancelled';
  const labelErrorInfo = labelError ? formatShippoLabelError(labelError) : null;

  if (!shippoEnabled) {
    return (
      <AdminNotice tone="warning" title="Shippo is not configured">
        Add a Shippo API key and warehouse address in <strong>Settings → Shippo</strong> to create
        labels. Orders can still be managed without one.
      </AdminNotice>
    );
  }

  if (!hasLabel && !needsLabel && !labelError && !labelNotice) {
    if (variant === 'page') return null;
    return (
      <div className={`${SURFACE} p-5 text-sm text-admin-muted`}>
        No shipping label for this order yet. A label appears here once payment is confirmed and you
        create one.
      </div>
    );
  }

  const actionLink = 'inline-flex items-center justify-center gap-2 px-4 py-2.5';

  return (
    <div className={`${SURFACE} p-5`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Truck size={16} className="text-admin-muted" />
          <p className="text-sm font-semibold text-admin-ink">Shipping label</p>
        </div>
        {hasLabel ? (
          <AdminChip tone="success">Label ready</AdminChip>
        ) : needsLabel ? (
          <AdminChip tone="warning">Not created</AdminChip>
        ) : (
          <AdminChip tone="muted">Not required</AdminChip>
        )}
      </div>

      {hasLabel && (
        /* Two fixed columns, never a breakpoint stack: the console keeps its
           desktop layout at every viewport. */
        <div className="grid grid-cols-2 gap-2">
          <a
            href={order.label_url!}
            target="_blank"
            rel="noopener noreferrer"
            className={`${BUTTON.primary} ${actionLink}`}
          >
            <Download size={16} />
            Download label (PDF)
          </a>
          <a
            href={order.label_url!}
            target="_blank"
            rel="noopener noreferrer"
            className={`${BUTTON.secondary} ${actionLink}`}
          >
            <Printer size={16} />
            Print label
          </a>
          {order.tracking_url && (
            <a
              href={order.tracking_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${BUTTON.secondary} ${actionLink} col-span-2`}
            >
              <ExternalLink size={16} />
              Track package
            </a>
          )}
        </div>
      )}

      {hasLabel && order.tracking_number && (
        <p className="mt-3 text-xs text-admin-muted">
          Tracking{' '}
          <span className="font-semibold text-admin-ink">{order.tracking_number}</span>
          {order.shipping_carrier ? ` · ${order.shipping_carrier}` : ''}
        </p>
      )}

      {needsLabel && (
        <>
          {variant === 'full' && (
            <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-admin-muted">
              <li>Pack the order and confirm the shipping address.</li>
              <li>Create the Shippo label — tracking is emailed to the customer.</li>
              <li>Download or print the PDF and attach it to the package.</li>
            </ol>
          )}
          {order.shipping_carrier && !/usps/i.test(order.shipping_carrier) && (
            <p className="mb-3 text-xs text-admin-muted">
              Checkout selected {order.shipping_carrier}. If that carrier is not active in Shippo, USPS
              is tried automatically.
            </p>
          )}
          {onCreateLabel && (
            <button
              type="button"
              onClick={onCreateLabel}
              disabled={labelCreating}
              className={`${BUTTON.primary} w-full`}
            >
              {labelCreating ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />}
              {labelCreating ? 'Creating label…' : 'Create Shippo label'}
            </button>
          )}
        </>
      )}

      {labelNotice && (
        <div className="mt-3">
          <AdminNotice tone="info" title="Label created">
            {labelNotice}
          </AdminNotice>
        </div>
      )}

      {labelErrorInfo && (
        <div className="mt-3">
          <AdminNotice tone="danger" title={labelErrorInfo.title}>
            <p>{labelErrorInfo.detail}</p>
            {labelErrorInfo.actionUrl && (
              <a
                href={labelErrorInfo.actionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 font-semibold underline"
              >
                {labelErrorInfo.actionLabel}
                <ExternalLink size={14} />
              </a>
            )}
          </AdminNotice>
        </div>
      )}
    </div>
  );
}
