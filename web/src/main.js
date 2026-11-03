import { icon } from "./icons.js";

const ONE = 100000000n;
const RESERVE = 100n * ONE;
const page = document.body.dataset.page || "home";
const app = document.getElementById("app");

const state = {
  page,
  signer: null,
  address: "",
  ownerLock: null,
  market: null,
  user: null,
  loading: false,
  connecting: false,
  initializing: false,
  error: null,
  amount: "",
  mode: "rusd",
  formError: null,
  success: null,
  txPhase: null,
  txHash: null,
  txError: null,
  copied: false,
  welcome: false,
  walletApi: null,
  marketApi: null,
  lastSigner: null,
};

let renderQueued = false;

function fmt(value, decimals = 8, maxFraction = 4) {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = (value % base).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

function parseAmount(value, decimals = 8) {
  const clean = String(value).trim();
  if (!clean || Number.isNaN(Number(clean))) throw new Error("Invalid amount");
  const [whole, fraction = ""] = clean.split(".");
  const frac = (fraction + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0");
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

const TX_PHASE_LABELS = {
  preparing: "Preparing transaction...",
  signing: "Confirm in your wallet...",
  confirming: "Confirming on CKB...",
  committed: "Transaction confirmed",
};

function txPhaseLabel() {
  return TX_PHASE_LABELS[state.txPhase] || "Working...";
}

function submitContent(label, iconName = "") {
  if (state.loading) {
    return `${icon("loader-2", "h-4 w-4 mr-2 animate-spin")}${txPhaseLabel()}`;
  }
  return iconName ? `${icon(iconName, "h-4 w-4 mr-2")}${label}` : label;
}

function shortHash(hash) {
  return hash ? `${hash.slice(0, 14)}...${hash.slice(-8)}` : "";
}

function txStatusHtml() {
  if (state.txError) {
    return `<div role="alert" class="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-start gap-3 p-3 rounded-lg border shadow-lg max-w-md w-[90%] bg-red-900/30 border-red-700/60 text-red-100">
      ${icon("circle-x", "h-5 w-5 text-red-400 shrink-0 mt-0.5")}
      <div class="flex-1 text-sm">
        <div class="font-medium">Transaction failed</div>
        <div class="text-xs text-red-200/80 break-words">${esc(state.txError)}</div>
      </div>
      <button data-action="dismiss-tx" class="text-red-300 hover:text-white">${icon("x", "h-4 w-4")}</button>
    </div>`;
  }
  if (!state.loading) return "";
  const waiting = state.txPhase === "signing";
  const confirming = state.txPhase === "confirming";
  return `<div role="status" aria-live="polite" class="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-start gap-3 p-3 rounded-lg border shadow-lg max-w-md w-[90%] ${
    waiting ? "bg-amber-900/30 border-amber-700/60 text-amber-100" : confirming ? "bg-blue-900/30 border-blue-700/60 text-blue-100" : "bg-[#252836] border-[#2a2d36] text-white"
  }">
    ${icon("loader-2", `h-5 w-5 animate-spin shrink-0 mt-0.5 ${waiting ? "text-amber-400" : confirming ? "text-blue-400" : "text-gray-300"}`)}
    <div class="flex-1 min-w-0">
      <div class="text-sm font-medium">${txPhaseLabel()}</div>
      <div class="text-xs opacity-75">${
        waiting
          ? "Approve the transaction in the wallet popup."
          : confirming
            ? `Waiting for CKB confirmation${state.txHash ? ` · ${shortHash(state.txHash)}` : ""}.`
            : "Building the CKB transaction and checking live cells."
      }</div>
    </div>
  </div>`;
}

function humanizeError(error) {
  const raw = String(error?.message || error || "Transaction failed");
  if (/error code 4/i.test(raw) && /9172f13d/i.test(raw)) {
    return "The market rejected this transaction because the oracle is stale (max age 1 hour) or the market config is invalid. Refresh the oracle and retry.";
  }
  if (/error code 8/i.test(raw) && /9172f13d/i.test(raw)) {
    return "The market rejected this transition. Check the amount, your collateral, and your health factor.";
  }
  if (/error code 13/i.test(raw) && /9172f13d/i.test(raw)) {
    return "This action is currently paused by the market.";
  }
  if (/user (rejected|denied|cancel)/i.test(raw) || /request rejected/i.test(raw)) {
    return "Transaction rejected in your wallet.";
  }
  if (/insufficient/i.test(raw)) return raw;
  if (/timed out/i.test(raw)) return "The transaction is taking longer than expected. Check the explorer before retrying.";
  return raw;
}

function scheduleTxErrorClear(message) {
  setTimeout(() => {
    if (state.txError === message) {
      state.txError = null;
      renderSoon();
    }
  }, 12000);
}

function shortAddress(address, head = 8, tail = 6) {
  return address ? `${address.slice(0, head)}...${address.slice(-tail)}` : "connected";
}

function needsInit() {
  return Boolean(state.connected && (!state.user?.account || !state.user?.position));
}

function hasStoredConnection() {
  try {
    const stored = JSON.parse(localStorage.getItem("ccc-connection-info") ?? "{}");
    return Boolean(stored.walletName && stored.signerName);
  } catch {
    return false;
  }
}

function renderSoon() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function walletHtml() {
  if (!state.connected) {
    return `<button data-action="connect" ${state.connecting ? "disabled" : ""} class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 h-9 px-3 bg-monimkt-success-600 hover:bg-monimkt-success-700 text-white">${
      state.connecting ? icon("loader-2", "h-4 w-4 mr-2 animate-spin") : icon("wallet", "h-4 w-4 mr-2")
    }${state.connecting ? "Opening wallet..." : "Connect CKB Wallet"}</button>`;
  }

  return `<div class="flex items-center gap-2">
    ${
      needsInit()
        ? `<button data-action="initialize" ${state.initializing || state.loading ? "disabled" : ""} class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 h-9 px-3 border border-monimkt-success-700/50 text-monimkt-success-200 bg-transparent hover:bg-[#252836]">${
            state.initializing ? icon("loader-2", "h-4 w-4 mr-1 animate-spin") : ""
          }Initialize</button>`
        : ""
    }
    <span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-green-900/20 border-green-700/50 text-green-400">
      <span class="w-2 h-2 bg-green-400 rounded-full mr-2"></span>CKB
    </span>
    <div class="flex items-center gap-2 bg-[#1a1d26] border border-[#2a2d36] rounded-lg px-3 py-2">
      ${icon("wallet", "h-4 w-4 text-blue-400")}
      <span class="text-sm text-white font-mono">${shortAddress(state.address)}</span>
      <button data-action="copy" class="inline-flex items-center justify-center rounded-md p-1 h-6 w-6 hover:bg-[#252836]" title="Copy address">
        ${icon(state.copied ? "check" : "copy", state.copied ? "h-3 w-3 text-green-400" : "h-3 w-3 text-gray-400")}
      </button>
      <button data-action="disconnect" class="inline-flex items-center justify-center rounded-md p-1 h-6 w-6 hover:bg-[#252836] text-gray-400 hover:text-red-400" title="Disconnect">
        ${icon("log-out", "h-3 w-3")}
      </button>
    </div>
  </div>`;
}

function networkHtml() {
  return `<div class="flex items-center justify-between rounded-xl border border-border-primary bg-bg-secondary/60 px-3 py-2 text-xs">
    <div class="flex items-center gap-2 text-text-secondary">
      ${icon("network", "h-3.5 w-3.5 text-monimkt-success-400")}
      CKB Testnet
    </div>
    <span class="inline-flex items-center rounded-full border border-border-primary px-2.5 py-0.5 text-xs font-semibold text-text-secondary">RUSD / CKB</span>
  </div>`;
}

function headerHtml() {
  if (page === "dashboard") {
    return `<div class="p-4 space-y-3">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p class="text-sm text-text-tertiary">Your DeFi position overview</p>
        </div>
        ${walletHtml()}
      </div>
      ${networkHtml()}
    </div>`;
  }

  if (page === "history") {
    return `<div class="pt-4 space-y-2 px-4">
      <div class="rounded-xl border border-border-primary bg-bg-secondary/70 backdrop-blur shadow-sm px-3 py-2 flex justify-end">${walletHtml()}</div>
      ${networkHtml()}
    </div>`;
  }

  const sticky = page === "home" ? "sticky top-0 z-20" : "";
  return `<div class="${sticky} pt-4 space-y-2">
    <div class="rounded-xl border border-border-primary bg-bg-secondary/70 backdrop-blur shadow-sm px-3 py-2 flex justify-end">${walletHtml()}</div>
    ${networkHtml()}
  </div>`;
}

const NAV_ITEMS = [
  { key: "home", label: "Home", href: "index.html", icon: "home", active: "bg-monimkt-primary-600 text-white shadow-lg monimkt-shadow-colored" },
  { key: "supply", label: "Supply", href: "supply.html", icon: "piggy-bank", active: "bg-supply text-white shadow-lg monimkt-shadow-colored" },
  { key: "withdraw", label: "Withdraw", href: "withdraw.html", icon: "arrow-up-right", active: "bg-withdraw text-white shadow-lg monimkt-shadow-colored-blue" },
  { key: "borrow", label: "Borrow", href: "borrow.html", icon: "arrow-down-right", active: "bg-borrow text-white shadow-lg" },
  { key: "repay", label: "Repay", href: "repay.html", icon: "arrow-down-left", active: "bg-repay text-white shadow-lg" },
  { key: "dashboard", label: "Dashboard", href: "dashboard.html", icon: "bar-chart-3", active: "bg-monimkt-accent-600 text-white shadow-lg monimkt-shadow-colored-purple" },
];

function navHtml() {
  return `<div class="fixed bottom-0 left-0 right-0 bg-bg-secondary/95 backdrop-blur-sm border-t border-border-primary p-2 flex justify-around max-w-md mx-auto">
    ${NAV_ITEMS.map((item) => {
      const active = state.page === item.key;
      return `<a href="${item.href}" class="flex flex-col items-center justify-center h-12 w-12 rounded-lg transition-all duration-200 ${
        active ? item.active : "text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary"
      }">${icon(item.icon, "h-4 w-4 mb-1")}<span class="text-xs font-medium">${item.label}</span></a>`;
    }).join("")}
  </div>`;
}

function button(label, action, className = "", attrs = "") {
  return `<button data-action="${action}" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 ${className}" ${attrs}>${label}</button>`;
}

