import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });
await build({
  entryPoints: ["src/sender.ts"], bundle: true, platform: "browser", target: "es2022",
  format: "iife", outfile: "dist/sender.inline.js", legalComments: "none", minify: true,
});
for (const format of ["esm", "cjs"]) {
  for (const name of ["index", "browser"]) {
    const nodeEntry = name === "index";
    await build({
      entryPoints: [`src/${name}.ts`], bundle: true, platform: nodeEntry ? "node" : "browser", target: "es2022",
      format, outfile: `dist/${name}.${format === "esm" ? "js" : "cjs"}`,
      external: ["@better-loop/contracts", "@better-loop/evidence"],
      ...(nodeEntry && format === "cjs" ? {
        define: { "import.meta.url": "__handoffModuleUrl" },
        banner: { js: 'const __handoffModuleUrl = require("node:url").pathToFileURL(__filename).href;' },
      } : {}),
    });
  }
}
execFileSync(process.execPath, ["../../node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], { stdio: "inherit" });
for (const name of ["index", "browser"]) copyFileSync(`dist/${name}.d.ts`, `dist/${name}.d.cts`);
