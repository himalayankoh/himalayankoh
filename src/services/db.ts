// ============================================================================
// HIMALAYAN KOH — ADMIN RECORD STORE
//
// One interface for the admin tool's *own* records — Product Scout candidates and
// scores, suppliers, agent jobs, the media/settings key-value stores, the Hermes
// review feeds. Nothing on the storefront reads them and nothing in WooCommerce
// depends on them; they are the working state of the console's AI and research
// screens.
//
// ## Where they live now
//
// They used to live in Supabase, reached with a hand-rolled PostgREST client built
// from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in the browser bundle. Both
// halves of that are gone: the records are rows in the hk-storefront plugin's
// `hk_admin_records` table, and the browser reaches them through the same-origin
// `/api/admin/records` route — which is the only side that holds a WordPress
// credential. There is no second backend to fall back to, so a failed write throws
// rather than landing somewhere else.
//
// ## Commerce is not here
//
// Products, categories, coupons and inventory have WooCommerce owners and are not
// stored through this adapter. Attempting one of those names is refused by the
// plugin's allowlist, on purpose: a product written here would be invisible to the
// storefront.
//
// ## Filters
//
// `filters` and `rawFilters` are applied to the decoded payload in the browser. The
// store has no column per field — the payload is JSON, and its shape belongs to the
// screen that writes it — so there is nothing to index. That is why the previous
// PostgREST filter expressions are honoured here rather than sent onward.
// ============================================================================

export type DbMode = 'wordpress' | 'unconfigured';

export interface DbConnectionResult {
  ok: boolean;
  mode: DbMode;
  detail?: string;
}

export interface DbAdapter {
  mode: DbMode;
  list<T>(
    table: string,
    opts?: {
      select?: string;
      orderBy?: string;
      limit?: number;
      filters?: Record<string, string>;
      /** PostgREST-style filter expressions, e.g. `url=not.like.data:*`. */
      rawFilters?: Record<string, string>;
    },
  ): Promise<T[]>;
  get<T>(table: string, id: string): Promise<T | null>;
  /** First row matching `column = value`, or null. Used for identity lookups. */
  findFirst<T>(table: string, column: string, value: string): Promise<T | null>;
  insert<T extends { id: string }>(table: string, row: T): Promise<T>;
  /** Insert a row whose PK is NOT `id` (e.g. store_settings.key). */
  insertRaw<T>(table: string, row: T): Promise<T>;
  update<T extends { id: string }>(table: string, id: string, patch: Partial<T>): Promise<T | null>;
  /** Update the first row where `column = value` (tables whose PK is not `id`). */
  updateBy<T>(table: string, column: string, value: string, patch: Partial<T>): Promise<T | null>;
  remove(table: string, id: string): Promise<void>;
  /** Honest connectivity check — never claims success it cannot prove. */
  testConnection(): Promise<DbConnectionResult>;
}

/** A stored record, as the route returns it. */
interface StoredRecord {
  id: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** A failure the caller must see, carrying the store's own message. */
export class AdminRecordError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'AdminRecordError';
    this.status = status;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  // Imported lazily so this module stays importable from a server context (the
  // legacy OrderList helpers do) without pulling a browser-only token store in.
  const { getFreshAccessToken } = await import('./wordpressAdminAuth');
  const token = await getFreshAccessToken().catch(() => null);
  if (!token) throw new AdminRecordError('Your admin session has expired. Sign in again.', 401);
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function parse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
  if (!response.ok) {
    throw new AdminRecordError(body.error || `The record store answered HTTP ${response.status}.`, response.status);
  }
  return body as T;
}