function card(content, className = "") {
  return `<div class="rounded-lg border bg-card text-card-foreground shadow-sm bg-bg-secondary border-border-primary text-text-primary ${className}">${content}</div>`;
}

function stat(label, value, hint = "") {
  return `<div class="bg-bg-tertiary/60 border border-border-primary p-3 rounded-lg">
    <div class="text-xs text-text-secondary">${label}</div>
    <div class="text-lg font-semibold text-text-primary">${value}</div>
    ${hint ? `<div class="text-[10px] text-text-tertiary mt-1">${hint}</div>` : ""}
  </div>`;
}

function minimalHero() {
  const hasPosition = (state.user?.collateralCkb ?? 0n) > 0n || (state.user?.borrowedRusd ?? 0n) > 0n;
  const netWorth = (state.user?.suppliedRusd ?? 0n) + (state.user?.collateralValue ?? 0n) - (state.user?.borrowedRusd ?? 0n);
  const health = state.user?.healthFactor ?? null;

  let body;
  if (!state.connected) {
    body = `<div class="text-center py-6">
      <div class="w-16 h-16 bg-monimkt-success-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
        ${icon("wallet", "h-8 w-8 text-monimkt-success-400")}
      </div>
      <h2 class="text-xl font-semibold mb-2">Connect a CKB wallet</h2>
      <p class="text-sm text-text-tertiary mb-5">Use JoyID, OKX, or another CCC-compatible wallet on CKB testnet.</p>
      ${button("Connect Wallet", "connect", "bg-monimkt-success-600 hover:bg-monimkt-success-700 text-white")}
    </div>`;
  } else if (state.loading || !state.user) {
    body = `<div class="text-center py-10 text-text-tertiary">Loading CKB position...</div>`;
  } else {
    const action = needsInit()
      ? { title: "Initialize Account", subtitle: "Create your CKB account and position", href: "dashboard.html" }
      : !hasPosition
        ? { title: "Supply CKB", subtitle: "Use CKB as collateral", href: "supply.html" }
        : { title: "View Dashboard", subtitle: "Manage your position", href: "dashboard.html" };
    body = `<div class="space-y-5">
      <div class="text-center">
        <div class="text-3xl font-bold text-text-primary">${fmt(netWorth)} RUSD</div>
        <div class="text-text-tertiary text-sm">Net position value</div>
        <div class="mt-3 flex items-center justify-center gap-2 text-sm">
          ${icon("shield", "h-4 w-4 text-monimkt-success-400")}
          <span class="text-text-tertiary">Health:</span>
          <span class="${health == null || health >= 1.5 ? "text-green-400" : health >= 1.1 ? "text-yellow-400" : "text-red-400"}">
            ${health == null ? "No debt" : `${health.toFixed(2)}x`}
          </span>
          <span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold">${hasPosition ? "Active" : "Empty"}</span>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 text-sm">
        <div class="rounded-lg bg-bg-tertiary/60 p-3">
          <div class="text-xs text-text-tertiary">CKB collateral</div>
          <div class="font-semibold">${fmt(state.user.collateralCkb)} CKB</div>
        </div>
        <div class="rounded-lg bg-bg-tertiary/60 p-3">
          <div class="text-xs text-text-tertiary">RUSD borrowed</div>
          <div class="font-semibold">${fmt(state.user.borrowedRusd)} RUSD</div>
        </div>
        <div class="rounded-lg bg-bg-tertiary/60 p-3">
          <div class="text-xs text-text-tertiary">CKB wallet</div>
          <div class="font-semibold">${fmt(state.user.ckbBalance)} CKB</div>
        </div>
        <div class="rounded-lg bg-bg-tertiary/60 p-3">
          <div class="text-xs text-text-tertiary">RUSD wallet</div>
          <div class="font-semibold">${fmt(state.user.rusdBalance)} RUSD</div>
        </div>
      </div>

      <div class="text-xs text-text-tertiary text-center">Oracle ${state.market ? `${fmt(state.market.oracle.price, 8, 2)} RUSD/CKB` : "loading"}</div>
      <a href="${action.href}" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors w-full h-12 bg-monimkt-success-600 hover:bg-monimkt-success-700 text-white">
        ${action.title}${icon("arrow-right", "h-4 w-4 ml-2")}
      </a>
      <p class="text-center text-xs text-text-tertiary">${action.subtitle}</p>
    </div>`;
  }

  return `<div class="w-full max-w-md mx-auto px-4 pt-6 pb-4">
    <div class="rounded-lg border bg-card text-card-foreground shadow-sm bg-bg-secondary border-border-primary text-text-primary overflow-hidden relative">
      <div class="p-8">
        <div class="text-center mb-6">
          <div class="flex justify-center mb-3">
            <div class="w-12 h-12 rounded-xl bg-monimkt-success-500/15 flex items-center justify-center">
              ${icon("trending-up", "h-7 w-7 text-monimkt-success-400")}
            </div>
          </div>
          <h1 class="text-3xl font-bold bg-gradient-to-r from-monimkt-success-500 to-monimkt-success-300 bg-clip-text text-transparent mb-2">MoniMkt</h1>
          <p class="text-text-tertiary">Native CKB lending · RUSD base · CKB collateral</p>
        </div>
        ${body}
      </div>
    </div>
  </div>`;
}

