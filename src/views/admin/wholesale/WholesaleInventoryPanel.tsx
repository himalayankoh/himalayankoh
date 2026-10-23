'use client';
import { useEffect, useState } from 'react';
import { AdminButton, AdminField, AdminInput, AdminModal, AdminNotice, AdminPanel } from '@/components/admin/AdminUI';
import { getWooAdminProduct, updateWooAdminProduct } from '@/lib/admin/wooProductApi';
import { wholesaleStockTarget } from '@/lib/wholesale/stockTarget';

export default function WholesaleInventoryPanel({ productId, variationId, sku }: { productId: number; variationId: number; sku: string }) {
  const [target, setTarget] = useState<ReturnType<typeof wholesaleStockTarget> | null>(null);
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    let current = true;
    setTarget(null); setError(''); setNotice('');
    if (!productId) return;
    void getWooAdminProduct(productId).then(({ product, variations }) => {
      if (!current) return;
      const next = wholesaleStockTarget(product, variations, variationId, sku);
      setTarget(next); setQuantity(String(next.quantity));
    }).catch((caught) => { if (current) setError(caught instanceof Error ? caught.message : 'Live stock could not be read.'); });
    return () => { current = false; };
  }, [productId, variationId, sku]);
  const requested = Number(quantity);
  const valid = quantity.trim() !== '' && Number.isSafeInteger(requested) && requested >= 0;
  async function save() {
    if (!target || !valid) return;
    setConfirm(false); setBusy(true); setError(''); setNotice('');
    try {
      const patch = { stockQuantity: requested, stockStatus: requested > 0 ? 'instock' as const : 'outofstock' as const };
      const result = target.variationId
        ? await updateWooAdminProduct(target.parentId, {}, [{ id: target.variationId, ...patch }])
        : await updateWooAdminProduct(target.parentId, patch);
      if (result.ignored.length) throw new Error(result.ignored.map((item) => item.reason).join(' '));
      const fresh = await getWooAdminProduct(target.parentId);
      const verified = wholesaleStockTarget(fresh.product, fresh.variations, variationId, sku);
      if (verified.quantity !== requested) throw new Error(`The store now reports ${verified.quantity} pieces. Refresh before another adjustment.`);
      setTarget(verified); setQuantity(String(verified.quantity));
      setNotice(`Verified: ${verified.quantity} pieces in shared inventory. Retail prices were not changed.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Stock save could not be verified. Refresh before retrying.'); }
    finally { setBusy(false); }
  }
  return <AdminPanel title="Physical inventory" description="One real stock count shared by retail and wholesale. An inquiry does not deduct it. Adjust the trade allocation separately if needed.">
    {error ? <AdminNotice tone="danger" title={error} /> : null}
    {notice ? <AdminNotice tone="info" title={notice} /> : null}
    {!target && !error ? <p className="text-sm text-admin-muted">Reading the linked product inventory…</p> : null}
    {target ? <div className="space-y-3 min-w-0">
      <p className="text-xs text-admin-muted break-words">{target.sku} · {target.variationId ? `Variation ${target.variationId}` : `Product ${target.parentId}`} · Currently {target.quantity} pieces</p>
      <AdminField label="Physical stock (pieces)" htmlFor="wholesale-physical-stock" hint="Enter your actual counted stock. This also changes availability in the retail shop.">
        <AdminInput id="wholesale-physical-stock" type="number" min={0} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
      </AdminField>
      <AdminButton disabled={busy || !valid || requested === target.quantity} onClick={() => setConfirm(true)}>Update physical stock</AdminButton>
    </div> : null}
    {confirm && target ? <AdminModal title="Confirm shared stock adjustment" onClose={() => setConfirm(false)} footer={<>
      <AdminButton variant="secondary" onClick={() => setConfirm(false)}>Cancel</AdminButton>
      <AdminButton onClick={() => void save()}>Confirm stock update</AdminButton>
    </>}><p className="text-sm break-words">Set {target.sku} from {target.quantity} to {requested} pieces? This affects both retail and wholesale availability. It does not change retail prices or existing orders.</p></AdminModal> : null}
  </AdminPanel>;
}
