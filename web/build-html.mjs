import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const outDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.dirname(fileURLToPath(import.meta.url));
const pages = [
  { file: "index.html", page: "home", title: "MoniMkt | CKB Lending" },
  { file: "supply.html", page: "supply", title: "Supply | MoniMkt" },
  { file: "withdraw.html", page: "withdraw", title: "Withdraw | MoniMkt" },
  { file: "borrow.html", page: "borrow", title: "Borrow | MoniMkt" },
  { file: "repay.html", page: "repay", title: "Repay | MoniMkt" },
  { file: "dashboard.html", page: "dashboard", title: "Dashboard | MoniMkt" },
  { file: "history.html", page: "history", title: "History | MoniMkt" },
];

const template = ({ page, title }) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="Native CKB lending and borrowing: RUSD base asset, CKB collateral" />
    <link rel="icon" href="assets/monimkt.svg" />
    <link rel="preload" href="assets/inter-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="assets/styles.css" />
  </head>
  <body data-page="${page}">
    <div id="app"></div>
    <noscript>
      <div style="padding: 24px; color: #fff; font-family: Inter, sans-serif">
        MoniMkt needs JavaScript enabled for wallet connection and CKB transactions.
      </div>
    </noscript>
    <script type="module" src="assets/main.js"></script>
  </body>
</html>
`;

for (const page of pages) {
  fs.writeFileSync(path.join(outDir, page.file), template(page));
}
console.log(`Wrote ${pages.length} HTML pages`);