function primaryActions() {
  if (!state.connected || !state.user) return "";
  const hasCollateral = state.user.collateralCkb > 0n;
  const hasDebt = state.user.borrowedRusd > 0n;
  const canSupplyCkb = state.user.ckbBalance > ONE;
  const canSupplyRusd = state.user.rusdBalance > 0n;
  const canWithdrawRusd = state.user.suppliedRusd > 0n && !hasDebt;
  const rows = [
    { show: true, title: "Supply RUSD", subtitle: canSupplyRusd ? `${fmt(state.user.rusdBalance)} RUSD available` : "No RUSD to supply", icon: "droplets", href: "supply.html", enabled: canSupplyRusd },
    { show: true, title: "Supply CKB", subtitle: canSupplyCkb ? `${fmt(state.user.ckbBalance)} CKB available` : "No spendable CKB", icon: "piggy-bank", href: "supply.html", enabled: canSupplyCkb },
    { show: true, title: "Borrow RUSD", subtitle: hasCollateral ? "Borrow against CKB" : "Supply CKB first", icon: "arrow-down-right", href: "borrow.html", enabled: hasCollateral },
    { show: canWithdrawRusd, title: "Withdraw RUSD", subtitle: `${fmt(state.user.suppliedRusd)} RUSD supplied`, icon: "droplets", href: "withdraw.html", enabled: true },
    { show: hasCollateral, title: "Withdraw CKB", subtitle: `${fmt(state.user.collateralCkb)} CKB collateral`, icon: "coins", href: "withdraw.html", enabled: true },
    { show: hasDebt, title: "Repay RUSD", subtitle: `${fmt(state.user.borrowedRusd)} RUSD debt`, icon: "arrow-down-left", href: "repay.html", enabled: true },
  ];

  return `<div class="w-full max-w-md mx-auto px-4 pb-4">
    <div class="mb-3">
      <h2 class="text-lg font-semibold text-text-primary">Quick Actions</h2>
      <p class="text-sm text-text-tertiary">CKB cell-native operations</p>
    </div>
    <div class="grid grid-cols-1 gap-3">
      ${rows
        .filter((row) => row.show)
        .map((row) => {
          const content = `<div class="p-4 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-3 rounded-xl bg-monimkt-primary-500/20">${icon(row.icon, "h-6 w-6 text-monimkt-primary-400")}</div>
              <div>
                <h3 class="font-semibold">${row.title}</h3>
                <p class="text-sm text-text-tertiary">${row.subtitle}</p>
              </div>
            </div>
            ${row.enabled ? icon("arrow-right", "h-5 w-5 text-text-tertiary") : ""}
          </div>`;
          const cls = `monimkt-card bg-bg-secondary border border-border-primary rounded-lg ${row.enabled ? "cursor-pointer hover:bg-bg-tertiary" : "opacity-50"}`;
          return row.enabled ? `<a href="${row.href}" class="${cls} block">${content}</a>` : `<div class="${cls}">${content}</div>`;
        })
        .join("")}
    </div>
  </div>`;
}

function welcomeHtml() {
  if (!state.welcome) return "";
  return `<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
    <div class="w-full max-w-md text-text-primary border border-monimkt-success-500/30 bg-gradient-to-br from-bg-secondary/90 via-bg-secondary/80 to-monimkt-success-950/40 shadow-2xl rounded-lg animate-modal-in">
      <div class="flex flex-col space-y-1.5 p-6 pb-2">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="inline-flex items-center gap-2 rounded-full bg-monimkt-success-900/50 px-3 py-1 text-xs font-semibold text-monimkt-success-200 border border-monimkt-success-700/40">
              <span class="h-2 w-2 rounded-full bg-monimkt-success-400 animate-pulse"></span>Welcome aboard
            </div>
            <div class="mt-3 text-2xl font-bold text-monimkt-success-100">MoniMkt</div>
            <div class="mt-1 text-sm text-text-tertiary">Native CKB lending with RUSD and CKB.</div>
          </div>
          <button data-action="dismiss-welcome" class="inline-flex items-center justify-center rounded-md h-10 w-10 text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary">${icon("x", "h-4 w-4")}</button>
        </div>
      </div>
      <div class="p-6 pt-0 space-y-4">
        <div class="grid grid-cols-1 gap-3 rounded-lg border border-border-primary/40 bg-bg-tertiary/50 p-3">
          <div class="text-sm font-semibold text-text-primary">What you can do</div>
          <ul class="text-sm space-y-2 text-text-secondary list-disc pl-4">
            <li>Supply CKB collateral in a native CKB cell transaction</li>
            <li>Borrow RUSD against your CKB collateral</li>
            <li>Repay or withdraw anytime, subject to market health</li>
            <li>Read live market and position state directly from CKB</li>
          </ul>
        </div>
      </div>
      <div class="flex items-center p-6 pt-0">
        <button data-action="enter-welcome" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors h-10 w-full bg-monimkt-success-500 hover:bg-monimkt-success-400 text-slate-950">Enter</button>
      </div>
    </div>
  </div>`;
}

function homePage() {
  return `<div class="rounded-2xl border border-border-primary bg-bg-secondary/60 backdrop-blur shadow-sm p-4 animate-fade-up">${minimalHero()}</div>
    <div class="rounded-2xl border border-border-primary bg-bg-secondary/60 backdrop-blur shadow-sm p-4 animate-fade-up">${primaryActions()}</div>
    ${welcomeHtml()}`;
}

function tabButton(label, iconName, active, action, activeClass) {
  return `<button data-action="${action}" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors h-10 px-4 py-2 ${
    active ? `${activeClass} text-white` : "border border-current bg-transparent hover:bg-bg-tertiary text-text-primary"
  }">${icon(iconName, "h-4 w-4 mr-2")}${label}</button>`;
}

function formSummary(label, value, rightLabel, rightValue) {
  return `<div class="rounded-lg border bg-card text-card-foreground shadow-sm bg-gradient-to-br from-green-900/20 to-blue-900/20 border-green-500/20 text-white">
    <div class="p-5 flex items-center justify-between">
      <div>
        <div class="text-xs text-gray-400">${label}</div>
        <div class="text-2xl font-bold">${value}</div>
      </div>
      <div class="text-right text-xs text-gray-400">
        <div>${rightLabel}</div>
        <div class="text-sm text-white">${rightValue}</div>
      </div>
    </div>
  </div>`;
}

function successCard(title, message, hash, color = "green") {
  const colorMap = {
    green: { border: "border-green-500/20", from: "from-green-900/20", to: "to-blue-900/20", text: "text-green-400" },
    yellow: { border: "border-yellow-500/20", from: "from-yellow-900/20", to: "to-red-900/20", text: "text-yellow-400" },
    blue: { border: "border-blue-500/20", from: "from-blue-900/20", to: "to-green-900/20", text: "text-blue-400" },
  }[color];
  return `<div class="p-4 pb-24">
    <div class="rounded-lg border bg-card shadow-sm bg-gradient-to-br ${colorMap.from} ${colorMap.to} ${colorMap.border} text-white">
      <div class="p-8 text-center">
        ${icon("check-circle", `h-14 w-14 ${colorMap.text} mx-auto mb-4`)}
        <h2 class="text-2xl font-bold ${colorMap.text} mb-2">${title}</h2>
        <p class="text-gray-300 mb-2">${esc(message)}</p>
        <p class="text-xs text-gray-500 break-all mb-6">tx ${esc(hash)}</p>
        <a href="dashboard.html" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors w-full h-10 px-4 py-2 bg-transparent text-white">Go to Dashboard</a>
      </div>
    </div>
  </div>`;
}

