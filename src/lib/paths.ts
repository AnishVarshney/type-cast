import { realpathSync } from "node:fs";
import * as path from "node:path";

/**
 * Returns true when any path segment is `..` (directory traversal attempt).
 */
export function hasTraversalSegment(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  return normalized.split("/").some((segment) => segment === "..");
}

/**
 * Resolves `userPath` under `workspaceRoot`, rejecting `..` segments and escapes.
 */
export function resolveSafePath(workspaceRoot: string, userPath: string): string {
  if (hasTraversalSegment(userPath)) {
    throw new Error(`Path contains forbidden ".." segment: ${userPath}`);
  }

  const rootResolved = path.resolve(workspaceRoot);
  const resolved = path.resolve(rootResolved, userPath);

  const relative = path.relative(rootResolved, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace root: ${userPath}`);
  }

  return resolved;
}

/**
 * Validates and resolves an array of user-supplied paths under the workspace root.
 */
export function resolveSafePaths(
  workspaceRoot: string,
  paths: string[],
): string[] {
  return paths.map((p) => resolveSafePath(workspaceRoot, p));
}

/**
 * Workspace root for type resolution — set via TYPE_CAST_WORKSPACE or cwd.
 */
export function getWorkspaceRoot(): string {
  const fromEnv = process.env["TYPE_CAST_WORKSPACE"];
  if (fromEnv) {
    if (hasTraversalSegment(fromEnv)) {
      throw new Error("TYPE_CAST_WORKSPACE contains forbidden '..' segment");
    }
    return realpathSync(path.resolve(fromEnv));
  }
  return realpathSync(process.cwd());
}
