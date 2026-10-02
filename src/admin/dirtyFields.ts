/**
 * The editor's edited-field set, readable in the same tick it was written.
 *
 * A `useState` set is the wrong home for this question. React queues the update,
 * so a handler that marks a field and then saves — in the same tick — reads the
 * *previous* set, and the save goes to the store without the field it was just
 * given. The catalog editor's SEO tab does exactly that: "Generate SEO & Save"
 * writes the generated title, description, keywords and slug and then calls the
 * save immediately, so the store was never told about any of them while the
 * notification said they had been generated and saved. The editor then reads the
 * product back from the store and shows the old values again — which is what the
 * owner saw as SEO that "reverts to the old one".
 *
 * The tracker is a plain object, not a hook, so it can be unit-tested on its own
 * and read from anywhere in the save path. Nothing renders from it: the fields a
 * form has edited decide what a save sends, not what it draws.
 */
export interface DirtyFieldTracker {
  /** Records a field as edited. Visible to `has` immediately. */
  mark(field: string): void;
  /** Forgets every field — a fresh product load, or a save that landed. */
  clear(): void;
  has(field: string): boolean;
  /** How many distinct fields have been edited. */
  size(): number;
}

export function createDirtyFields(initial: Iterable<string> = []): DirtyFieldTracker {
  let fields = new Set<string>(initial);

  return {
    mark(field) {
      fields.add(field);
    },
    clear() {
      fields = new Set();
    },
    has(field) {
      return fields.has(field);
    },
    size() {
      return fields.size;
    },
  };
}