function supplyPage() {
  if (state.success) {
    return successCard(
      "Supply successful",
      `${state.success.amount} ${state.success.mode === "rusd" ? "RUSD" : "CKB"} supplied to MoniMkt.`,
      state.success.hash,
    );
  }

  const maxCkb = (state.user?.ckbBalance ?? 0n) > RESERVE ? (state.user.ckbBalance ?? 0n) - RESERVE : 0n;
  const maxRusd = state.user?.rusdBalance ?? 0n;
  const max = state.mode === "rusd" ? maxRusd : maxCkb;
  const marketRates = state.market && state.marketApi ? state.marketApi.rates(state.market) : null;
  const disabled = !state.connected || state.loading || !state.amount;

  return `<div class="p-4 pb-24 space-y-4 animate-fade-up">
    <div class="grid grid-cols-2 gap-2">
      ${tabButton("Supply RUSD", "droplets", state.mode === "rusd", "supply-rusd", "bg-monimkt-success-600")}
      ${tabButton("Supply CKB", "coins", state.mode === "ckb", "supply-ckb", "bg-monimkt-primary-600")}
    </div>

    ${formSummary(
      state.mode === "rusd" ? "Supplied RUSD" : "CKB collateral",
      `${fmt(state.mode === "rusd" ? state.user?.suppliedRusd ?? 0n : state.user?.collateralCkb ?? 0n)} ${state.mode === "rusd" ? "RUSD" : "CKB"}`,
      "Wallet",
      `${fmt(state.mode === "rusd" ? state.user?.rusdBalance ?? 0n : state.user?.ckbBalance ?? 0n)} ${state.mode === "rusd" ? "RUSD" : "CKB"}`,
    )}

    <div class="rounded-lg border bg-[#1a1d26] border-[#2a2d36] text-white">
      <div class="p-5 space-y-4">
        <div>
          <h2 class="text-lg font-semibold">${state.mode === "rusd" ? "Supply RUSD (base asset)" : "Supply CKB (collateral)"}</h2>
          <p class="text-sm text-gray-400">${
            state.mode === "rusd"
              ? "Lend RUSD to the market and earn supply interest. This does not create borrowing power."
              : "Deposit CKB as collateral. Collateral unlocks RUSD borrowing but does not earn RUSD supply interest."
          }</p>
        </div>
        <div class="flex justify-between text-xs text-gray-400">
          <span>Wallet: ${fmt(max)} ${state.mode === "rusd" ? "RUSD" : "CKB"}</span>
          <button data-action="max" class="text-blue-400">MAX</button>
        </div>
        <input data-field="amount" type="number" placeholder="0.0" value="${esc(state.amount)}" class="flex h-14 w-full rounded-md border border-[#2a2d36] bg-[#252836] px-3 py-2 text-lg text-white placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <div class="rounded-lg bg-[#252836] border border-[#2a2d36] p-3 text-sm space-y-2">
          <div class="flex justify-between">
            <span class="text-gray-400">${state.mode === "rusd" ? "Supply APY" : "Collateral value"}</span>
            <span>${state.mode === "rusd" ? (marketRates ? `${marketRates.supplyApy.toFixed(2)}%` : "—") : state.market ? `${fmt(state.user?.collateralValue ?? 0n)} RUSD` : "—"}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Oracle</span>
            <span>${state.market ? `${fmt(state.market.oracle.price, 8, 2)} RUSD/CKB` : "—"}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Health</span>
            <span>${state.user?.healthFactor == null ? "No debt" : `${state.user.healthFactor.toFixed(2)}x`}</span>
          </div>
        </div>
        ${state.formError ? `<div class="text-xs text-red-400">${esc(state.formError)}</div>` : ""}
        ${button(submitContent(needsInit() ? "Initialize account" : state.mode === "rusd" ? "Supply RUSD" : "Supply CKB"), "submit-supply", "w-full h-12 bg-gradient-to-r from-green-600 to-blue-600", disabled ? "disabled" : "")}
        <p class="text-[10px] text-gray-500">CKB withdrawals need at least ${fmt(state.marketApi?.MIN_WITHDRAW_CKB ?? 6100000000n)} CKB due to cell capacity.</p>
      </div>
    </div>
  </div>`;
}

function borrowPage() {
  if (state.success) {
    return successCard("RUSD borrowed", `${state.success.amount} RUSD was sent to your CKB wallet.`, state.success.hash, "yellow");
  }
  const marketRates = state.market && state.marketApi ? state.marketApi.rates(state.market) : null;
  const remainingLimit =
    (state.user?.borrowLimit ?? 0n) > (state.user?.borrowedRusd ?? 0n)
      ? (state.user?.borrowLimit ?? 0n) - (state.user?.borrowedRusd ?? 0n)
      : 0n;
  const maxBorrow = remainingLimit < (state.market?.state.totalCash ?? 0n) ? remainingLimit : state.market?.state.totalCash ?? 0n;
  const disabled = !state.connected || state.loading || !state.amount;

  return `<div class="p-4 pb-24 space-y-4 animate-fade-up">
    <div class="rounded-lg border bg-card shadow-sm bg-gradient-to-r from-yellow-800/30 to-red-800/30 border-yellow-500/20 text-white">
      <div class="p-5 grid grid-cols-2 gap-4">
        <div><div class="text-xs text-gray-300">CKB collateral</div><div class="text-2xl font-bold">${fmt(state.user?.collateralCkb ?? 0n)} CKB</div></div>
        <div class="text-right"><div class="text-xs text-gray-300">Borrow limit</div><div class="text-2xl font-bold text-yellow-300">${fmt(state.user?.borrowLimit ?? 0n)} RUSD</div></div>
        <div><div class="text-xs text-gray-300">Current debt</div><div class="text-lg font-semibold">${fmt(state.user?.borrowedRusd ?? 0n)} RUSD</div></div>
        <div class="text-right"><div class="text-xs text-gray-300">Health</div><div class="text-lg font-semibold">${state.user?.healthFactor == null ? "No debt" : `${state.user.healthFactor.toFixed(2)}x`}</div></div>
      </div>
    </div>

    <div class="rounded-lg border bg-[#1a1d26] border-[#2a2d36] text-white">
      <div class="p-5 space-y-4">
        <div><h2 class="text-lg font-semibold">Borrow RUSD</h2><p class="text-sm text-gray-400">Borrow RUSD against your CKB collateral.</p></div>
        <div class="flex justify-between text-xs text-gray-400">
          <span>Max: ${fmt(maxBorrow)} RUSD</span>
          <button data-action="max" class="text-blue-400">MAX</button>
        </div>
        <input data-field="amount" type="number" placeholder="0.0" value="${esc(state.amount)}" class="flex h-14 w-full rounded-md border border-[#2a2d36] bg-[#252836] px-3 py-2 text-lg text-white placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <div class="rounded-lg bg-[#252836] border border-[#2a2d36] p-3 text-sm space-y-2">
          <div class="flex justify-between"><span class="text-gray-400">Borrow APY</span><span class="text-yellow-400">${marketRates ? `${marketRates.borrowApy.toFixed(2)}%` : "—"}</span></div>
          <div class="flex justify-between"><span class="text-gray-400">Oracle</span><span>${state.market ? `${fmt(state.market.oracle.price, 8, 2)} RUSD/CKB` : "—"}</span></div>
          <div class="flex justify-between"><span class="text-gray-400">Market cash</span><span>${state.market ? `${fmt(state.market.state.totalCash)} RUSD` : "—"}</span></div>
        </div>
        ${state.formError ? `<div class="text-xs text-red-400">${esc(state.formError)}</div>` : ""}
        ${button(submitContent(needsInit() ? "Initialize account" : "Borrow RUSD", "arrow-down-right"), "submit-borrow", "w-full h-12 bg-gradient-to-r from-yellow-600 to-red-600", disabled ? "disabled" : "")}
      </div>
    </div>
  </div>`;
}

