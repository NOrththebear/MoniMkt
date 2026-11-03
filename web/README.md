# MoniMkt static frontend

This is the raw HTML/CSS/JS version of the MoniMkt frontend. It preserves the
existing design and the CKB wallet / market behavior as a fully static app.

## Run locally

```powershell
cd web
npm install
.\build.ps1
node serve.mjs
```

Open <http://localhost:3000>.

## Deploy

Build once, then upload these to any static host:

```
index.html
supply.html
withdraw.html
borrow.html
repay.html
dashboard.html
history.html
assets/
```

`src/`, `build.ps1`, `build-html.mjs`, `tailwind.config.ts`, and `serve.mjs` are
build/development helpers and do not need to be uploaded.

## What changed

- No application framework runtime.
- Initial page shell is ~48 KB JS + ~25 KB CSS + a local 48 KB Inter font.
- The CKB market module is loaded as a separate chunk after first paint.
- The CCC wallet connector is loaded only when the user clicks connect (or when
  a previous connection is restored).
- The CKB transaction builders in `lib/ckb-market.ts` are bundled into the web
  app, so the market, witness, and token-cell fixes stay in one native source.

## Local debugging

On `localhost`, the page exposes `window.__monimkt` with the current state and
the signer/refresh helpers. It is not exposed on deployed hostnames.

## Updating the market logic

The static site imports:

```
lib/ckb-market.ts
lib/ckb-config.ts
```

Rebuild after changing those files:

```powershell
.\build.ps1
```
