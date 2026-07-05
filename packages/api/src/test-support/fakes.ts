/**
 * Shared, configurable test fakes for the two boundaries that cannot be exercised
 * for real in unit tests: the database (`@/db`) and the Anthropic SDK
 * (`@anthropic-ai/sdk`).
 *
 * Bun's `mock.module` is global and persists for the whole `bun test` run, so a
 * per-file `mock.module("@/db", ...)` leaks into every other file. Instead we
 * install ONE fake for each boundary from a preload (see ./preload.ts) and let
 * each test configure/inspect it through the mutable state exported here.
 *
 * Everything else (rate limiter, encryption, auth, audit) runs for real with
 * controlled inputs — no module mock needed, so no cross-file pollution.
 */

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Fake Drizzle database
// ---------------------------------------------------------------------------

interface DbState {
  /** Rows returned by `select().from(table)...`, keyed by the real schema table. */
  selectByTable: Map<unknown, Row[]>;
  /** Rows returned by `insert(table).values(...).returning()`, keyed by table. */
  insertReturnByTable: Map<unknown, Row[]>;
  /**
   * Rows returned by `update(table)...returning()`, keyed by table. When a
   * table has no explicit entry, the fake falls back to the table's select
   * rows — the WHERE-blind approximation of "the guarded update matched".
   */
  updateReturnByTable: Map<unknown, Row[]>;
  inserts: { table: unknown; values: Row }[];
  updates: { table: unknown; set: Row }[];
  deletes: { table: unknown }[];
  selects: { table: unknown }[];
}

export const dbState: DbState = {
  selectByTable: new Map(),
  insertReturnByTable: new Map(),
  updateReturnByTable: new Map(),
  inserts: [],
  updates: [],
  deletes: [],
  selects: [],
};

export function setSelect(table: unknown, rows: Row[]): void {
  dbState.selectByTable.set(table, rows);
}

export function setInsertReturn(table: unknown, rows: Row[]): void {
  dbState.insertReturnByTable.set(table, rows);
}

export function setUpdateReturn(table: unknown, rows: Row[]): void {
  dbState.updateReturnByTable.set(table, rows);
}

export function resetDb(): void {
  dbState.selectByTable.clear();
  dbState.insertReturnByTable.clear();
  dbState.updateReturnByTable.clear();
  dbState.inserts = [];
  dbState.updates = [];
  dbState.deletes = [];
  dbState.selects = [];
}

// A chainable, awaitable select node. It resolves to `rows` whether the caller
// awaits after `.where(...)`, after `.where(...).limit(n)`, after
// `.where(...).orderBy(...).limit(n)`, or after `.where(...).for(...)` —
// covering every shape used in the app.
function selectChain(rows: Row[]): Record<string, unknown> {
  return {
    where: () => selectChain(rows),
    orderBy: () => selectChain(rows),
    offset: () => selectChain(rows),
    for: () => selectChain(rows),
    limit: () => Promise.resolve(rows),
    then: (resolve: (v: Row[]) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
}

// Awaitable update tail supporting both `await ...where(...)` and
// `await ...where(...).returning(...)`.
function updateTail(ret: Row[]): Record<string, unknown> {
  return {
    returning: () => Promise.resolve(ret),
    then: (resolve: (v: undefined) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(undefined).then(resolve, reject),
  };
}

export const fakeDb = {
  select: () => ({
    from: (table: unknown) => {
      dbState.selects.push({ table });
      return selectChain(dbState.selectByTable.get(table) ?? []);
    },
  }),
  insert: (table: unknown) => ({
    values: (values: Row) => {
      dbState.inserts.push({ table, values });
      const ret = dbState.insertReturnByTable.get(table) ?? [
        { id: `gen-${dbState.inserts.length}` },
      ];
      return {
        returning: () => Promise.resolve(ret),
        then: (resolve: (v: undefined) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(undefined).then(resolve, reject),
      };
    },
  }),
  update: (table: unknown) => ({
    set: (set: Row) => {
      dbState.updates.push({ table, set });
      const ret = dbState.updateReturnByTable.get(table) ?? dbState.selectByTable.get(table) ?? [];
      return {
        where: () => updateTail(ret),
        ...updateTail(ret),
      };
    },
  }),
  delete: (table: unknown) => {
    dbState.deletes.push({ table });
    return { where: () => Promise.resolve() };
  },
  // Real transactions can't be simulated here; the callback just runs against
  // the same fake, which matches how the app uses tx (query building only).
  transaction: (cb: (tx: unknown) => Promise<unknown>): Promise<unknown> => cb(fakeDb),
};

// ---------------------------------------------------------------------------
// Fake Anthropic SDK
// ---------------------------------------------------------------------------

export type FakeBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

export interface ScriptedTurn {
  /** Text deltas streamed for this turn (in order). */
  deltas: string[];
  /** The blocks returned by `finalMessage()` for this turn. */
  content: FakeBlock[];
  /** When true, the stream throws — simulates an SDK/network failure. */
  throwError?: boolean;
}

interface AnthropicState {
  scripts: ScriptedTurn[];
  calls: Record<string, unknown>[];
  callCount: number;
}

export const anthropicState: AnthropicState = {
  scripts: [],
  calls: [],
  callCount: 0,
};

export function setAnthropicScripts(scripts: ScriptedTurn[]): void {
  anthropicState.scripts = scripts;
}

export function resetAnthropic(): void {
  anthropicState.scripts = [];
  anthropicState.calls = [];
  anthropicState.callCount = 0;
}

function makeStream(turn: ScriptedTurn) {
  return {
    async *[Symbol.asyncIterator]() {
      await Promise.resolve();
      if (turn.throwError) throw new Error("Simulated Anthropic stream error");
      for (const text of turn.deltas) {
        yield {
          type: "content_block_delta" as const,
          delta: { type: "text_delta" as const, text },
        };
      }
    },
    finalMessage: async () => {
      await Promise.resolve();
      if (turn.throwError) throw new Error("Simulated Anthropic stream error");
      return { content: turn.content };
    },
  };
}

export class FakeAnthropic {
  messages = {
    stream: (args: Record<string, unknown>) => {
      anthropicState.calls.push(args);
      // Once the script is exhausted, repeat the last turn (lets a single
      // tool_use turn drive the max-iteration guard).
      const idx = Math.min(anthropicState.callCount, anthropicState.scripts.length - 1);
      const turn = anthropicState.scripts[idx] ?? {
        deltas: [],
        content: [{ type: "text", text: "" }],
      };
      anthropicState.callCount += 1;
      return makeStream(turn);
    },
  };
}