function repayPage() {
  if (state.success) {
    return successCard("RUSD repaid", `${state.success.amount} RUSD repaid to the market.`, state.success.hash);
  }
  const debt = state.user?.borrowedRusd ?? 0n;
  const maxRepay = debt < (state.user?.rusdBalance ?? 0n) ? debt : state.user?.rusdBalance ?? 0n;
  const disabled = !state.connected || state.loading || !state.amount || maxRepay === 0n;

  return `<div class="p-4 pb-24 space-y-4 animate-fade-up">
    <div class="rounded-lg border bg-card shadow-sm bg-gradient-to-r from-green-800/30 to-blue-800/30 border-green-500/20 text-white">
      <div class="p-5 grid grid-cols-2 gap-4">
        <div><div class="text-xs text-gray-300">RUSD debt</div><div class="text-2xl font-bold">${fmt(debt)} RUSD</div></div>
        <div class="text-right"><div class="text-xs text-gray-300">RUSD wallet</div><div class="text-2xl font-bold">${fmt(state.user?.rusdBalance ?? 0n)} RUSD</div></div>
      </div>
    </div>
    <div class="rounded-lg border bg-[#1a1d26] border-[#2a2d36] text-white">
      <div class="p-5 space-y-4">
        <div><h2 class="text-lg font-semibold">Repay RUSD</h2><p class="text-sm text-gray-400">Repay debt and improve your health factor.</p></div>
        <div class="flex justify-between text-xs text-gray-400">
          <span>Max: ${fmt(maxRepay)} RUSD</span>
          <button data-action="max" class="text-blue-400">MAX</button>
        </div>
        <input data-field="amount" type="number" placeholder="0.0" value="${esc(state.amount)}" class="flex h-14 w-full rounded-md border border-[#2a2d36] bg-[#252836] px-3 py-2 text-lg text-white placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <div class="rounded-lg bg-[#252836] border border-[#2a2d36] p-3 text-sm space-y-2">
          <div class="flex justify-between"><span class="text-gray-400">Health</span><span>${state.user?.healthFactor == null ? "No debt" : `${state.user.healthFactor.toFixed(2)}x`}</span></div>
          <div class="flex justify-between"><span class="text-gray-400">Collateral</span><span>${fmt(state.user?.collateralCkb ?? 0n)} CKB</span></div>
        </div>
        ${state.formError ? `<div class="text-xs text-red-400">${esc(state.formError)}</div>` : ""}
        ${button(submitContent(needsInit() ? "Initialize account" : "Repay RUSD", "arrow-down-left"), "submit-repay", "w-full h-12 bg-gradient-to-r from-green-600 to-blue-600", disabled ? "disabled" : "")}
      </div>
    </div>
  </div>`;
}

function withdrawPage() {
  if (state.success) {
    return successCard(
      "Withdrawal successful",
      `${state.success.amount} ${state.success.mode === "rusd" ? "RUSD" : "CKB"} returned to your wallet.`,
      state.success.hash,
      "blue",
    );
  }
  const max = state.mode === "rusd" ? state.user?.suppliedRusd ?? 0n : state.user?.collateralCkb ?? 0n;
  const rusdBlocked = state.mode === "rusd" && (state.user?.borrowedRusd ?? 0n) > 0n;
  const disabled = !state.connected || state.loading || !state.amount || rusdBlocked;

  return `<div class="p-4 pb-24 space-y-4 animate-fade-up">
    <div class="grid grid-cols-2 gap-2">
      ${tabButton("Withdraw RUSD", "droplets", state.mode === "rusd", "withdraw-rusd", "bg-monimkt-success-600")}
      ${tabButton("Withdraw CKB", "coins", state.mode === "ckb", "withdraw-ckb", "bg-monimkt-primary-600")}
    </div>
    <div class="rounded-lg border bg-card shadow-sm bg-gradient-to-r from-blue-800/30 to-green-800/30 border-blue-500/20 text-white">
      <div class="p-5 grid grid-cols-2 gap-4">
        <div><div class="text-xs text-gray-300">${state.mode === "rusd" ? "Supplied RUSD" : "CKB collateral"}</div><div class="text-2xl font-bold">${fmt(max)} ${state.mode === "rusd" ? "RUSD" : "CKB"}</div></div>
        <div class="text-right"><div class="text-xs text-gray-300">Health</div><div class="text-2xl font-bold">${state.user?.healthFactor == null ? "No debt" : `${state.user.healthFactor.toFixed(2)}x`}</div></div>
      </div>
    </div>
    <div class="rounded-lg border bg-[#1a1d26] border-[#2a2d36] text-white">
      <div class="p-5 space-y-4">
        <div>
          <h2 class="text-lg font-semibold">${state.mode === "rusd" ? "Withdraw RUSD supply" : "Withdraw CKB collateral"}</h2>
          <p class="text-sm text-gray-400">${state.mode === "rusd" ? "Withdraw supplied base asset plus accrued interest. Debt must be repaid first." : "Remove collateral. The market rejects withdrawals that would make the position unsafe."}</p>
        </div>
        <div class="flex justify-between text-xs text-gray-400">
          <span>Max: ${fmt(max)} ${state.mode === "rusd" ? "RUSD" : "CKB"}</span>
          <button data-action="max" class="text-blue-400">MAX</button>
        </div>
        <input data-field="amount" type="number" placeholder="0.0" value="${esc(state.amount)}" class="flex h-14 w-full rounded-md border border-[#2a2d36] bg-[#252836] px-3 py-2 text-lg text-white placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <div class="rounded-lg bg-[#252836] border border-[#2a2d36] p-3 text-sm space-y-2">
          <div class="flex justify-between"><span class="text-gray-400">Oracle</span><span>${state.market ? `${fmt(state.market.oracle.price, 8, 2)} RUSD/CKB` : "—"}</span></div>
          <div class="flex justify-between"><span class="text-gray-400">Debt</span><span>${fmt(state.user?.borrowedRusd ?? 0n)} RUSD</span></div>
          ${state.mode === "rusd" ? `<div class="flex justify-between"><span class="text-gray-400">RUSD wallet</span><span>${fmt(state.user?.rusdBalance ?? 0n)} RUSD</span></div>` : ""}
        </div>
        ${state.formError ? `<div class="text-xs text-red-400">${esc(state.formError)}</div>` : ""}
        ${rusdBlocked ? `<div class="text-xs text-yellow-400">Repay your RUSD debt before withdrawing RUSD supply.</div>` : ""}
        ${button(submitContent(needsInit() ? "Initialize account" : state.mode === "rusd" ? "Withdraw RUSD" : "Withdraw CKB"), "submit-withdraw", "w-full h-12 bg-gradient-to-r from-blue-600 to-green-600", disabled ? "disabled" : "")}
      </div>
    </div>
  </div>`;
}