/** `not.like.<prefix>*` — the one raw expression the admin screens use. */
function matchesRawFilters(row: Record<string, unknown>, rawFilters?: Record<string, string>): boolean {
  if (!rawFilters) return true;
  for (const [key, expr] of Object.entries(rawFilters)) {
    const notLike = /^not\.like\.(.+)\*$/.exec(expr);
    if (notLike) {
      const value = row[key];
      if (typeof value === 'string' && value.startsWith(notLike[1])) return false;
      continue;
    }
    const like = /^like\.(.+)\*$/.exec(expr);
    if (like) {
      const value = row[key];
      if (typeof value !== 'string' || !value.startsWith(like[1])) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

export class AdminRecordsAdapter implements DbAdapter {
  readonly mode: DbMode = 'wordpress';

  private decode(record: StoredRecord): Record<string, unknown> {
    return { ...record.payload, id: record.id };
  }

  /** The record id for a row — `id` first, then the table's own key. */
  private idOf(table: string, row: Record<string, unknown>): string {
    const explicit = row.id ?? row.key ?? (table === 'store_settings' ? row.key : undefined);
    return explicit === undefined || explicit === null ? '' : String(explicit);
  }

  async list<T>(
    table: string,
    opts?: {
      select?: string;
      orderBy?: string;
      limit?: number;
      filters?: Record<string, string>;
      rawFilters?: Record<string, string>;
    },
  ): Promise<T[]> {
    const params = new URLSearchParams({ table });
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.orderBy) params.set('order', opts.orderBy);

    const response = await fetch(`/api/admin/records?${params.toString()}`, {
      headers: await authHeaders(),
      cache: 'no-store',
    });
    const { items } = await parse<{ items: StoredRecord[] }>(response);

    let rows = (items ?? []).map((record) => this.decode(record));
    if (opts?.filters) {
      for (const [key, value] of Object.entries(opts.filters)) {
        rows = rows.filter((row) => row[key] === value);
      }
    }
    rows = rows.filter((row) => matchesRawFilters(row, opts?.rawFilters));
    return rows as T[];
  }

  async get<T>(table: string, id: string): Promise<T | null> {
    const params = new URLSearchParams({ table, id });
    const response = await fetch(`/api/admin/records?${params.toString()}`, {
      headers: await authHeaders(),
      cache: 'no-store',
    });
    const { record } = await parse<{ record: StoredRecord | null }>(response);
    return record ? (this.decode(record) as T) : null;
  }

  async findFirst<T>(table: string, column: string, value: string): Promise<T | null> {
    const rows = await this.list<Record<string, unknown>>(table, { filters: { [column]: value }, limit: 1 });
    return (rows[0] as T) ?? null;
  }

  async insert<T extends { id: string }>(table: string, row: T): Promise<T> {
    return this.save(table, String(row.id), row) as Promise<T>;
  }

  async insertRaw<T>(table: string, row: T): Promise<T> {
    const record = row as Record<string, unknown>;
    const id = this.idOf(table, record);
    if (!id) {
      throw new AdminRecordError(`A ${table} row needs an id or a key to be stored.`, 400);
    }
    return this.save(table, id, record) as Promise<T>;
  }

  async update<T extends { id: string }>(table: string, id: string, patch: Partial<T>): Promise<T | null> {
    return this.updateBy(table, 'id', id, patch);
  }

  async updateBy<T>(table: string, column: string, value: string, patch: Partial<T>): Promise<T | null> {
    const existing = await this.findFirst<Record<string, unknown>>(table, column, value);
    // Nothing to patch: the row does not exist here, and inventing one would turn a
    // failed read into a silent insert.
    if (!existing) return null;
    const merged = { ...existing, ...(patch as Record<string, unknown>) };
    return (await this.save(table, this.idOf(table, existing), merged)) as T;
  }

  async remove(table: string, id: string): Promise<void> {
    const response = await fetch('/api/admin/records', {
      method: 'DELETE',
      headers: await authHeaders(),
      body: JSON.stringify({ table, id }),
    });
    await parse<{ deleted: boolean }>(response);
  }

  /** One create-or-replace, which is what every caller means by a write. */
  private async save(
    table: string,
    id: string,
    row: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { id: _ignored, ...payload } = row;
    const response = await fetch('/api/admin/records', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ table, id, payload }),
    });
    const { record } = await parse<{ record: StoredRecord | null }>(response);
    if (!record) {
      throw new AdminRecordError(`The ${table} record was not confirmed by the store.`);
    }
    return this.decode(record);
  }

  /**
   * A real probe: reads one row of a record name the store must know.
   *
   * `store_settings` is the probe because the app always has it, and an empty result
   * is still an answer — the question is whether the store responded, not whether it
   * had anything to say.
   */
  async testConnection(): Promise<DbConnectionResult> {
    try {
      await this.list('store_settings', { limit: 1 });
      return { ok: true, mode: 'wordpress', detail: 'WordPress admin records reachable' };
    } catch (error) {
      return {
        ok: false,
        mode: 'wordpress',
        detail: error instanceof Error ? error.message : 'The admin record store is unreachable.',
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let cachedAdapter: DbAdapter | null = null;

/** Returns the admin record adapter. There is one backend, so there is one branch. */
export function getDb(): DbAdapter {
  if (!cachedAdapter) cachedAdapter = new AdminRecordsAdapter();
  return cachedAdapter;
}

/** Which persistence mode is active — used for honest UI status. */
export function getDbMode(): DbMode {
  return 'wordpress';
}

export function resetDbForTests(): void {
  cachedAdapter = null;
}
