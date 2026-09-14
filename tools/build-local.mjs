import { execFileSync } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";

for (const name of ["core", "adapters", "cli"]) {
  const pkg = `packages/${name}`;
  await mkdir(`${pkg}/dist`, { recursive: true });
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", `${pkg}/tsconfig.json`], { stdio: "inherit" });
  const common = {
    bundle: true, target: "es2022", platform: "node", legalComments: "inline",
    sourcemap: false, logLevel: "warning", external: ["@better-loop/*"],
  };
  await Promise.all([
    build({ ...common, entryPoints: [`${pkg}/src/index.ts`], outfile: `${pkg}/dist/index.js`, format: "esm" }),
    build({ ...common, entryPoints: [`${pkg}/src/index.ts`], outfile: `${pkg}/dist/index.cjs`, format: "cjs" }),
    copyFile("LICENSE", `${pkg}/LICENSE`),
  ]);
  await copyFile(`${pkg}/dist/index.d.ts`, `${pkg}/dist/index.d.cts`);
  if (name === "cli") await build({ ...common, entryPoints: [`${pkg}/src/cli.ts`], outfile: `${pkg}/dist/cli.js`, format: "esm" });
}
