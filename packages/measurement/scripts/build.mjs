import { copyFile, mkdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const pkg = new URL("../", import.meta.url);
const root = new URL("../../../", import.meta.url);
const contractSource = new URL("packages/contracts/src/generated/evaluation-run.ts", root);
const localTypes = new URL("src/evaluation-run.ts", pkg);
if (await readFile(contractSource, "utf8") !== await readFile(localTypes, "utf8")) {
  throw new Error("Evaluation contract types changed; review and update the scoped measurement snapshot.");
}
await mkdir(new URL("dist/", pkg), { recursive: true });
execFileSync(process.execPath, [
  fileURLToPath(new URL("node_modules/typescript/bin/tsc", root)), "-p", fileURLToPath(new URL("tsconfig.json", pkg)),
], { stdio: "inherit" });
const common = { bundle: true, target: "es2022", sourcemap: false, legalComments: "inline", logLevel: "warning" };
await Promise.all([
  build({ ...common, entryPoints: [fileURLToPath(new URL("src/index.ts", pkg))], outfile: fileURLToPath(new URL("dist/index.js", pkg)), format: "esm", platform: "browser" }),
  build({ ...common, entryPoints: [fileURLToPath(new URL("src/index.ts", pkg))], outfile: fileURLToPath(new URL("dist/index.cjs", pkg)), format: "cjs", platform: "browser" }),
  build({ ...common, entryPoints: [fileURLToPath(new URL("src/cli.ts", pkg))], outfile: fileURLToPath(new URL("dist/cli.js", pkg)), format: "esm", platform: "node" }),
]);
await Promise.all([
  copyFile(new URL("dist/index.d.ts", pkg), new URL("dist/index.d.cts", pkg)),
  copyFile(new URL("LICENSE", root), new URL("LICENSE", pkg)),
  copyFile(new URL("packages/contracts/THIRD_PARTY_NOTICES.md", root), new URL("THIRD_PARTY_NOTICES.md", pkg)),
]);