function dashboardPage() {
  const marketRates = state.market && state.marketApi ? state.marketApi.rates(state.market) : null;
  const health = state.user?.healthFactor;
  return `<div class="p-2 pb-24 space-y-3 animate-fade-up">
    <div class="rounded-lg border bg-card shadow-sm bg-bg-secondary border-border-primary text-text-primary">
      <div class="flex flex-col space-y-1.5 p-6 pb-2">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-xl font-semibold leading-none tracking-tight">MoniMkt</div>
            <div class="text-sm text-text-secondary">Native CKB market · RUSD base · CKB collateral</div>
          </div>
          <span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-monimkt-success-700/50 text-monimkt-success-300">v3-final</span>
        </div>
      </div>
      <div class="p-6 pt-0 space-y-3">
        ${
          !state.connected
            ? `<div class="rounded-lg border border-border-primary bg-bg-tertiary/50 p-4 text-sm text-text-secondary">Connect a CKB wallet to view your position. The market is already live on testnet.</div>`
            : needsInit()
              ? `<div class="rounded-lg border border-border-primary bg-bg-tertiary/50 p-4 space-y-3">
                  <div class="text-sm text-text-secondary">Your CKB account and position cells are not initialized yet.</div>
                  <button data-action="initialize" ${state.initializing || state.loading ? "disabled" : ""} class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 bg-transparent text-white">${state.initializing ? "Initializing..." : "Initialize account"}</button>
                </div>`
              : ""
        }
        ${state.error ? `<div class="rounded-lg border border-red-800/50 bg-red-950/30 p-3 text-xs text-red-300">${esc(state.error)}</div>` : ""}
        <div class="grid grid-cols-2 gap-3">
          ${stat("Supply APY", marketRates ? `${marketRates.supplyApy.toFixed(2)}%` : "—")}
          ${stat("Borrow APY", marketRates ? `${marketRates.borrowApy.toFixed(2)}%` : "—")}
          ${stat("Utilization", marketRates ? `${marketRates.utilization.toFixed(1)}%` : "—", "present borrows / supply")}
          ${stat("Oracle", state.market ? `${fmt(state.market.oracle.price, 8, 2)} RUSD/CKB` : "—", "CKB price feed")}
        </div>
        <div class="grid grid-cols-2 gap-3">
          ${stat("Total supplied", state.market ? `${fmt(state.market.state.totalSupply)} RUSD` : "—")}
          ${stat("Total borrowed", state.market ? `${fmt(state.market.state.totalBorrow)} RUSD` : "—")}
          ${stat("Market cash", state.market ? `${fmt(state.market.state.totalCash)} RUSD` : "—")}
          ${stat("CKB reserves", state.market ? `${fmt(state.market.ckbVaultAmount)} CKB` : "—")}
        </div>
      </div>
    </div>

    ${
      state.connected && state.user && !needsInit()
        ? `<div class="rounded-lg border bg-card shadow-sm bg-bg-secondary border-border-primary text-text-primary">
            <div class="flex flex-col space-y-1.5 p-6 pb-2">
              <div class="text-lg font-semibold leading-none tracking-tight">Your position</div>
              <div class="text-sm text-text-secondary">Live from CKB cells</div>
            </div>
            <div class="p-6 pt-0 space-y-3">
              <div class="grid grid-cols-2 gap-3">
                ${stat("CKB wallet", `${fmt(state.user.ckbBalance)} CKB`)}
                ${stat("RUSD wallet", `${fmt(state.user.rusdBalance)} RUSD`)}
                ${stat("CKB collateral", `${fmt(state.user.collateralCkb)} CKB`)}
                ${stat("Collateral value", `${fmt(state.user.collateralValue)} RUSD`)}
                ${stat("Supplied", `${fmt(state.user.suppliedRusd)} RUSD`)}
                ${stat("Borrowed", `${fmt(state.user.borrowedRusd)} RUSD`)}
              </div>
              <div class="flex items-center justify-between rounded-lg border border-border-primary bg-bg-tertiary/50 p-3">
                <div class="flex items-center gap-2 text-sm">${icon("shield", "h-4 w-4 text-monimkt-success-400")}Health factor</div>
                <span class="font-semibold ${health == null || health >= 1.5 ? "text-green-400" : health >= 1.1 ? "text-yellow-400" : "text-red-400"}">${health == null ? "No debt" : `${health.toFixed(2)}x`}</span>
              </div>
              <div class="text-xs text-text-tertiary">Borrow limit: ${fmt(state.user.borrowLimit)} RUSD · Account nonce ${state.user.accountNonce} · Position nonce ${state.user.positionData.nonce}</div>
            </div>
          </div>`
        : ""
    }

    <div class="rounded-lg border bg-card shadow-sm bg-bg-secondary border-border-primary text-text-primary">
      <div class="flex flex-col space-y-1.5 p-6 pb-2"><div class="text-lg font-semibold leading-none tracking-tight">Quick actions</div></div>
      <div class="p-6 pt-0 grid grid-cols-2 gap-2">
        <a href="supply.html" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors h-10 px-4 py-2 border border-current bg-transparent hover:bg-bg-tertiary text-text-primary">${icon("droplets", "h-4 w-4 mr-2")}Supply RUSD</a>
        <a href="supply.html" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors h-10 px-4 py-2 border border-current bg-transparent hover:bg-bg-tertiary text-text-primary">${icon("coins", "h-4 w-4 mr-2")}Supply CKB</a>
        <a href="withdraw.html" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors h-10 px-4 py-2 border border-current bg-transparent hover:bg-bg-tertiary text-text-primary">${icon("wallet", "h-4 w-4 mr-2")}Withdraw RUSD</a>
        <a href="withdraw.html" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors h-10 px-4 py-2 border border-current bg-transparent hover:bg-bg-tertiary text-text-primary">${icon("coins", "h-4 w-4 mr-2")}Withdraw CKB</a>
        <a href="borrow.html" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors h-10 px-4 py-2 border border-current bg-transparent hover:bg-bg-tertiary text-text-primary">${icon("landmark", "h-4 w-4 mr-2")}Borrow RUSD</a>
        <a href="repay.html" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors h-10 px-4 py-2 border border-current bg-transparent hover:bg-bg-tertiary text-text-primary">${icon("activity", "h-4 w-4 mr-2")}Repay RUSD</a>
      </div>
    </div>

    <div class="rounded-lg border bg-card shadow-sm bg-bg-secondary border-border-primary text-text-primary">
      <div class="flex flex-col space-y-1.5 p-6 pb-2"><div class="text-sm font-semibold leading-none tracking-tight">Contract</div></div>
      <div class="p-6 pt-0 text-xs text-text-tertiary space-y-1 break-all">
        <div>Network: CKB testnet · https://testnet.ckb.dev</div>
        <div>Market: 0x70e26d96e2b61a1c8e33104ccaf066e18e1e371737b0c4871738874627ba7481</div>
        <div>Mode: CCC wallet connection · direct cell reads</div>
      </div>
    </div>
  </div>`;
}

