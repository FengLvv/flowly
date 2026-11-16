import { inject } from "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    paseoFixture: { home: string; cli: string; gitConfig: string };
  }
}

const { home, cli, gitConfig } = inject("paseoFixture");
// Plain assignments deliberately form the baseline restored by vi.unstubAllEnvs.
process.env.PASEO_HOME = home;
process.env.PASEO_CLI = cli;
process.env.NODE_ENV = "test";
process.env.FLOWLY_TELEMETRY = "0";
for (const key of ["PASEO_HOST", "PASEO_AGENT_ID", "PASEO_AGENT_CWD", "PASEO_WORKSPACE_ID", "FLOWLY_DATA_DIR", "ULTRA_KANBAN_DATA_DIR", "FLOWLY_LINKED_DIR", "ULTRA_KANBAN_LINKED_DIR"])
  delete process.env[key];
// Fixtures must not inherit user hooks, signing, line-ending/cache settings or
// a private commit index from the invoking session. This affects workers only.
for (const key of Object.keys(process.env)) if (key.startsWith("GIT_")) delete process.env[key];
process.env.GIT_CONFIG_GLOBAL = gitConfig;
process.env.GIT_CONFIG_NOSYSTEM = "1";
