import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import {
  CATEGORY_FILTER_TABS,
  buildProductsCategoryPath,
  filterLabelFromKey,
  getCategoryContent,
} from '../../lib/categoryContent';
import type { CategoryHubOverrideForm } from '../../lib/categoryContent/cmsTypes';
import type { CategoryContentKey } from '../../lib/categoryContent';
import type { CategoryTrustPoint } from '../../lib/categoryContent';
import { categoryHubApi } from '../../lib/categoryContent/hubOverrides';
import {
  AdminButton,
  AdminField,
  AdminInput,
  AdminPageHeader,
  AdminPanel,
} from '../../components/admin/AdminUI';
import { BUTTON, MICRO_LABEL, SURFACE, TEXTAREA } from '../../components/admin/adminTheme';

const editableKeys = CATEGORY_FILTER_TABS.map((tab) => tab.key).filter(
  (key): key is CategoryContentKey => Boolean(key)
);

function buildFormFromSources(
  key: CategoryContentKey,
  override: Awaited<ReturnType<typeof categoryHubApi.getOverride>> | null
): CategoryHubOverrideForm {
  const base = getCategoryContent(key);
  if (!base) {
    return {
      category_key: key,
      hero: { eyebrow: '', title: '', subtitle: '' },
      seo: { title: '', description: '' },
      trust_points: [],
      is_published: true,
    };
  }

  const hero = (override?.hero || {}) as Partial<CategoryHubOverrideForm['hero']>;
  const seo = (override?.seo || {}) as Partial<CategoryHubOverrideForm['seo']>;
  const trust = Array.isArray(override?.trust_points)
    ? (override.trust_points as CategoryTrustPoint[])
    : [];

  return {
    category_key: key,
    hero: {
      eyebrow: hero.eyebrow?.trim() || base.hero.eyebrow,
      title: hero.title?.trim() || base.hero.title,
      subtitle: hero.subtitle?.trim() || base.hero.subtitle,
    },
    seo: {
      title: seo.title?.trim() || base.seo.title,
      description: seo.description?.trim() || base.seo.description,
    },
    trust_points:
      trust.length > 0
        ? trust
        : base.trustPoints.map((point) => ({ ...point })),
    is_published: override?.is_published ?? true,
  };
}

/**
 * Category hubs — the CMS overrides behind the enriched shop category pages.
 *
 * A two-pane console screen: the category list is a rail on the left, the editor
 * is the pane on the right, at every viewport (fixed 12-column grid, never a
 * breakpoint stack).
 */
