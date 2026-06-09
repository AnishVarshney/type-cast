import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { buildFlattenUri } from "../../resources/flatten-uri.js";

const MAX_EXPORT_LINES = 200;

type ExportableDeclaration =
  | ts.InterfaceDeclaration
  | ts.TypeAliasDeclaration
  | ts.EnumDeclaration
  | ts.FunctionDeclaration
  | ts.ClassDeclaration
  | ts.ModuleDeclaration;

function isExported(node: ExportableDeclaration): boolean {
  return (
    (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0 ||
    (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Default) !== 0
  );
}

function appendExport(
  sourceFile: ts.SourceFile,
  node: ExportableDeclaration,
  kind: string,
  exports: string[],
): void {
  const name = node.name?.getText(sourceFile) ?? "(anonymous)";
  const body = formatNode(sourceFile, node);
  const preview = body.length > 240 ? `${body.slice(0, 237)}...` : body;
  exports.push(`- ${kind} ${name}: ${preview}`);
}

function formatNode(sourceFile: ts.SourceFile, node: ts.Node): string {
  const text = sourceFile.text.slice(node.getStart(sourceFile), node.getEnd());
  return text.replace(/\s+/g, " ").trim();
}

function collectExportsFromFile(filePath: string): string[] {
  const sourceText = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const exports: string[] = [];

  const visit = (node: ts.Node): void => {
    if (exports.length >= MAX_EXPORT_LINES) {
      return;
    }

    if (ts.isInterfaceDeclaration(node) && isExported(node)) {
      appendExport(sourceFile, node, "interface", exports);
    } else if (ts.isTypeAliasDeclaration(node) && isExported(node)) {
      appendExport(sourceFile, node, "type", exports);
    } else if (ts.isEnumDeclaration(node) && isExported(node)) {
      appendExport(sourceFile, node, "enum", exports);
    } else if (ts.isFunctionDeclaration(node) && isExported(node)) {
      appendExport(sourceFile, node, "function", exports);
    } else if (ts.isClassDeclaration(node) && isExported(node)) {
      appendExport(sourceFile, node, "class", exports);
    } else if (ts.isModuleDeclaration(node) && isExported(node)) {
      appendExport(sourceFile, node, "namespace", exports);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return exports;
}

/**
 * Flattens resolved .d.ts files into the blueprint plain-text contract.
 */
export function flattenTypeDeclarations(
  packageName: string,
  files: string[],
  sourceLabel: string,
): string {
  const uri = buildFlattenUri("types", packageName);
  const generatedAt = new Date().toISOString();
  const exportLines: string[] = [];

  for (const filePath of files) {
    if (exportLines.length >= MAX_EXPORT_LINES) {
      break;
    }
    const fileExports = collectExportsFromFile(filePath);
    if (fileExports.length > 0) {
      exportLines.push(`### ${filePath}`);
      exportLines.push(...fileExports);
    }
  }

  if (exportLines.length === 0) {
    exportLines.push(
      "- (no exported interfaces, types, or namespaces detected in resolved files)",
    );
  }

  const body = ["## exports", ...exportLines].join("\n");
  const revision = createHash("sha256").update(body).digest("hex").slice(0, 8);

  return [
    "# type-cast flatten",
    `source: ${uri}`,
    `package: ${packageName}`,
    `resolvedFrom: ${sourceLabel}`,
    `revision: ${revision}`,
    `generatedAt: ${generatedAt}`,
    "",
    body,
  ].join("\n");
}
