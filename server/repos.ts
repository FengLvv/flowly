import { realpath } from "node:fs/promises";
import { relative, isAbsolute, resolve, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
function contains(root: string, path: string) {
  const suffix = relative(root, path);
  return (
    !suffix ||
    (!isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith(`..${sep}`))
  );
}
// A per-operation cache avoids repeated Git probes, while subsequent reads see repository changes.
export function repoMatcher(repos: string[]) {
  const paths = new Map<string, Promise<string | null>>();
  const git = new Map<string, Promise<string | null>>();
  const canonical = (path: string) => {
    if (!paths.has(path))
      paths.set(
        path,
        realpath(path).catch(() => null),
      );
    return paths.get(path)!;
  };
  const common = (path: string) => {
    if (!git.has(path))
      git.set(
        path,
        execute(
          "git",
          [
            "-C",
            path,
            "rev-parse",
            "--path-format=absolute",
            "--git-common-dir",
          ],
          { timeout: 5000, maxBuffer: 65536 },
        )
          .then(({ stdout }) => canonical(resolve(path, stdout.trim())))
          .catch(() => null),
      );
    return git.get(path)!;
  };
  return async (workspacePath: string): Promise<string[]> => {
    const path = await canonical(workspacePath);
    if (!path) return [];
    const matches: string[] = [];
    for (const repo of repos) {
      const root = await canonical(repo);
      if (!root) continue;
      if (contains(root, path)) {
        matches.push(repo);
        continue;
      }
      // Most cards use the project root or a child directory. Their canonical
      // containment already proves membership; Git is only needed outside it.
      const identity = await common(path);
      if (identity && identity === (await common(root))) matches.push(repo);
    }
    return matches.sort((a, b) => b.length - a.length);
  };
}
