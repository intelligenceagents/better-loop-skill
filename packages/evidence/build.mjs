import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("dist", { recursive: true });
for (const format of ["esm", "cjs"]) {
  await build({
    entryPoints: ["src/index.ts"], bundle: true, platform: "neutral", target: "es2022",
    format, outfile: `dist/index.${format === "esm" ? "js" : "cjs"}`,
    external: ["@better-loop/contracts", "@better-loop/privacy"],
  });
}
execFileSync(process.execPath, ["../../node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], { stdio: "inherit" });
copyFileSync("dist/index.d.ts", "dist/index.d.cts");
copyFileSync("../../LICENSE", "LICENSE");
