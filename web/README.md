# MoniMkt static frontend

This is the raw HTML/CSS/JS version of the MoniMkt frontend. It preserves the
existing design and the CKB wallet / market behavior as a fully static app.

## Run locally

```powershell
cd web
npm install
npm run build
node serve.mjs
```

Open <http://localhost:3000>. The build writes the deployable site to
`web/dist/`.

## Deploy to Vercel

The repository root includes `vercel.json` and `.vercelignore`.

- Framework preset: **Other**
- Install command: `cd web && npm install`
- Build command: `node web/build.mjs`
- Output directory: `web/dist`

Import the repository into Vercel and deploy. No serverless functions are
required, so it runs on the Hobby plan.

The configuration also enables clean URLs (`/supply`, `/borrow`, etc.), a local
font, immutable chunk caching, and baseline security headers.

## Deploy to any static host

Upload the contents of `web/dist/`:

```text
index.html
supply.html
withdraw.html
borrow.html
repay.html
dashboard.html
history.html
assets/
```

Source files, `node_modules/`, and build scripts are not part of the deployment.

## What is included

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

```text
lib/ckb-market.ts
lib/ckb-config.ts
```

Rebuild after changing those files:

```powershell
npm run build
```
