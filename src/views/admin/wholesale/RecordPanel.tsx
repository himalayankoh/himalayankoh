'use client';

import { useMemo, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { saveWholesaleRecord, removeWholesaleRecord, type WholesaleResource } from '@/lib/admin/wholesaleConsoleApi';
import {
  AddButton,
  Button,
  DataTable,
  DeleteRowButton,
  Field,
  Notice,
  Panel,
  SaveButton,
  Select,
  TextArea,
  TextInput,
  Toggle,
  numberValue,
  rowId,
  text,
  useWriter,
  type Column,
} from './ui';

/**
 * One editor for the flat configuration tables.
 *
 * Seven of the wholesale record types — suppliers, origins, port charges, freight
 * rates, container profiles, price tiers — are flat rows over the same form, and
 * writing seven nearly identical panels would mean seven places to forget that a
 * number field can be empty, or that a save can fail. So the table is described by a
 * field spec and this component does the rest.
 *
 * ## What the spec decides
 *
 * Each field names its own type, so an empty number is stored as an empty number and
 * not as `NaN`, a boolean is a real toggle rather than the string "false", and a value
 * whose column name differs from its label (`origin_port` → "Origin port") is declared
 * once instead of being spelled in a `map` at every call site.
 *
 * ## Costs are never inferred here
 *
 * The panel does not compute a total, a rate or a margin: it stores what the owner
 * typed and shows it back. Any arithmetic belongs to the engine, where it is tested —
 * a form that quietly re-derived a freight total would be a second pricing
 * implementation.
 */

export type FieldType = 'text' | 'number' | 'bool' | 'select' | 'textarea' | 'datetime';

export interface FieldSpec {
  name: string;
  label: string;
  type: FieldType;
  options?: Array<{ value: string; label: string }>;
  hint?: string;
  wide?: boolean;
  placeholder?: string;
}

export type Row = Record<string, unknown>;

/** A record as the editor's form state: strings for text, numbers for numbers, bools for bools. */
type FormState = Record<string, string | number | boolean>;

function formFromRow(fields: FieldSpec[], row: Row | null): FormState {
  const state: FormState = {};
  for (const field of fields) {
    const value = row?.[field.name];
    if (field.type === 'bool') {
      state[field.name] = value === true || value === 1 || value === '1';
    } else if (field.type === 'number') {
      state[field.name] = value === null || value === undefined ? '' : text(value);
    } else {
      state[field.name] = text(value);
    }
  }
  return state;
}

/** A form's state as the plugin's payload: numbers parsed, nothing invented. */
function payloadFromForm(fields: FieldSpec[], state: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const value = state[field.name];
    if (field.type === 'bool') {
      payload[field.name] = Boolean(value);
    } else if (field.type === 'number') {
      const parsed = numberValue(value);
      // An empty money/quantity box means "not set", which the plugin stores as 0.
      // It never means "keep the old value" — that would make clearing a field a no-op.
      payload[field.name] = parsed === null ? 0 : parsed;
    } else if (field.type === 'textarea') {
      payload[field.name] = text(value);
    } else {
      payload[field.name] = text(value);
    }
  }
  return payload;
}

export default function RecordPanel({
  resource,
  title,
  description,
  fields,
  rows,
  onChanged,
  newLabel,
  columns,
  blank,
}: {
  resource: WholesaleResource;
  title: string;
  description: string;
  fields: FieldSpec[];
  rows: Row[];
  onChanged: () => void | Promise<void>;
  newLabel: string;
  /** The table's own columns; the editor fields are not always what a list should show. */
  columns: Array<Column<Row>>;
  blank: FormState;
}) {
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const writer = useWriter();

  const editingRow = useMemo(
    () => (typeof editingId === 'number' ? rows.find((row) => rowId(row) === editingId) ?? null : null),
    [editingId, rows]
  );

  function startNew() {
    setEditingId('new');
    setForm(blank);
    writer.clear();
  }

  function startEdit(row: Row) {
    setEditingId(rowId(row));
    setForm(formFromRow(fields, row));
    writer.clear();
  }

  async function save() {
    const id = typeof editingId === 'number' ? editingId : undefined;
    const result = await writer.run(
      () => saveWholesaleRecord(resource, payloadFromForm(fields, form), id),
      id ? 'Changes saved.' : 'Record created.'
    );
    if (result) {
      setEditingId(null);
      await onChanged();
    }
  }

  async function remove(row: Row) {
    const id = rowId(row);
    if (!id) return;
    const done = await writer.run(() => removeWholesaleRecord(resource, id), 'Record deleted.');
    if (done !== null) await onChanged();
  }

  const actionColumns: Column<Row>[] = [
    ...columns,
    {
      key: '__actions',
      label: '',
      align: 'right',
      render: (row) => (
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => startEdit(row)}
            className="p-1.5 rounded-lg text-charcoal-light hover:bg-charcoal/5"
            aria-label={`Edit ${text(row.name ?? row.code ?? row.label ?? 'record')}`}
          >
            <Pencil className="w-4 h-4" />
          </button>
          <DeleteRowButton label={text(row.name ?? row.code ?? row.label ?? 'record')} onDelete={() => remove(row)} />
        </span>
      ),
    },
  ];

  return (
    <Panel
      title={title}
      description={description}
      actions={
        editingId === null ? (
          <AddButton label={newLabel} onClick={startNew} />
        ) : (
          <Button variant="ghost" onClick={() => setEditingId(null)}>
            <X className="w-4 h-4" />
            Close
          </Button>
        )
      }
    >
      <div className="space-y-5">
        {writer.error ? <Notice kind="error">{writer.error}</Notice> : null}
        {writer.saved && editingId === null ? <Notice kind="success">{writer.saved}</Notice> : null}

        {editingId !== null ? (
          <div className="rounded-2xl border border-charcoal/10 bg-warm-white/50 p-5">
            <h3 className="font-semibold text-charcoal mb-4">
              {typeof editingId === 'number' ? 'Edit record' : newLabel}
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              {fields.map((field) => (
                <Field key={field.name} label={field.label} hint={field.hint} wide={field.wide}>
                  {field.type === 'bool' ? (
                    <Toggle
                      label={form[field.name] ? 'Yes' : 'No'}
                      checked={Boolean(form[field.name])}
                      onChange={(value) => setForm((current) => ({ ...current, [field.name]: value }))}
                    />
                  ) : field.type === 'select' ? (
                    <Select
                      value={text(form[field.name])}
                      onChange={(value) => setForm((current) => ({ ...current, [field.name]: value }))}
                      options={field.options ?? []}
                    />
                  ) : field.type === 'textarea' ? (
                    <TextArea
                      value={text(form[field.name])}
                      onChange={(value) => setForm((current) => ({ ...current, [field.name]: value }))}
                      placeholder={field.placeholder}
                    />
                  ) : (
                    <TextInput
                      value={form[field.name] === undefined ? '' : (form[field.name] as string | number)}
                      onChange={(value) => setForm((current) => ({ ...current, [field.name]: value }))}
                      placeholder={field.placeholder}
                      type={field.type === 'number' ? 'number' : field.type === 'datetime' ? 'date' : 'text'}
                    />
                  )}
                </Field>
              ))}
            </div>

            <div className="mt-5 flex items-center gap-3">
              <SaveButton onClick={save} busy={writer.saving} />
              <Button variant="ghost" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <DataTable
          columns={actionColumns}
          rows={rows}
          rowKey={(row, index) => String(rowId(row) ?? `row-${index}`)}
          empty="Nothing stored yet."
        />
      </div>
    </Panel>
  );
}
