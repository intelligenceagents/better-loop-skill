import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const pkg = new URL("packages/contracts/", root);
await mkdir(new URL("schemas/", pkg), { recursive: true });
await mkdir(new URL("artifacts/", root), { recursive: true });
await Promise.all(["share-candidate", "evaluation-run"].map(name =>
  copyFile(new URL(`schemas/${name}.schema.json`, root), new URL(`schemas/${name}.schema.json`, pkg))));
await copyFile(new URL("LICENSE", root), new URL("LICENSE", pkg));
const notices = [];
for (const [name, file] of [
  ["ajv", "LICENSE"], ["ajv-formats", "LICENSE"],
  ["fast-uri", "LICENSE"], ["fast-deep-equal", "LICENSE"],
  ["@noble/hashes", "LICENSE"],
]) {
  const metadata = JSON.parse(await readFile(new URL(`node_modules/${name}/package.json`, root), "utf8"));
  notices.push(`## ${name} ${metadata.version}\n\n${await readFile(new URL(`node_modules/${name}/${file}`, root), "utf8")}`);
}
await writeFile(new URL("THIRD_PARTY_NOTICES.md", pkg),
  "# Bundled dependency notices\n\n" + notices.join("\n\n"));
const common = {
  bundle: true, target: "es2022", sourcemap: false,
  legalComments: "inline", logLevel: "warning",
};
await Promise.all([
  build({ ...common, entryPoints: ["packages/contracts/src/index.ts"], outfile: "packages/contracts/dist/index.js", platform: "browser", format: "esm" }),
  build({ ...common, entryPoints: ["packages/contracts/src/index.ts"], outfile: "packages/contracts/dist/index.cjs", platform: "browser", format: "cjs" }),
  build({ ...common, entryPoints: ["packages/contracts/src/cli.ts"], outfile: "packages/contracts/dist/cli.js", platform: "node", format: "esm" }),
]);
await copyFile(new URL("dist/index.d.ts", pkg), new URL("dist/index.d.cts", pkg));
