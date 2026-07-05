/**
 * Bun test preload (wired up in bunfig.toml).
 *
 * Runs once before any test file. It installs the shared `@/db` and
 * `@anthropic-ai/sdk` fakes globally and consistently — the only safe way to
 * mock these boundaries given that Bun's `mock.module` is process-global. Tests
 * configure/inspect them through the helpers in ./fakes.ts.
 *
 * A baseline environment is also set so modules that validate env at import
 * (e.g. getEnv) don't throw. `??=` is used so individual tests can still
 * override any value (e.g. encryption.test sets its own ENCRYPTION_KEY).
 */
import { afterEach, mock } from "bun:test";

import { fakeDb, resetDb, FakeAnthropic, resetAnthropic } from "./fakes";

process.env.DATABASE_URL ??= "postgres://mock:mock@localhost:5432/mock";
process.env.JWT_SECRET ??= "test-jwt-secret-at-least-32-chars-long!!";
process.env.JWT_REFRESH_SECRET ??= "test-jwt-refresh-secret-at-least-32-chars!!";
process.env.ANTHROPIC_API_KEY ??= "sk-ant-test-key";
process.env.ANTHROPIC_MODEL ??= "claude-sonnet-4-6";
process.env.ENCRYPTION_KEY ??= "0".repeat(64);

void mock.module("@/db", () => ({ db: fakeDb }));
void mock.module("@anthropic-ai/sdk", () => ({ default: FakeAnthropic }));

// Keep state from leaking between tests within and across files.
afterEach(() => {
  resetDb();
  resetAnthropic();
});
