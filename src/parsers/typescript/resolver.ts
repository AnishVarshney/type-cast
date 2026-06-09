import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { getWorkspaceRoot, resolveSafePaths } from "../../lib/paths.js";

export interface ResolvedTypesSource {
  packageName: string;
  files: string[];
  sourceLabel: string;
}

function collectDeclarationFiles(dir: string): string[] {
  const results: string[] = [];

  if (!existsSync(dir)) {
    return results;
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectDeclarationFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".d.ts")) {
      results.push(fullPath);
    }
  }

  return results;
}

function readPackageTypesEntry(packageDir: string): string[] {
  const packageJsonPath = path.join(packageDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    return [];
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    types?: string;
    typings?: string;
  };

  const typesField = packageJson.types ?? packageJson.typings;
  if (!typesField) {
    return collectDeclarationFiles(packageDir);
  }

  const typesPath = path.join(packageDir, typesField);
  if (!existsSync(typesPath)) {
    return collectDeclarationFiles(packageDir);
  }

  if (statSync(typesPath).isDirectory()) {
    return collectDeclarationFiles(typesPath);
  }

  return [typesPath];
}

function resolveFromNodeModules(
  workspaceRoot: string,
  packageName: string,
): ResolvedTypesSource | null {
  const require = createRequire(path.join(workspaceRoot, "package.json"));

  const atTypesDir = path.join(
    workspaceRoot,
    "node_modules",
    "@types",
    packageName,
  );
  if (existsSync(atTypesDir)) {
    const files = collectDeclarationFiles(atTypesDir);
    if (files.length > 0) {
      return {
        packageName,
        files,
        sourceLabel: `@types/${packageName}`,
      };
    }
  }

  try {
    const pkgJsonPath = require.resolve(`${packageName}/package.json`, {
      paths: [workspaceRoot],
    });
    const packageDir = path.dirname(pkgJsonPath);
    const files = readPackageTypesEntry(packageDir);
    if (files.length > 0) {
      return {
        packageName,
        files,
        sourceLabel: packageName,
      };
    }
  } catch {
    // package not installed in workspace
  }

  return null;
}

/**
 * Resolves .d.ts files for a package using @types, package "types" field, or explicit paths.
 */
export function resolveTypesPackage(
  packageName: string,
  explicitPaths?: string[],
): ResolvedTypesSource {
  const workspaceRoot = getWorkspaceRoot();

  if (explicitPaths && explicitPaths.length > 0) {
    const files = resolveSafePaths(workspaceRoot, explicitPaths).filter(
      (filePath) => existsSync(filePath) && filePath.endsWith(".d.ts"),
    );

    if (files.length === 0) {
      throw new Error(
        `No .d.ts files found at the provided paths under workspace root`,
      );
    }

    return {
      packageName,
      files,
      sourceLabel: explicitPaths.join(", "),
    };
  }

  const resolved = resolveFromNodeModules(workspaceRoot, packageName);
  if (!resolved) {
    throw new Error(
      `Could not resolve types for "${packageName}". Install @types/${packageName} or provide explicit paths.`,
    );
  }

  return resolved;
}
