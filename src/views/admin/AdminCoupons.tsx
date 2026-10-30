'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Loader2,
  Lock,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Send,
  Share2,
  Sparkles,
  Ticket,
  Trash2,
} from 'lucide-react';
import {
  ADMIN_TD,
  AdminButton,
  AdminChip,
  AdminField,
  AdminInput,
  AdminModal,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminStatTile,
  AdminTable,
  AdminTableSkeleton,
} from '../../components/admin/AdminUI';
import {
  createAdminCoupon,
  deleteAdminCoupon,
  fetchAdminCoupons,
  updateAdminCoupon,
  type AdminCoupon,
  type AdminCouponInput,
  type CouponState,
} from '../../lib/admin/consoleApi';
import { getErrorMessage } from '../../lib/errors';

/**
 * Coupons.
 *
 * WooCommerce owns discounts, and this screen is the only place a code is created
 * or changed — the store applies it at checkout, so a coupon that exists here
 * exists for real.
 *
 * Supports both public store promotions and Private Single-Use Coupons that can
 * be sent directly to individual customers with 1-click checkout links.
 */

const DISCOUNT_TYPES: Array<{ id: AdminCoupon['discount_type']; label: string }> = [
  { id: 'percent', label: 'Percentage off' },
  { id: 'fixed_cart', label: 'Fixed amount off the cart' },
  { id: 'fixed_product', label: 'Fixed amount off each product' },
];

const STATE_TONES: Record<CouponState, 'success' | 'info' | 'warning' | 'muted'> = {
  active: 'success',
  scheduled: 'info',
  expired: 'warning',
  draft: 'muted',
};

const EMPTY_FORM: AdminCouponInput = {
  code: '',
  discountType: 'percent',
  amount: 10,
  description: '',
  dateExpires: null,
  minimumAmount: null,
  maximumAmount: null,
  usageLimit: null,
  usageLimitPerUser: null,
  freeShipping: false,
  published: false,
  individualUse: false,
  emailRestrictions: undefined,
};

