import { inject } from "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    paseoFixture: { home: string; cli: string };
  }
}

const { home, cli } = inject("paseoFixture");
// Plain assignments deliberately form the baseline restored by vi.unstubAllEnvs.
process.env.PASEO_HOME = home;
process.env.PASEO_CLI = cli;
process.env.NODE_ENV = "test";
process.env.FLOWLY_TELEMETRY = "0";
for (const key of ["PASEO_HOST", "PASEO_AGENT_ID", "PASEO_AGENT_CWD", "PASEO_WORKSPACE_ID", "FLOWLY_DATA_DIR", "ULTRA_KANBAN_DATA_DIR", "FLOWLY_LINKED_DIR", "ULTRA_KANBAN_LINKED_DIR"])
  delete process.env[key];