function historyPage() {
  return `<div class="p-4 pb-24 space-y-4 animate-fade-up">
    <div class="rounded-lg border bg-card shadow-sm bg-bg-secondary border-border-primary text-text-primary">
      <div class="flex flex-col space-y-1.5 p-6"><div class="text-lg font-semibold leading-none tracking-tight">On-chain activity</div></div>
      <div class="p-6 pt-0 space-y-3 text-sm">
        <div class="rounded-lg bg-bg-tertiary/60 border border-border-primary p-3 space-y-2">
          ${historyRow("Wallet", state.address ? `${state.address.slice(0, 10)}...${state.address.slice(-8)}` : "Not connected")}
          ${historyRow("Market state cell", state.market?.cell?.outPoint?.txHash ? `${state.market.cell.outPoint.txHash.slice(0, 12)}...` : "—")}
          ${historyRow("Account nonce", String(state.user?.accountNonce ?? 0))}
          ${historyRow("Position nonce", String(state.user?.positionData?.nonce ?? 0))}
          ${historyRow("CKB collateral", state.user ? `${(Number(state.user.collateralCkb) / 1e8).toFixed(4)} CKB` : "—")}
          ${historyRow("RUSD debt", state.user ? `${(Number(state.user.borrowedRusd) / 1e8).toFixed(4)} RUSD` : "—")}
        </div>
        <p class="text-xs text-text-tertiary">MoniMkt is cell-native, so activity is a sequence of CKB transactions rather than account-based event logs. Use the CKB explorer for the full history.</p>
        ${state.address ? `<a class="text-xs text-monimkt-success-400 underline break-all" href="https://pudge.explorer.nervos.org/address/${esc(state.address)}" target="_blank" rel="noreferrer">Open ${esc(state.address)} in CKB explorer</a>` : ""}
      </div>
    </div>
  </div>`;
}

function historyRow(label, value) {
  return `<div class="flex items-center justify-between gap-3"><span class="text-text-tertiary">${label}</span><span class="font-mono text-xs text-text-primary break-all text-right">${value}</span></div>`;
}

function pageContent() {
  switch (state.page) {
    case "supply":
      return supplyPage();
    case "withdraw":
      return withdrawPage();
    case "borrow":
      return borrowPage();
    case "repay":
      return repayPage();
    case "dashboard":
      return dashboardPage();
    case "history":
      return historyPage();
    default:
      return homePage();
  }
}

function shell(content) {
  const mainClass =
    state.page === "dashboard"
      ? "flex min-h-screen flex-col items-center bg-bg-primary"
      : state.page === "history"
        ? "flex min-h-screen flex-col items-center bg-[#0d0f14]"
        : "flex min-h-screen flex-col items-center bg-gradient-to-b from-bg-primary via-bg-primary to-bg-secondary/40 text-text-primary";
  const wrapperClass =
    state.page === "dashboard"
      ? "w-full max-w-md"
      : state.page === "history"
        ? "w-full max-w-md space-y-3"
        : "w-full max-w-md px-4 pb-24 space-y-5";
  return `<main class="${mainClass}"><div class="${wrapperClass}">${headerHtml()}${content}${txStatusHtml()}${navHtml()}</div></main>`;
}

function render() {
  if (!app) return;
  const active = document.activeElement;
  const editing = active && active.matches && active.matches("[data-field='amount']");
  const selection = editing ? [active.selectionStart, active.selectionEnd] : null;
  app.innerHTML = shell(pageContent());
  if (editing) {
    const input = app.querySelector("[data-field='amount']");
    if (input) {
      input.focus();
      if (selection) input.setSelectionRange(selection[0], selection[1]);
    }
  }
}

async function ensureMarket() {
  if (!state.marketApi) state.marketApi = await import("./market.js");
  return state.marketApi;
}

async function refresh({ renderNow = true } = {}) {
  // The disconnected home screen does not display any market data. Avoid
  // downloading the CCC market chunk until the visitor connects.
  if (state.page === "home" && !state.connected && !state.market) return;
  const active = document.activeElement;
  if (active && active.matches && active.matches("[data-field='amount']")) {
    // Do not wipe out a value the user is typing. The next action refreshes.
    return;
  }
  try {
    const api = await ensureMarket();
    state.market = await api.getMarketSnapshot();
    if (state.ownerLock) {
      state.user = await api.getUserSnapshot(state.ownerLock);
    } else {
      state.user = null;
    }
    state.error = null;
  } catch (error) {
    state.error = error?.message || "Failed to load market data";
  }
  if (renderNow) renderSoon();
}

async function handleSigner(signer) {
  state.signer = signer;
  state.lastSigner = signer;
  if (!signer) {
    state.address = "";
    state.ownerLock = null;
    state.user = null;
    state.connected = false;
    state.loading = false;
    state.error = null;
    renderSoon();
    return;
  }

  state.connected = true;
  state.loading = true;
  renderSoon();
  try {
    const address = await signer.getRecommendedAddressObj();
    state.address = address.toString();
    state.ownerLock = address.script;
    await refresh({ renderNow: false });
  } catch (error) {
    state.error = error?.message || "Failed to load wallet";
  } finally {
    state.loading = false;
    renderSoon();
  }
}

async function openWallet() {
  state.connecting = true;
  state.txError = null;
  renderSoon();
  try {
    if (!state.walletApi) state.walletApi = await import("./wallet.js");
    await state.walletApi.openWallet(handleSigner);
  } catch (error) {
    const message = error?.message || "Failed to open wallet";
    state.error = message;
    state.txError = message;
    scheduleTxErrorClear(message);
  } finally {
    state.connecting = false;
    renderSoon();
  }
}

async function initializeAccount() {
  if (!state.signer) return;
  let api;
  state.initializing = true;
  state.loading = true;
  state.formError = null;
  state.txError = null;
  state.txHash = null;
  state.txPhase = "preparing";
  renderSoon();
  try {
    api = await ensureMarket();
    api.setTxProgressHandler((phase, hash) => {
      state.txPhase = phase;
      if (hash) state.txHash = hash;
      renderSoon();
    });
    await api.ensureUserCells(state.signer);
    state.formError = "Account initialized. Submit the action again.";
    state.txPhase = "committed";
    await refresh({ renderNow: false });
  } catch (error) {
    const message = humanizeError(error) || "Initialization failed";
    state.formError = message;
    state.txError = message;
    scheduleTxErrorClear(message);
  } finally {
    api?.setTxProgressHandler(undefined);
    state.initializing = false;
    state.loading = false;
    state.txPhase = null;
    state.txHash = null;
    renderSoon();
  }
}

async function runAction(fn, successMeta) {
  if (!state.signer) {
    state.formError = "Connect a wallet first";
    renderSoon();
    return;
  }
  state.formError = null;
  state.txError = null;
  state.txHash = null;
  state.txPhase = "preparing";
  state.loading = true;
  renderSoon();
  let api;
  try {
    api = await ensureMarket();
    api.setTxProgressHandler((phase, hash) => {
      state.txPhase = phase;
      if (hash) state.txHash = hash;
      renderSoon();
    });
    const hash = await fn(api, state.signer);
    state.success = { hash, ...successMeta };
    state.txPhase = "committed";
    await refresh({ renderNow: false });
  } catch (error) {
    const message = humanizeError(error) || "Transaction failed";
    state.formError = message;
    state.txError = message;
    scheduleTxErrorClear(message);
  } finally {
    api?.setTxProgressHandler(undefined);
    state.loading = false;
    state.txPhase = null;
    state.txHash = null;
    renderSoon();
  }
}

function inputValue() {
  return state.amount.trim();
}