export default function AdminCategoryHubs() {
  const [selectedKey, setSelectedKey] = useState<CategoryContentKey>(editableKeys[0]);
  const [form, setForm] = useState<CategoryHubOverrideForm>(() =>
    buildFormFromSources(editableKeys[0], null)
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const loadForm = useCallback(async (key: CategoryContentKey) => {
    setLoading(true);
    try {
      const override = await categoryHubApi.getOverride(key, { includeUnpublished: true });
      setForm(buildFormFromSources(key, override));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load category hub CMS data.');
      setForm(buildFormFromSources(key, null));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadForm(selectedKey);
  }, [selectedKey, loadForm]);

  const previewPath = useMemo(
    () => buildProductsCategoryPath(selectedKey),
    [selectedKey]
  );

  const handleSave = async () => {
    setSaving(true);

    try {
      await categoryHubApi.upsertOverride(form);
      toast.success('Category hub saved. Changes appear on the shop page after refresh.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const base = getCategoryContent(selectedKey);
    if (!base) return;
    setForm({
      category_key: selectedKey,
      hero: { ...base.hero },
      seo: { ...base.seo },
      trust_points: base.trustPoints.map((point) => ({ ...point })),
      is_published: true,
    });
    toast.info('Form reset to code registry defaults. Save to persist to CMS.');
  };

  const updateTrustPoint = (index: number, field: keyof CategoryTrustPoint, value: string) => {
    setForm((current) => ({
      ...current,
      trust_points: current.trust_points.map((point, i) =>
        i === index ? { ...point, [field]: value } : point
      ),
    }));
  };

  const addTrustPoint = () => {
    setForm((current) => ({
      ...current,
      trust_points: [...current.trust_points, { label: '', detail: '' }],
    }));
  };

  const removeTrustPoint = (index: number) => {
    setForm((current) => ({
      ...current,
      trust_points: current.trust_points.filter((_, i) => i !== index),
    }));
  };

  return (
    <>
      <AdminPageHeader
        eyebrow="Content"
        title="Category hubs"
        description="Hero copy, SEO and trust points for the enriched shop category pages. Gallery, guides, PDFs and blog cards still come from the code registry and the blog mapping."
        actions={
          <Link to={previewPath} className={BUTTON.secondary}>
            Preview on storefront
            <ExternalLink size={16} />
          </Link>
        }
      />

      <div className="grid grid-cols-12 gap-5">
        <aside className={`${SURFACE} col-span-4 p-4`}>
          <p className={MICRO_LABEL}>Shop categories</p>
          <div className="mt-3 space-y-1">
            {editableKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedKey(key)}
                aria-current={selectedKey === key ? 'true' : undefined}
                className={`w-full rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-colors ${
                  selectedKey === key
                    ? 'bg-himalayan text-white'
                    : 'text-admin-ink hover:bg-admin-canvas'
                }`}
              >
                {filterLabelFromKey(key)}
              </button>
            ))}
          </div>
        </aside>

        <div className="col-span-8">
          {loading ? (
            <AdminPanel title={filterLabelFromKey(selectedKey)} description="Reading CMS override…">
              <div className="space-y-3">
                {Array.from({ length: 5 }, (_, index) => (
                  <div key={index} className="h-12 animate-pulse rounded-xl bg-admin-canvas" />
                ))}
              </div>
            </AdminPanel>
          ) : (
            <AdminPanel
              title={filterLabelFromKey(selectedKey)}
              description="Edits here override the code registry for this hub."
              action={
                <label className="flex cursor-pointer items-center gap-2 text-sm text-admin-ink">
                  <input
                    type="checkbox"
                    checked={form.is_published}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, is_published: event.target.checked }))
                    }
                    className="h-4 w-4 rounded border-admin-line-strong text-himalayan focus:ring-himalayan"
                  />
                  Published on storefront
                </label>
              }
            >
              <div className="space-y-6">
                <section className="space-y-4">
                  <h3 className={MICRO_LABEL}>Hero</h3>
                  <AdminField label="Eyebrow" htmlFor="hub-eyebrow">
                    <AdminInput
                      id="hub-eyebrow"
                      value={form.hero.eyebrow}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          hero: { ...current.hero, eyebrow: event.target.value },
                        }))
                      }
                    />
                  </AdminField>
                  <AdminField label="Title" htmlFor="hub-title">
                    <AdminInput
                      id="hub-title"
                      value={form.hero.title}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          hero: { ...current.hero, title: event.target.value },
                        }))
                      }
                    />
                  </AdminField>
                  <AdminField label="Subtitle" htmlFor="hub-subtitle">
                    <textarea
                      id="hub-subtitle"
                      className={`${TEXTAREA} min-h-24`}
                      value={form.hero.subtitle}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          hero: { ...current.hero, subtitle: event.target.value },
                        }))
                      }
                    />
                  </AdminField>
                </section>

                <section className="space-y-4 border-t border-admin-line pt-5">
                  <h3 className={MICRO_LABEL}>SEO</h3>
                  <AdminField label="Meta title" htmlFor="hub-seo-title">
                    <AdminInput
                      id="hub-seo-title"
                      value={form.seo.title}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          seo: { ...current.seo, title: event.target.value },
                        }))
                      }
                    />
                  </AdminField>
                  <AdminField label="Meta description" htmlFor="hub-seo-description">
                    <textarea
                      id="hub-seo-description"
                      className={`${TEXTAREA} min-h-24`}
                      value={form.seo.description}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          seo: { ...current.seo, description: event.target.value },
                        }))
                      }
                    />
                  </AdminField>
                </section>

                <section className="space-y-3 border-t border-admin-line pt-5">
                  <div className="flex items-center justify-between">
                    <h3 className={MICRO_LABEL}>Trust points</h3>
                    <AdminButton icon={Plus} onClick={addTrustPoint}>
                      Add point
                    </AdminButton>
                  </div>
                  {form.trust_points.length === 0 && (
                    <p className="text-sm text-admin-muted">
                      This hub has no trust points. Adding one writes a label and a detail line.
                    </p>
                  )}
                  {form.trust_points.map((point, index) => (
                    <div key={`trust-${index}`} className="space-y-3 rounded-xl border border-admin-line bg-admin-canvas/60 p-4">
                      <div className="flex items-center justify-between">
                        <span className={MICRO_LABEL}>Point {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeTrustPoint(index)}
                          className="rounded-lg p-1.5 text-red-600 transition-colors hover:bg-red-50"
                          aria-label="Remove trust point"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <AdminInput
                        placeholder="Label"
                        value={point.label}
                        onChange={(event) => updateTrustPoint(index, 'label', event.target.value)}
                      />
                      <textarea
                        className={`${TEXTAREA} min-h-16`}
                        placeholder="Detail"
                        value={point.detail}
                        onChange={(event) => updateTrustPoint(index, 'detail', event.target.value)}
                      />
                    </div>
                  ))}
                </section>

                <div className="flex flex-wrap gap-3 border-t border-admin-line pt-5">
                  <AdminButton variant="primary" icon={Save} onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 size={16} className="animate-spin" />}
                    Save CMS override
                  </AdminButton>
                  <AdminButton icon={RefreshCw} onClick={handleReset}>
                    Reset to defaults
                  </AdminButton>
                </div>
              </div>
            </AdminPanel>
          )}
        </div>
      </div>
    </>
  );
}
