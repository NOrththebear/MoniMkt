import { ccc, WebComponentConnector } from "@ckb-ccc/connector";

let connector;
let onSignerChange;
let lastSigner;

const themeStyle = {
  zIndex: "999",
  "--background": "#fff",
  "--divider": "#eee",
  "--btn-primary": "#f8f8f8",
  "--btn-primary-hover": "#efeeee",
  "--btn-secondary": "#ddd",
  "--btn-secondary-hover": "#ccc",
  "--btn-color": "currentColor",
  "--btn-color-hover": "var(--btn-color)",
  "--icon-primary": "#1E1E1E",
  "--icon-secondary": "#666666",
  color: "#1e1e1e",
  "--tip-color": "#666",
  "--tip-color-hover": "var(--tip-color)",
};

function connectionSigner(event) {
  return event?.connectionOwner?.value?.signerInfo?.signer ?? null;
}

export async function initWallet(signerCallback) {
  onSignerChange = signerCallback;
  if (connector) return connector;

  connector = document.createElement("ccc-connector");
  connector.className = "monimkt-wallet-connector";
  connector.client = new ccc.ClientPublicTestnet();
  connector.name = "MoniMkt";
  connector.icon = `${window.location.origin}/assets/monimkt.svg`;
  Object.assign(connector.style, themeStyle);
  connector.style.display = "none";

  connector.addEventListener("connection", (event) => {
    const signer = connectionSigner(event);
    lastSigner = signer;
    onSignerChange?.(signer);
    if (signer) {
      // The wallet is selected; close the CCC modal without disconnecting.
      connector.close();
    }
  });

  connector.addEventListener("close", () => {
    if (connector) connector.style.display = "none";
  });

  document.body.appendChild(connector);
  return connector;
}

export async function openWallet(signerCallback) {
  await initWallet(signerCallback);
  connector.style.display = "block";
  connector.requestUpdate?.();
}

export function disconnectWallet() {
  if (!connector) return;
  connector.disconnect();
  connector.style.display = "none";
  lastSigner = null;
  onSignerChange?.(null);
}

export function currentSigner() {
  return lastSigner ?? connector?.signer?.signer ?? null;
}

export function hasStoredConnection() {
  try {
    const stored = JSON.parse(localStorage.getItem("ccc-connection-info") ?? "{}");
    return Boolean(stored.walletName && stored.signerName);
  } catch {
    return false;
  }
}

export { WebComponentConnector };