function money(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function describeAmount(coupon: AdminCoupon): string {
  const amount = money(coupon.amount);
  if (coupon.discount_type === 'percent') return `${amount}% off`;
  if (coupon.discount_type === 'fixed_product') return `$${amount.toFixed(2)} off each item`;
  return `$${amount.toFixed(2)} off the cart`;
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function generatePrivateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 5; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `VIP-${rand}`;
}

function isPrivateCoupon(coupon: AdminCoupon): boolean {
  return (
    coupon.usage_limit === 1 ||
    Boolean(coupon.individual_use) ||
    Boolean(coupon.email_restrictions && coupon.email_restrictions.length > 0)
  );
}

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCoupon | null>(null);
  const [form, setForm] = useState<AdminCouponInput>(EMPTY_FORM);
  const [isPrivateMode, setIsPrivateMode] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminCoupon | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState<AdminCoupon | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCoupons(await fetchAdminCoupons());
    } catch (err) {
      setCoupons([]);
      setError(getErrorMessage(err, 'The coupons could not be read from the store.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const active = coupons.filter((coupon) => coupon.state === 'active');
    const expired = coupons.filter((coupon) => coupon.state === 'expired');
    const privateCoupons = coupons.filter(isPrivateCoupon);
    const redemptions = coupons.reduce((sum, coupon) => sum + Number(coupon.usage_count ?? 0), 0);
    return { active: active.length, expired: expired.length, privateCount: privateCoupons.length, redemptions };
  }, [coupons]);

  const openCreate = (privateOnly = false) => {
    setEditing(null);
    if (privateOnly) {
      setIsPrivateMode(true);
      setCustomerEmail('');
      setForm({
        ...EMPTY_FORM,
        code: generatePrivateCode(),
        amount: 15,
        usageLimit: 1,
        usageLimitPerUser: 1,
        individualUse: true,
        published: true,
        description: 'Private single-use customer discount',
      });
    } else {
      setIsPrivateMode(false);
      setCustomerEmail('');
      setForm(EMPTY_FORM);
    }
    setFormError(null);
    setEditorOpen(true);
  };

  const openEdit = (coupon: AdminCoupon) => {
    setEditing(coupon);
    const isPrivate = isPrivateCoupon(coupon);
    setIsPrivateMode(isPrivate);
    setCustomerEmail(coupon.email_restrictions?.[0] || '');
    setForm({
      code: coupon.code,
      discountType: coupon.discount_type,
      amount: money(coupon.amount),
      description: coupon.description ?? '',
      dateExpires: coupon.date_expires_gmt ?? null,
      minimumAmount: money(coupon.minimum_amount) || null,
      maximumAmount: money(coupon.maximum_amount) || null,
      usageLimit: coupon.usage_limit ?? null,
      usageLimitPerUser: coupon.usage_limit_per_user ?? null,
      freeShipping: Boolean(coupon.free_shipping),
      published: coupon.status === 'publish',
      individualUse: Boolean(coupon.individual_use),
      emailRestrictions: coupon.email_restrictions,
    });
    setFormError(null);
    setEditorOpen(true);
  };

  const submit = async () => {
    setSaving(true);
    setFormError(null);

    const emailTrimmed = customerEmail.trim().toLowerCase();
    const payload: AdminCouponInput = {
      ...form,
      individualUse: isPrivateMode ? true : Boolean(form.individualUse),
      usageLimit: isPrivateMode ? 1 : form.usageLimit,
      usageLimitPerUser: isPrivateMode ? 1 : form.usageLimitPerUser,
      emailRestrictions: emailTrimmed ? [emailTrimmed] : undefined,
    };

    try {
      if (editing) {
        await updateAdminCoupon(editing.id, payload);
        setNotice(`"${payload.code}" was updated in the store.`);
      } else {
        await createAdminCoupon(payload);
        setNotice(
          payload.published
            ? `"${payload.code}" was created and is live in the store.`
            : `"${payload.code}" was created as a draft. Publish it when you want it to apply.`
        );
      }
      setEditorOpen(false);
      await load();
    } catch (err) {
      setFormError(getErrorMessage(err, 'The coupon could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const result = await deleteAdminCoupon(confirmDelete.id);
      setNotice(
        result.stillPresent
          ? `The store still lists "${confirmDelete.code}" after the delete. Nothing was changed here to hide that.`
          : `"${confirmDelete.code}" was deleted from the store. ${result.remaining} coupon${
              result.remaining === 1 ? '' : 's'
            } remain.`
      );
      setConfirmDelete(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'The coupon could not be deleted.'));
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const copyToClipboard = (text: string, fieldId: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => {
      setCopiedField((current) => (current === fieldId ? null : current));
    }, 2000);
  };

  return (
    <>
      <AdminPageHeader
        eyebrow="Commerce"
        title="Coupons"
        description="Discount codes, read from and written to WooCommerce — the only system that can apply one at checkout."
        actions={
          <>
            <AdminButton icon={RefreshCw} onClick={load} disabled={loading}>
              Refresh
            </AdminButton>
            <AdminButton
              variant="primary"
              icon={Lock}
              onClick={() => openCreate(true)}
            >
              New private coupon
            </AdminButton>
            <AdminButton icon={Plus} onClick={() => openCreate(false)}>
              New standard coupon
            </AdminButton>
          </>
        }
      />

      {error && (
        <AdminNotice tone="danger" title="The store could not be read">
          {error}
        </AdminNotice>
      )}
      {notice && (
        <AdminNotice
          tone="info"
          title="Store updated"
          action={
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-xs font-semibold text-admin-muted hover:text-admin-ink"
            >
              Dismiss
            </button>
          }
        >
          {notice}
        </AdminNotice>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <AdminStatTile
          label="Coupons in store"
          icon={Ticket}
          tone="brand"
          value={loading ? undefined : coupons.length}
          unavailable={loading ? 'Reading…' : undefined}
        />
        <AdminStatTile
          label="Live now"
          icon={Ticket}
          tone="green"
          value={loading ? undefined : summary.active}
          unavailable={loading ? 'Reading…' : undefined}
        />
        <AdminStatTile
          label="Private VIP codes"
          icon={Lock}
          tone="amber"
          value={loading ? undefined : summary.privateCount}
          unavailable={loading ? 'Reading…' : undefined}
        />
        <AdminStatTile
          label="Redemptions"
          icon={Ticket}
          tone="slate"
          value={loading ? undefined : summary.redemptions}
          unavailable={loading ? 'Reading…' : undefined}
        />
      </div>

      <AdminPanel
        title="Discount codes"
        description="Exactly what WooCommerce holds. Nothing is created here that the store does not have."
        action={<AdminChip tone="neutral">{coupons.length} in WooCommerce</AdminChip>}
      >
        <AdminTable
          minWidth="860px"
          columns={[
            { key: 'code', label: 'Code', width: '28%' },
            { key: 'discount', label: 'Discount', width: '18%' },
            { key: 'limits', label: 'Limits', width: '18%' },
            { key: 'usage', label: 'Used', align: 'right', width: '12%' },
            { key: 'state', label: 'State', align: 'right', width: '10%' },
            { key: 'actions', label: '', align: 'right', width: '14%' },
          ]}
        >
          {loading ? (
            <AdminTableSkeleton rows={4} columns={6} />
          ) : coupons.length === 0 ? (
            <tr>
              <td className={ADMIN_TD} colSpan={6}>
                <p className="py-10 text-center text-sm text-admin-muted">
                  The store holds no coupons. Create one and it applies at checkout once published.
                </p>
              </td>
            </tr>
          ) : (
            coupons.map((coupon) => {
              const isPrivate = isPrivateCoupon(coupon);
              const usedCount = Number(coupon.usage_count ?? 0);
              const isSingleUse = coupon.usage_limit === 1;

              return (
                <tr key={coupon.id}>
                  <td className={`${ADMIN_TD} whitespace-nowrap`}>
                    <div className="flex items-center gap-2">
                      <p className="font-mono font-bold text-admin-ink tracking-tight">{coupon.code}</p>
                      {isPrivate && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-500/30 whitespace-nowrap">
                          <Lock size={10} />
                          Private {isSingleUse ? '(1 use)' : ''}
                        </span>
                      )}
                    </div>
                    {coupon.description && (
                      <p className="text-[11px] text-admin-muted truncate max-w-[240px]" title={coupon.description}>
                        {coupon.description}
                      </p>
                    )}
                    {coupon.email_restrictions && coupon.email_restrictions.length > 0 && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-700 whitespace-nowrap">
                        <Mail size={11} className="shrink-0" />
                        Locked to: {coupon.email_restrictions.join(', ')}
                      </p>
                    )}
                  </td>
                  <td className={`${ADMIN_TD} whitespace-nowrap text-admin-muted`}>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-admin-ink">{describeAmount(coupon)}</span>
                      {coupon.free_shipping && (
                        <AdminChip tone="info">Free shipping</AdminChip>
                      )}
                    </div>
                  </td>
                  <td className={`${ADMIN_TD} whitespace-nowrap text-admin-muted`}>
                    <p>
                      {money(coupon.minimum_amount) > 0
                        ? `Min $${money(coupon.minimum_amount).toFixed(2)}`
                        : 'No minimum'}
                      {coupon.date_expires_gmt ? ` · Expires ${toDateInput(coupon.date_expires_gmt)}` : ''}
                    </p>
                  </td>
                  <td className={`${ADMIN_TD} text-right whitespace-nowrap`}>
                    {isSingleUse ? (
                      usedCount >= 1 ? (
                        <span className="font-semibold text-admin-muted">1 / 1 (Used)</span>
                      ) : (
                        <span className="font-semibold text-emerald-600">0 / 1 (Available)</span>
                      )
                    ) : (
                      <>
                        {usedCount}
                        {coupon.usage_limit ? (
                          <span className="text-admin-muted"> / {coupon.usage_limit}</span>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className={`${ADMIN_TD} text-right whitespace-nowrap`}>
                    <AdminChip tone={STATE_TONES[coupon.state]}>{coupon.state}</AdminChip>
                  </td>
                  <td className={`${ADMIN_TD} text-right whitespace-nowrap`}>
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap shrink-0">
                      <AdminButton
                        icon={Share2}
                        onClick={() => setSharing(coupon)}
                        title="Share private coupon link with customer"
                        className="whitespace-nowrap shrink-0"
                      >
                        Share
                      </AdminButton>
                      <AdminButton onClick={() => openEdit(coupon)} className="whitespace-nowrap shrink-0">
                        Edit
                      </AdminButton>
                      <AdminButton icon={Trash2} onClick={() => setConfirmDelete(coupon)} className="whitespace-nowrap shrink-0">
                        Delete
                      </AdminButton>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </AdminTable>
      </AdminPanel>

      <AdminPanel title="How coupons and private codes work" description="Stated once, because it is the part that drifts">
        <ul className="space-y-2 text-sm text-admin-ink">
          <li>
            <strong>Private Customer Coupons:</strong> Set with a single-use limit (<code>usage_limit = 1</code>). When you send the code or link to a customer, they can use it at checkout once; after their order is placed, it cannot be reused by anyone else.
          </li>
          <li>
            <strong>Customer Email Lock:</strong> Optionally restrict a private coupon to a specific customer&apos;s email address so no other shopper can redeem it even if forwarded.
          </li>
          <li>
            <strong>1-Click Checkout Links:</strong> Use the <strong>Share</strong> button to copy a direct checkout link (<code>/checkout?coupon=CODE</code>) or pre-written WhatsApp message that automatically fills the discount for the customer.
          </li>
          <li>
            A code is only usable while it is <strong>published</strong> and not past its expiry. A draft code exists in the store and applies to nothing.
          </li>
          <li>
            Coupon codes are stored lower-cased by WooCommerce; this screen shows the store&apos;s own value so a customer typing either case gets the same answer.
          </li>
        </ul>
      </AdminPanel>

      {editorOpen && (
        <AdminModal
          onClose={() => setEditorOpen(false)}
          title={editing ? `Edit ${editing.code}` : isPrivateMode ? 'New Private Customer Coupon' : 'New Coupon'}
        >
          <div className="space-y-4">
            {formError && <AdminNotice tone="danger" title="Not saved">{formError}</AdminNotice>}

            {/* Mode Selector */}
            {!editing && (
              <div className="grid grid-cols-2 gap-2 p-1 bg-admin-surface rounded-xl border border-admin-line">
                <button
                  type="button"
                  onClick={() => {
                    setIsPrivateMode(false);
                    setForm((f) => ({ ...f, usageLimit: null, usageLimitPerUser: null, individualUse: false }));
                  }}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
                    !isPrivateMode ? 'bg-admin-bg text-admin-ink shadow-sm' : 'text-admin-muted hover:text-admin-ink'
                  }`}
                >
                  🌐 Standard Public Coupon
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPrivateMode(true);
                    setForm((f) => ({
                      ...f,
                      code: f.code || generatePrivateCode(),
                      usageLimit: 1,
                      usageLimitPerUser: 1,
                      individualUse: true,
                      published: true,
                    }));
                  }}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    isPrivateMode
                      ? 'bg-amber-500/10 text-amber-900 border border-amber-500/30 font-bold'
                      : 'text-admin-muted hover:text-admin-ink'
                  }`}
                >
                  <Lock size={13} className="text-amber-600" />
                  🔒 Private Single-Use Coupon
                </button>
              </div>
            )}

            {isPrivateMode && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <Sparkles size={14} className="text-amber-600" />
                  Private Customer Coupon Mode Active
                </div>
                <p className="text-admin-muted leading-relaxed">
                  This coupon is configured for <strong>single use (1 redemption only)</strong>. You can lock it to a specific customer email, or share the direct checkout link so only your recipient can redeem it before it expires.
                </p>
              </div>
            )}

            <AdminField label="Code">
              <div className="flex gap-2">
                <AdminInput
                  value={form.code}
                  onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                  placeholder="e.g. VIP-8X49"
                  className="font-mono font-bold uppercase tracking-wider"
                />
                <AdminButton
                  type="button"
                  icon={Sparkles}
                  onClick={() => setForm({ ...form, code: generatePrivateCode() })}
                  title="Generate a random VIP code"
                >
                  Random Code
                </AdminButton>
              </div>
            </AdminField>

            <div className="grid grid-cols-2 gap-4">
              <AdminField label="Type">
                <select
                  value={form.discountType}
                  onChange={(event) =>
                    setForm({ ...form, discountType: event.target.value as AdminCoupon['discount_type'] })
                  }
                  className="w-full rounded-xl border border-admin-line bg-admin-surface px-3 py-2.5 text-sm"
                >
                  {DISCOUNT_TYPES.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </AdminField>
              <AdminField
                label={form.discountType === 'percent' ? 'Percentage (0–100)' : 'Amount (USD)'}
              >
                <AdminInput
                  type="number"
                  value={String(form.amount)}
                  onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })}
                />
              </AdminField>
            </div>

            <AdminField
              label="Customer Email Lock (Optional)"
              hint="If provided, only an order with this billing email will be accepted at checkout."
            >
              <AdminInput
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="e.g. customer@example.com"
              />
            </AdminField>

            <AdminField label="Description (Admin note)" hint="Visible to you and on customer receipts">
              <AdminInput
                value={form.description ?? ''}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="e.g. VIP Customer 15% discount for Sarah"
              />
            </AdminField>

            <div className="grid grid-cols-2 gap-4">
              <AdminField label="Expires on" hint="Leave empty for no expiry">
                <AdminInput
                  type="date"
                  value={toDateInput(form.dateExpires ?? null)}
                  onChange={(event) => setForm({ ...form, dateExpires: event.target.value || null })}
                />
              </AdminField>
              <AdminField label="Minimum spend" hint="Leave empty for none">
                <AdminInput
                  type="number"
                  value={form.minimumAmount == null ? '' : String(form.minimumAmount)}
                  onChange={(event) =>
                    setForm({ ...form, minimumAmount: event.target.value ? Number(event.target.value) : null })
                  }
                />
              </AdminField>
            </div>

            {!isPrivateMode && (
              <div className="grid grid-cols-2 gap-4">
                <AdminField label="Total uses" hint="Leave empty for unlimited">
                  <AdminInput
                    type="number"
                    value={form.usageLimit == null ? '' : String(form.usageLimit)}
                    onChange={(event) =>
                      setForm({ ...form, usageLimit: event.target.value ? Number(event.target.value) : null })
                    }
                  />
                </AdminField>
                <AdminField label="Uses per customer" hint="Leave empty for unlimited">
                  <AdminInput
                    type="number"
                    value={form.usageLimitPerUser == null ? '' : String(form.usageLimitPerUser)}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        usageLimitPerUser: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                  />
                </AdminField>
              </div>
            )}

            <label className="flex items-center gap-3 text-sm text-admin-ink">
              <input
                type="checkbox"
                checked={form.freeShipping === true}
                onChange={(event) => setForm({ ...form, freeShipping: event.target.checked })}
              />
              Also gives free shipping
            </label>

            <label className="flex items-center gap-3 text-sm text-admin-ink">
              <input
                type="checkbox"
                checked={form.published === true}
                onChange={(event) => setForm({ ...form, published: event.target.checked })}
              />
              Publish now — an unpublished code applies to nothing
            </label>

            <div className="flex justify-end gap-3 border-t border-admin-line pt-4">
              <AdminButton onClick={() => setEditorOpen(false)} disabled={saving}>
                Cancel
              </AdminButton>
              <AdminButton variant="primary" onClick={submit} disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {editing ? 'Save to WooCommerce' : 'Create in WooCommerce'}
              </AdminButton>
            </div>
          </div>
        </AdminModal>
      )}

      {/* Share Private Coupon Modal */}
      {sharing && (
        <AdminModal
          onClose={() => setSharing(null)}
          title={`Share Coupon: ${sharing.code}`}
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-admin-line bg-admin-surface p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-admin-muted">Discount Value</span>
                <AdminChip tone="brand">{describeAmount(sharing)}</AdminChip>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-admin-muted">Usage Limit</span>
                <span className="text-xs font-medium text-admin-ink">
                  {sharing.usage_limit === 1 ? '🔒 Single-use (1 redemption only)' : `${sharing.usage_limit || 'Unlimited'} uses`}
                </span>
              </div>
              {sharing.email_restrictions && sharing.email_restrictions.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-admin-muted">Locked to Customer</span>
                  <span className="text-xs font-medium text-amber-700">{sharing.email_restrictions.join(', ')}</span>
                </div>
              )}
            </div>

            {/* 1. Coupon Code */}
            <AdminField label="1. Coupon Code" hint="Customer types this during checkout">
              <div className="flex gap-2">
                <AdminInput
                  value={sharing.code}
                  readOnly
                  className="font-mono font-bold tracking-wider text-base bg-admin-surface"
                />
                <AdminButton
                  icon={copiedField === 'code' ? Check : Copy}
                  onClick={() => copyToClipboard(sharing.code, 'code')}
                >
                  {copiedField === 'code' ? 'Copied!' : 'Copy Code'}
                </AdminButton>
              </div>
            </AdminField>

            {/* 2. Direct 1-Click Checkout Link */}
            <AdminField
              label="2. Direct 1-Click Checkout Link"
              hint="When opened, this link automatically applies the coupon at checkout for the customer"
            >
              <div className="flex gap-2">
                <AdminInput
                  value={`${typeof window !== 'undefined' ? window.location.origin : 'https://himalayankoh.com'}/checkout?coupon=${encodeURIComponent(sharing.code)}`}
                  readOnly
                  className="text-xs text-admin-muted font-mono bg-admin-surface"
                />
                <AdminButton
                  icon={copiedField === 'link' ? Check : Copy}
                  onClick={() =>
                    copyToClipboard(
                      `${typeof window !== 'undefined' ? window.location.origin : 'https://himalayankoh.com'}/checkout?coupon=${encodeURIComponent(sharing.code)}`,
                      'link'
                    )
                  }
                >
                  {copiedField === 'link' ? 'Copied!' : 'Copy Link'}
                </AdminButton>
              </div>
            </AdminField>

            {/* 3. Pre-written Message */}
            <AdminField
              label="3. Ready-to-Send Customer Message"
              hint="Send via WhatsApp, Email, or SMS to your customer"
            >
              <textarea
                readOnly
                rows={4}
                value={`Hi! Here is your exclusive private coupon for Himalayan Koh: ${sharing.code}\n\nGet ${describeAmount(sharing)} off your order.\n\nClick here to use it directly at checkout:\n${typeof window !== 'undefined' ? window.location.origin : 'https://himalayankoh.com'}/checkout?coupon=${encodeURIComponent(sharing.code)}`}
                className="w-full rounded-xl border border-admin-line bg-admin-surface p-3 text-xs leading-relaxed text-admin-ink focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <AdminButton
                  icon={copiedField === 'message' ? Check : Copy}
                  onClick={() =>
                    copyToClipboard(
                      `Hi! Here is your exclusive private coupon for Himalayan Koh: ${sharing.code}\n\nGet ${describeAmount(sharing)} off your order.\n\nClick here to use it directly at checkout:\n${typeof window !== 'undefined' ? window.location.origin : 'https://himalayankoh.com'}/checkout?coupon=${encodeURIComponent(sharing.code)}`,
                      'message'
                    )
                  }
                >
                  {copiedField === 'message' ? 'Copied Message!' : 'Copy Message'}
                </AdminButton>
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                    `Hi! Here is your exclusive private coupon for Himalayan Koh: ${sharing.code}\n\nGet ${describeAmount(sharing)} off your order.\n\nClick here to use it directly at checkout:\n${typeof window !== 'undefined' ? window.location.origin : 'https://himalayankoh.com'}/checkout?coupon=${encodeURIComponent(sharing.code)}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  <Send size={13} />
                  Send on WhatsApp
                </a>
              </div>
            </AdminField>

            <div className="border-t border-admin-line pt-4 flex justify-end">
              <AdminButton variant="primary" onClick={() => setSharing(null)}>
                Done
              </AdminButton>
            </div>
          </div>
        </AdminModal>
      )}

      {confirmDelete && (
        <AdminModal
          onClose={() => setConfirmDelete(null)}
          title={`Delete ${confirmDelete.code}?`}
        >
          <div className="space-y-4">
            <p className="text-sm text-admin-ink">
              The code stops being redeemable immediately. Orders that already used it keep their own record of the
              discount, so no order history is changed by this.
            </p>
            <div className="flex justify-end gap-3">
              <AdminButton onClick={() => setConfirmDelete(null)} disabled={deleting}>
                Keep it
              </AdminButton>
              <AdminButton onClick={remove} disabled={deleting}>
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Delete in WooCommerce
              </AdminButton>
            </div>
          </div>
        </AdminModal>
      )}
    </>
  );
}
