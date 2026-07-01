import { Project, SyntaxKind, ts } from "ts-morph";
import { globSync } from "glob";
import * as path from "path";

const project = new Project({
  tsConfigFilePath: "tsconfig.json",
  skipFileDependencyResolution: true,
});

const patterns = ["src/**/*.ts", "src/**/*.tsx", "src/**/*.js", "src/**/*.jsx"];

function files() {
  const f = new Set<string>();
  for (const p of patterns) {
    const matches = globSync(p, { nodir: true });
    for (const m of matches) f.add(path.resolve(m.toString()));
  }
  return [...f];
}

for (const filePath of files()) {
  project.addSourceFileAtPathIfExists(filePath);
}

const sourceFiles = project.getSourceFiles();
let changed = 0;

for (const sf of sourceFiles) {
  let sfChanged = false;

  // 1) JSX <Link to="...">
  const jsxAttrs = sf.getDescendantsOfKind(SyntaxKind.JsxAttribute);
  for (const attr of jsxAttrs) {
    const name = attr.getName();
    if (name !== "to") continue;
    const initializer = attr.getInitializer();
    if (!initializer) continue;
    
    if (initializer.getKind() === SyntaxKind.StringLiteral) {
      const lit = initializer;
      if (lit.getLiteralText().startsWith("/_app/")) {
        const newVal = lit.getLiteralText().replace(/^\/_app\//, "/");
        lit.replaceWithText(`"${newVal}"`);
        sfChanged = true;
      }
    }
    
    if (initializer.getKind() === SyntaxKind.JsxExpression) {
      const expr = initializer.getExpression?.();
      if (expr && expr.getKind && expr.getKind() === SyntaxKind.StringLiteral) {
        const lit = expr;
        if (lit.getLiteralText().startsWith("/_app/")) {
          const newVal = lit.getLiteralText().replace(/^\/_app\//, "/");
          lit.replaceWithText(`"${newVal}"`);
          sfChanged = true;
        }
      }
    }
  }

  // 2) router.navigate
  const callExprs = sf.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of callExprs) {
    const exprText = call.getExpression().getText();
    
    if (!/navigate$/.test(exprText)) continue;
    const args = call.getArguments();
    if (args.length === 0) continue;
    const first = args[0];
    
    if (first && first.getKind && first.getKind() === SyntaxKind.ObjectLiteralExpression) {
      const props = first.getProperties();
      for (const p of props) {
        if (p.getKind() !== SyntaxKind.PropertyAssignment) continue;
        const name = p.getName();
        if (name !== "to") continue;
        const initializer = p.getInitializer();
        if (!initializer) continue;
        if (initializer.getKind() === SyntaxKind.StringLiteral) {
          const lit = initializer;
          if (lit.getLiteralText().startsWith("/_app/")) {
            const newVal = lit.getLiteralText().replace(/^\/_app\//, "/");
            lit.replaceWithText(`"${newVal}"`);
            sfChanged = true;
          }
        }
      }
    }
    
    if (first && first.getKind && first.getKind() === SyntaxKind.StringLiteral) {
      const lit = first;
      if (lit.getLiteralText().startsWith("/_app/")) {
        const newVal = lit.getLiteralText().replace(/^\/_app\//, "/");
        lit.replaceWithText(`"${newVal}"`);
        sfChanged = true;
      }
    }
  }

  if (sfChanged) {
    changed++;
  }
}

if (changed > 0) {
  project.saveSync();
}

console.log("Pronto! Arquivos modificados cirurgicamente:", changed);
