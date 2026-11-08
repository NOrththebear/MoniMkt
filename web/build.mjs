import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const site = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(site, "dist");
const assets = path.join(dist, "assets");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(assets, { recursive: true });

const tailwindCli = path.join(site, "node_modules", "tailwindcss", "lib", "cli.js");
execFileSync(
  process.execPath,
  [
    tailwindCli,
    "-c",
    path.join(site, "tailwind.config.ts"),
    "-i",
    path.join(site, "src", "input.css"),
    "-o",
    path.join(assets, "styles.css"),
    "--minify",
  ],
  { cwd: site, stdio: "inherit" },
);

await build({
  absWorkingDir: site,
  entryPoints: [path.join(site, "src", "main.js")],
  bundle: true,
  splitting: true,
  format: "esm",
  outdir: assets,
  entryNames: "[name]",
  chunkNames: "chunks/[name]-[hash]",
  minify: true,
  platform: "browser",
  target: "es2020",
  logLevel: "info",
});

execFileSync(process.execPath, [path.join(site, "build-html.mjs"), dist], {
  cwd: site,
  stdio: "inherit",
});

fs.copyFileSync(path.join(site, "public", "monimkt.svg"), path.join(assets, "monimkt.svg"));
fs.copyFileSync(path.join(site, "public", "inter-latin.woff2"), path.join(assets, "inter-latin.woff2"));

console.log(`Built standalone site in ${dist}`);
