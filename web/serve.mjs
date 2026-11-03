import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const routes = {
  "/": "index.html",
  "/index.html": "index.html",
  "/supply": "supply.html",
  "/supply.html": "supply.html",
  "/withdraw": "withdraw.html",
  "/withdraw.html": "withdraw.html",
  "/borrow": "borrow.html",
  "/borrow.html": "borrow.html",
  "/repay": "repay.html",
  "/repay.html": "repay.html",
  "/dashboard": "dashboard.html",
  "/dashboard.html": "dashboard.html",
  "/history": "history.html",
  "/history.html": "history.html",
};

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/") && pathname !== "/") pathname = pathname.slice(0, -1);
  const relative = routes[pathname] ?? (pathname.startsWith("/assets/") ? pathname.slice(1) : null);
  if (!relative) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const file = path.join(root, relative);
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const immutable =
      relative.startsWith("assets/chunks/") ||
      relative.endsWith(".woff2") ||
      relative.endsWith(".svg");
    const contentType = types[path.extname(file)] ?? "application/octet-stream";
    const compressible =
      contentType.startsWith("text/") || contentType.includes("javascript") || contentType.includes("json") || contentType.includes("svg");
    const acceptsGzip = String(req.headers["accept-encoding"] || "").includes("gzip");
    const headers = {
      "content-type": contentType,
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
      vary: "Accept-Encoding",
    };
    if (compressible && acceptsGzip) {
      headers["content-encoding"] = "gzip";
      res.writeHead(200, headers);
      res.end(zlib.gzipSync(data));
      return;
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`MoniMkt static site: http://localhost:${port}`);
});
