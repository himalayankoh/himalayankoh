import { useEffect, useRef, useState } from "react";

/** One persisted cell. Keyboard navigation targets the next cell only after a confirmed save. */
export function InlineCell({
  id,
  label,
  value,
  numeric,
  type = "text",
  options,
  onSave,
  hint,
  disabled,
}: {
  id: string;
  label: string;
  value: string | number | null | undefined;
  numeric?: boolean;
  type?: "text" | "date";
  options?: Record<string, string>;
  onSave: (value: string | number) => Promise<void>;
  hint?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const busy = useRef(false);
  const cancel = useRef(false);
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null);
  useEffect(() => {
    if (!editing) setDraft(String(value ?? ""));
  }, [value, editing]);
  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      if (!options && type !== "date") ref.current?.select();
    }
  }, [editing, options, type]);
  const begin = () => {
    cancel.current = false;
    setError("");
    setEditing(true);
  };
  const move = (next?: HTMLElement | null) => {
    if (next && next.id !== id) {
      next.focus();
      next.click();
    } else queueMicrotask(() => document.getElementById(id)?.focus());
  };
  const save = async (next?: HTMLElement | null) => {
    if (busy.current || cancel.current) return;
    if (draft === String(value ?? "")) {
      setEditing(false);
      move(next);
      return;
    }
    if (
      numeric &&
      (!draft.trim() || !Number.isFinite(Number(draft)) || Number(draft) < 0)
    ) {
      setState("error");
      setError("Enter a non-negative amount.");
      return;
    }
    busy.current = true;
    setState("saving");
    setError("");
    try {
      await onSave(numeric ? Number(draft) : draft);
      setState("saved");
      setEditing(false);
      move(next);
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Save failed. Retry.");
    } finally {
      busy.current = false;
    }
  };
  const keys = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel.current = true;
      setEditing(false);
      setState("idle");
      setDraft(String(value ?? ""));
      queueMicrotask(() => document.getElementById(id)?.focus());
    }
    if (event.key !== "Enter" && event.key !== "Tab") return;
    event.preventDefault();
    const region = ref.current?.closest("[data-sales-sheet]");
    const cells = Array.from(
      region?.querySelectorAll<HTMLElement>("[data-sales-edit]") ?? [],
    );
    const index = cells.findIndex((c) => c.id === id);
    let next = cells[index + (event.shiftKey ? -1 : 1)];
    if (event.key === "Enter") {
      const col = ref.current?.closest("td")?.cellIndex;
      const nextRow = ref.current?.closest("tr")?.nextElementSibling;
      next =
        (col === undefined
          ? null
          : nextRow?.children[col]?.querySelector<HTMLElement>(
              "[data-sales-edit]",
            )) ?? cells[index];
    }
    void save(next);
  };
  const common = {
    id,
    "aria-label": label,
    "data-sales-edit": true,
    "aria-invalid": state === "error",
    disabled: state === "saving",
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft(e.target.value),
    onKeyDown: keys,
    onBlur: () => void save(),
    ref,
  };
  return (
    <div className="sales-cell">
      {editing ? (
        options ? (
          <select {...common}>
            {Object.entries(options).map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </select>
        ) : (
          <input
            {...common}
            type={numeric ? "number" : type}
            min={numeric ? 0 : undefined}
            step={numeric ? "0.01" : undefined}
          />
        )
      ) : (
        <button
          type="button"
          id={id}
          data-sales-edit
          aria-label={`Edit ${label}`}
          disabled={disabled}
          onClick={begin}
          title={hint || "Click to edit. Enter saves down; Tab saves across."}
          className={numeric ? "sales-number" : ""}
        >
          {value == null || value === ""
            ? "—"
            : options
              ? options[String(value)]
              : numeric
                ? Number(value).toFixed(2)
                : String(value)}
        </button>
      )}
      <span className="sales-cell-state" aria-live="polite">
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : error}
      </span>
    </div>
  );
}
