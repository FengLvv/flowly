/**
 * The project/Runtime view last visited during this app run (PROJECT-TABS-SPEC).
 * Module state on purpose: it survives leaving and re-entering Flowly,
 * and a cold start (fresh client bundle) begins again at the first project.
 */
let lastViewed = "";
let runtimeViewed = false;
export const lastViewedProject = () => lastViewed;
/** Explicit native/card/idea entry always takes precedence over warm return memory. */
export const restoreRuntimeView = (explicitTarget = false) => runtimeViewed && !explicitTarget;
export function rememberViewedRuntime() {
  runtimeViewed = true;
}
export function rememberViewedProject(id: string | undefined) {
  if (id) {
    lastViewed = id;
    runtimeViewed = false;
  }
}

/** Explicit choice, else the project last viewed in this run, else the first one. */
export function pickProject<T extends { id: string }>(projects: readonly T[], chosen: string, viewed: string): T | undefined {
  return projects.find((p) => p.id === chosen) || projects.find((p) => p.id === viewed) || projects[0];
}
