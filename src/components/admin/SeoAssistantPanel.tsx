'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, Upload } from 'lucide-react';
import {
  AdminButton,
  AdminChip,
  AdminField,
  AdminInput,
  AdminNotice,
  AdminPanel,
  AdminTextarea,
} from './AdminUI';
import { generateSeoDraft, testGemini, type SeoDraft, type SeoDraftField } from '../../lib/admin/consoleApi';
import { getErrorMessage } from '../../lib/errors';

/**
 * The Gemini SEO assistant.
 *
 * Three steps, and the middle one is the point: **generate → review → apply**.
 *
 * Generation goes to Gemini through an admin-only route with the key held
 * server-side. Review is a human reading the draft, and every field carries the
 * prohibited claims found in it, so a draft that promises something the store
 * cannot support is visibly blocked rather than subtly risky.
 *
 * Apply is **disabled**, and says why: writing these fields means writing the
 * product's SEO metadata in WordPress, and this deployment holds no WordPress user
 * session — the WooCommerce consumer key does not authenticate WordPress core
 * endpoints. Nothing here auto-publishes, and nothing claims to have saved when it
 * has not.
 */
export default function SeoAssistantPanel() {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState<'product' | 'category' | 'page'>('product');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [weight, setWeight] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [keywords, setKeywords] = useState('');

  const [draft, setDraft] = useState<SeoDraft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ state: string; detail: string; model: string } | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    try {
      setStatus(await testGemini());
    } catch (err) {
      setStatus({
        state: 'UNREACHABLE',
        model: '—',
        detail: getErrorMessage(err, 'The connection test could not be run.'),
      });
    } finally {
      setChecking(false);
    }
  };

  const generate = async () => {
    setGenerating(true);
    setError(null);
    setDraft(null);
    try {
      setDraft(
        await generateSeoDraft({
          subject,
          name,
          facts: { sku, price, weight, category, description },
          keywords: keywords
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean),
        })
      );
    } catch (err) {
      setError(getErrorMessage(err, 'The draft could not be generated.'));
    } finally {
      setGenerating(false);
    }
  };

  const blockedCount = draft
    ? [draft.title, draft.metaDescription, draft.description].reduce(
        (sum, field) => sum + field.blocked.length,
        0
      )
    : 0;

  return (
    <>
      <AdminPanel
        title="Gemini SEO assistant"
        description="Writes draft titles, meta descriptions and product copy. Nothing is saved or published from this panel."
        action={
          <div className="flex items-center gap-2">
            <AdminButton onClick={check} disabled={checking}>
              {checking ? <Loader2 size={16} className="animate-spin" /> : null}
              Test connection
            </AdminButton>
            <AdminChip tone="muted">Apply disabled</AdminChip>
          </div>
        }
      >
        {status && (
          <div className="mb-4">
            <AdminNotice
              tone={status.state === 'CONNECTED' ? 'info' : 'warning'}
              title={`Gemini: ${status.state}`}
            >
              {status.detail}
              {status.model && status.model !== '—' ? ` Model: ${status.model}.` : ''}
            </AdminNotice>
          </div>
        )}

        <div className="grid grid-cols-2 gap-5">
          <AdminField label="Writing for">
            <select
              value={subject}
              onChange={(event) => setSubject(event.target.value as 'product' | 'category' | 'page')}
              className="w-full rounded-xl border border-admin-line bg-admin-surface px-3 py-2.5 text-sm"
            >
              <option value="product">A product</option>
              <option value="category">A category</option>
              <option value="page">A page</option>
            </select>
          </AdminField>
          <AdminField label="Name" hint="Required — the only fact the model always gets">
            <AdminInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Himalayan Pink Edible Salt Fine Grain Pouch — 3 lbs"
            />
          </AdminField>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-4">
          <AdminField label="SKU">
            <AdminInput value={sku} onChange={(event) => setSku(event.target.value)} />
          </AdminField>
          <AdminField label="Price">
            <AdminInput value={price} onChange={(event) => setPrice(event.target.value)} />
          </AdminField>
          <AdminField label="Weight">
            <AdminInput value={weight} onChange={(event) => setWeight(event.target.value)} />
          </AdminField>
          <AdminField label="Category">
            <AdminInput value={category} onChange={(event) => setCategory(event.target.value)} />
          </AdminField>
        </div>

        <AdminField
          label="Verified facts the copy may use"
          className="mt-5"
          hint="Anything not written here must not be asserted by the copy — no certifications, no health claims, no origin claims."
        >
          <AdminTextarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Existing description, grain size, packaging, anything factual"
          />
        </AdminField>

        <AdminField label="Keywords" className="mt-5" hint="Comma separated, optional">
          <AdminInput
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            placeholder="himalayan pink salt, fine grain salt"
          />
        </AdminField>

        <div className="mt-5 flex items-center justify-between gap-4 border-t border-admin-line pt-4">
          <p className="text-xs text-admin-muted">
            The draft is checked against this store&apos;s claim rules before you see it. A blocked field is one you
            must rewrite, not one the store can support.
          </p>
          <AdminButton variant="primary" onClick={generate} disabled={generating || !name.trim()}>
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Generate draft
          </AdminButton>
        </div>
      </AdminPanel>

      {error && (
        <AdminNotice tone="danger" title="No draft generated">
          {error}
        </AdminNotice>
      )}

      {draft && (
        <AdminPanel
          title="Review the draft"
          description={`Generated by ${draft.model}. Read it, then apply it — nothing is written until WordPress SEO writes exist.`}
          action={
            <AdminChip tone={blockedCount > 0 ? 'danger' : 'success'}>
              {blockedCount > 0 ? `${blockedCount} blocked field${blockedCount === 1 ? '' : 's'}` : 'No blocked claims'}
            </AdminChip>
          }
        >
          {draft.warnings.map((warning) => (
            <AdminNotice key={warning} tone="warning" title="Check before using">
              {warning}
            </AdminNotice>
          ))}

          <div className="mt-4 space-y-4">
            <DraftFieldRow label="SEO title" field={draft.title} limit={60} />
            <DraftFieldRow label="Meta description" field={draft.metaDescription} limit={155} />
            <DraftFieldRow label="Description" field={draft.description} limit={400} />
          </div>

          {draft.keywords.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {draft.keywords.map((keyword) => (
                <AdminChip key={keyword} tone="info">
                  {keyword}
                </AdminChip>
              ))}
            </div>
          )}

          <div className="mt-5 flex items-start gap-3 rounded-xl border border-dashed border-admin-line px-4 py-4 text-sm">
            <Upload size={16} className="mt-0.5 shrink-0 text-admin-muted" />
            <div>
              <p className="font-semibold text-admin-ink">Apply is not available yet</p>
              <p className="mt-0.5 text-admin-muted">
                Saving these fields means writing the product&apos;s SEO metadata in WordPress, and this deployment
                holds no WordPress user session — the WooCommerce key that reads products and orders does not
                authenticate WordPress core. Nothing is auto-published: when WordPress write access exists, a draft
                still has to be applied by hand, one field at a time.
              </p>
            </div>
          </div>
        </AdminPanel>
      )}
    </>
  );
}

/** One generated field, with its length and any prohibited claim made visible. */
function DraftFieldRow({ label, field, limit }: { label: string; field: SeoDraftField; limit: number }) {
  const over = field.value.length > limit;
  return (
    <div className="rounded-xl border border-admin-line px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-admin-ink">{label}</p>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] ${over ? 'font-semibold text-amber-600' : 'text-admin-muted'}`}>
            {field.value.length}/{limit}
          </span>
          {field.blocked.length === 0 ? (
            <CheckCircle2 size={14} className="text-emerald-600" />
          ) : (
            <AlertTriangle size={14} className="text-red-600" />
          )}
        </div>
      </div>
      <p className="mt-1.5 text-sm text-admin-ink">{field.value || '—'}</p>
      {field.blocked.map((claim) => (
        <p key={`${claim.rule}-${claim.match}`} className="mt-1 text-[11px] font-semibold text-red-600">
          Blocked ({claim.rule}): “{claim.match}” — rewrite this field before using it.
        </p>
      ))}
    </div>
  );
}