async function submitSupply() {
  const api = await ensureMarket();
  if (needsInit()) {
    await initializeAccount();
    return;
  }
  try {
    const value = parseAmount(inputValue());
    if (value <= 0n) throw new Error("Enter a positive amount");
    const max = state.mode === "rusd" ? state.user?.rusdBalance ?? 0n : state.user?.ckbBalance ?? 0n;
    if (value > max) throw new Error(`Insufficient ${state.mode === "rusd" ? "RUSD" : "CKB"} balance`);
    const meta = { amount: inputValue(), mode: state.mode };
    await runAction((api, signer) => (state.mode === "rusd" ? api.supplyRusd(signer, value) : api.supplyCkb(signer, value)), meta);
  } catch (error) {
    state.formError = error?.message || "Supply failed";
    renderSoon();
  }
}

async function submitBorrow() {
  if (needsInit()) {
    await initializeAccount();
    return;
  }
  try {
    const value = parseAmount(inputValue());
    if (value <= 0n) throw new Error("Enter a positive amount");
    const remaining =
      (state.user?.borrowLimit ?? 0n) > (state.user?.borrowedRusd ?? 0n)
        ? (state.user?.borrowLimit ?? 0n) - (state.user?.borrowedRusd ?? 0n)
        : 0n;
    const max = remaining < (state.market?.state.totalCash ?? 0n) ? remaining : state.market?.state.totalCash ?? 0n;
    if (value > max) throw new Error("Exceeds borrow limit or available cash");
    await runAction((api, signer) => api.borrowRusd(signer, value), { amount: inputValue() });
  } catch (error) {
    state.formError = error?.message || "Borrow failed";
    renderSoon();
  }
}

async function submitRepay() {
  if (needsInit()) {
    await initializeAccount();
    return;
  }
  try {
    const value = parseAmount(inputValue());
    if (value <= 0n) throw new Error("Enter a positive amount");
    const max = (state.user?.borrowedRusd ?? 0n) < (state.user?.rusdBalance ?? 0n) ? state.user?.borrowedRusd ?? 0n : state.user?.rusdBalance ?? 0n;
    if (value > max) throw new Error("Exceeds debt or RUSD wallet balance");
    await runAction((api, signer) => api.repayRusd(signer, value), { amount: inputValue() });
  } catch (error) {
    state.formError = error?.message || "Repay failed";
    renderSoon();
  }
}

async function submitWithdraw() {
  if (needsInit()) {
    await initializeAccount();
    return;
  }
  try {
    const value = parseAmount(inputValue());
    if (value <= 0n) throw new Error("Enter a positive amount");
    if (state.mode === "ckb" && value < (state.marketApi?.MIN_WITHDRAW_CKB ?? 6100000000n)) {
      throw new Error("Minimum CKB withdrawal is 61 CKB");
    }
    const max = state.mode === "rusd" ? state.user?.suppliedRusd ?? 0n : state.user?.collateralCkb ?? 0n;
    if (value > max) throw new Error(`Insufficient ${state.mode === "rusd" ? "supplied RUSD" : "CKB collateral"}`);
    if (state.mode === "rusd" && (state.user?.borrowedRusd ?? 0n) > 0n) throw new Error("Repay RUSD debt before withdrawing RUSD supply");
    await runAction((api, signer) => (state.mode === "rusd" ? api.withdrawRusd(signer, value) : api.withdrawCkb(signer, value)), {
      amount: inputValue(),
      mode: state.mode,
    });
  } catch (error) {
    state.formError = error?.message || "Withdrawal failed";
    renderSoon();
  }
}

function maxAmount() {
  let max = 0n;
  if (state.page === "supply") {
    max =
      state.mode === "rusd"
        ? state.user?.rusdBalance ?? 0n
        : (state.user?.ckbBalance ?? 0n) > RESERVE
          ? (state.user?.ckbBalance ?? 0n) - RESERVE
          : 0n;
  } else if (state.page === "borrow") {
    const remaining =
      (state.user?.borrowLimit ?? 0n) > (state.user?.borrowedRusd ?? 0n)
        ? (state.user?.borrowLimit ?? 0n) - (state.user?.borrowedRusd ?? 0n)
        : 0n;
    max = remaining < (state.market?.state.totalCash ?? 0n) ? remaining : state.market?.state.totalCash ?? 0n;
  } else if (state.page === "repay") {
    max = (state.user?.borrowedRusd ?? 0n) < (state.user?.rusdBalance ?? 0n) ? state.user?.borrowedRusd ?? 0n : state.user?.rusdBalance ?? 0n;
  } else if (state.page === "withdraw") {
    max = state.mode === "rusd" ? state.user?.suppliedRusd ?? 0n : state.user?.collateralCkb ?? 0n;
  }
  state.amount = fmt(max, 8, 8);
  renderSoon();
}

function switchMode(mode) {
  state.mode = mode;
  state.amount = "";
  state.formError = null;
  state.success = null;
  renderSoon();
}

function syncSubmitState() {
  const submit = document.querySelector('[data-action^="submit-"]');
  if (!submit) return;
  let disabled = !state.connected || state.loading || !state.amount.trim();
  if (state.page === "withdraw" && state.mode === "rusd" && (state.user?.borrowedRusd ?? 0n) > 0n) {
    disabled = true;
  }
  if (state.page === "repay") {
    const maxRepay =
      (state.user?.borrowedRusd ?? 0n) < (state.user?.rusdBalance ?? 0n)
        ? state.user?.borrowedRusd ?? 0n
        : state.user?.rusdBalance ?? 0n;
    if (maxRepay === 0n) disabled = true;
  }
  submit.disabled = disabled;
}

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.matches("[data-field='amount']")) {
    state.amount = target.value;
    syncSubmitState();
  }
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  event.preventDefault();

  if (action === "connect") return openWallet();
  if (action === "disconnect") {
    state.walletApi?.disconnectWallet();
    return handleSigner(null);
  }
  if (action === "copy") {
    if (state.address) {
      await navigator.clipboard.writeText(state.address);
      state.copied = true;
      renderSoon();
      setTimeout(() => {
        state.copied = false;
        renderSoon();
      }, 2000);
    }
    return;
  }
  if (action === "initialize") return initializeAccount();
  if (action === "max") return maxAmount();
  if (action === "supply-rusd" || action === "supply-ckb") {
    return switchMode(action === "supply-rusd" ? "rusd" : "ckb");
  }
  if (action === "withdraw-rusd" || action === "withdraw-ckb") {
    return switchMode(action === "withdraw-rusd" ? "rusd" : "ckb");
  }
  if (action === "submit-supply") return submitSupply();
  if (action === "submit-borrow") return submitBorrow();
  if (action === "submit-repay") return submitRepay();
  if (action === "submit-withdraw") return submitWithdraw();
  if (action === "dismiss-tx") {
    state.txError = null;
    return renderSoon();
  }
  if (action === "dismiss-welcome") {
    state.welcome = false;
    return renderSoon();
  }
  if (action === "enter-welcome") {
    state.welcome = false;
    if (state.page !== "home") window.location.href = "index.html";
    else renderSoon();
  }
});

async function init() {
  if (state.page === "home") {
    try {
      if (!localStorage.getItem("monimkt_has_visited")) {
        state.welcome = true;
        localStorage.setItem("monimkt_has_visited", "true");
      }
    } catch {
      // ignore storage failures
    }
  }

  render();

  // Market data is loaded as a separate chunk after the first paint.
  refresh();

  if (hasStoredConnection()) {
    import("./wallet.js")
      .then((wallet) => {
        state.walletApi = wallet;
        return wallet.initWallet(handleSigner);
      })
      .catch((error) => {
        state.error = error?.message || "Failed to restore wallet";
        renderSoon();
      });
  }

  setInterval(() => refresh(), 15000);
}

if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  // Local debugging hook. It is not exposed on deployed hosts.
  window.__monimkt = { state, handleSigner, ensureMarket, refresh, render: renderSoon };
}

init();
