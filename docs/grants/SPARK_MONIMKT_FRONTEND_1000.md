# Spark Program | MoniMkt: Frontend Usability Validation for a Native CKB Lending Market

## 1. Project Overview

**Project name:** MoniMkt

**One-line summary:** A native CKB lending market with RUSD as the base asset and CKB as collateral, already live on testnet, now applying for a focused frontend usability overhaul and a four-week community validation round.

**Positioning:** The contracts and testnet infrastructure already exist. This proposal does not fund the market, the oracle, security work, or operations. It funds one bounded frontend UX pass and a structured test with real CKB users.

MoniMkt is the CKB equivalent of what Compound built for Ethereum: a pooled lending market where users supply, borrow, repay, and withdraw against collateral. The difference is that MoniMkt uses CKB cells directly. Market state, positions, vaults, and the oracle are cells, and the rules are enforced by CKB scripts.

The product works. The current frontend is functional, but it is still a builder's interface. Wallet connection, account initialization, transaction states, error recovery, and mobile flow need to be clearer for people who are not the author. This grant is for that last usability gap and for measured feedback from the CKB community.

## 2. Team Profile

**Applicant / core developer:** North Bear, full-stack and Rust, protocol and smart-contract development.

- GitHub: https://github.com/NOrththebear/MoniMkt
- Email: capc55005@gmail.com
- Discord: northbears

I built the current MoniMkt contracts, testnet deployment, frontend, and oracle keeper. I also built Bees Network, a CKB observation-layer MVP deployed on Pudge testnet, including its cell-based registry, epoch accounting, and desktop client.

## 3. Project Background

CKB has strong custody and settlement primitives, but most users still meet CKB applications through wallets, forms, and transaction prompts that assume technical knowledge. A working contract is not the same as a usable product.

The current MoniMkt frontend already supports:

- CKB wallet connection and account initialization.
- Live reads of market and position cells.
- RUSD supply and withdraw.
- CKB collateral supply and withdraw.
- RUSD borrow and repay.
- Transaction lifecycle feedback.
- Dashboard and activity views.

The gaps are usability gaps:

- The user has to understand too much before the first successful action.
- Wallet-specific behavior is not explained clearly.
- Loading, rejection, stale oracle, and insufficient collateral states are not consistent across screens.
- The dashboard presents numbers, but not a clear next action.
- Mobile layout and onboarding need a stronger pass.
- Frontend state is spread across page-level code instead of one predictable state model.

This is a frontend problem, not a protocol problem. It is suitable for a small, bounded Spark project.

## 4. Scope

This proposal funds one frontend usability overhaul and one four-week validation round.

**Frontend work**

- A single frontend state model for wallet connection, account status, market data, user position, and transaction lifecycle.
- A consistent transaction state machine: preparing, confirm in wallet, confirming, confirmed, rejected, and retry guidance.
- Clearer wallet onboarding and recovery for JoyID, OKX Wallet, UTXO Global, and Khie.
- Cleaner supply, withdraw, borrow, and repay forms with validation, maximum amounts, and plain-language errors.
- A dashboard that leads with the user's position and the next useful action, not only market statistics.
- Mobile layout, typography, spacing, and accessibility improvements.
- Onboarding copy that explains CKB cells and the lending flow without jargon.
- A short in-app feedback path for beta testers.

**Validation round**

- A fixed four-week test with 15 to 20 external CKB users.
- Structured task scripts covering wallet connection, initialization, supply, borrow, repay, withdraw, and recovery from expected failures.
- A wallet coverage matrix and per-wallet success notes.
- A short survey plus observed task completion.
- A public report with actual results, issues, and prioritized fixes.

**No contract changes.** The market scripts and state model remain unchanged.

## 5. What This Proposal Does Not Fund

This is not a request for Spark to fund:

- Smart contract development.
- Security hardening or an external audit.
- Oracle operations or keeper maintenance.
- Mainnet deployment or custody work.
- Hosted beta operations or ongoing support.
- Tester incentives.
- A token, a reward pool, or liquidity incentives.

The existing testnet infrastructure is sufficient. The grant covers only frontend usability work and the validation round.

## 6. Execution Plan: 4 Weeks

Start on acceptance. Target completion: mid-December 2026.

**Week 1: UX audit and state model**

Review the current flows, identify the highest-friction steps, define the frontend state model, and implement the core transaction lifecycle and wallet states.

Milestone: one consistent state model for wallet, account, market, position, and transaction status.

**Week 2: Frontend usability pass and beta build**

Rework onboarding, supply, withdraw, borrow, repay, dashboard, and mobile layouts. Add plain-language errors and recovery guidance. Deploy the public beta build and write the test scripts.

Milestone: a public beta build ready for external testers.

**Week 3: Structured validation**

Run 15 to 20 testers through the scripts. Track task completion, wallet-specific issues, time to first supply, transaction failures, and qualitative feedback. Fix the highest-severity usability issues.

Milestone: all testers have attempted the core flows; feedback is recorded and triaged.

**Week 4: Report and close-out**

Re-test after fixes. Publish the validation report with actual metrics, wallet notes, unresolved issues, and prioritized next steps. Record a short demo video and publish the completion report.

Milestone: public report, demo, and updated beta build.

## 7. Required Funding and Breakdown

**Requested: USD 1,000, payable in CKB.**

This is deliberately a $1,000 request. The scope is frontend usability plus a bounded validation round. It does not include contract work, security hardening, oracle operations, or long-term support.

| Item | Amount | Use |
|---|---:|---|
| Frontend UX and state management | $600 | State model, transaction lifecycle, onboarding, forms, dashboard, mobile, accessibility |
| Validation design and coordination | $200 | Test plan, task scripts, tester recruitment, scheduling, feedback collection |
| Analysis, report, and demo | $150 | Metrics, issue synthesis, public report, demo video |
| Test infrastructure and contingency | $50 | Hosting checks, test tokens, small fixes found during the round |
| **Total** | **$1,000** | |

No tester incentives are included. All testing uses valueless testnet assets.

## 8. Deliverables and How to Verify

**Deliverables**

1. Updated frontend at a public beta URL, with the new state model and transaction lifecycle.
2. Before-and-after UX notes covering the core flows.
3. Public validation report with 15 to 20 testers, wallet coverage, task completion, transaction results, and verbatim feedback.
4. Prioritized issue list with fixes and remaining limitations.
5. Demo video and a five-minute verification guide.
6. Completion report with plan versus actual and funding usage.

**How to verify without code review**

- Open the public beta URL and connect a CKB wallet.
- Initialize an account, supply RUSD, supply CKB, borrow, repay, and withdraw.
- Check that loading, wallet confirmation, success, rejection, stale oracle, and insufficient collateral states are clear.
- Compare the before-and-after screenshots and flow notes.
- Read the validation report and check the reported metrics.
- Open the provided testnet explorer links for the flows exercised during validation.
- Watch the demo video.

## 9. Success Metrics

| Metric | Target |
|---|---|
| External testers | 15 to 20 |
| Testers completing one full cycle | At least 12 |
| Wallet connection success | At least 90% per tested wallet |
| Transaction success excluding deliberate failure tests | At least 95% |
| Median time to first supply | Under 5 minutes |
| Testers who can explain the next action from the dashboard | At least 80% |
| Structured feedback responses | At least 12 |
| Critical usability blockers after fixes | 0 |

The report will publish actual results, including misses and unresolved issues.

## 10. Current State vs Funded Work

**Already built and live on testnet**

- MoniMkt market with RUSD base asset and CKB collateral.
- 13 RISC-V scripts deployed with Type ID.
- Working supply, withdraw, borrow, repay, collateral, absorb, and discounted collateral flows.
- Static CKB frontend with CCC wallet connection and direct cell reads.
- Multi-source CKB/USD oracle keeper.
- 112 automated tests across contracts and integration scenarios.

**Funded by this grant**

- Frontend state management and transaction lifecycle overhaul.
- Wallet onboarding, error recovery, mobile UX, and dashboard clarity.
- A four-week validation round with 15 to 20 community testers.
- A public report, demo, and prioritized next-step list.

**Not claimed:** this grant does not improve the protocol security model, oracle operations, mainnet readiness, or custody guarantees. Those remain separate work.

## 11. Risks and Limits

- **Frontend only.** This grant will not fix contract-level or oracle-level risks. It is intentionally limited to usability.
- **Wallet variance.** CCC-supported wallets can behave differently. The validation round records issues per wallet rather than assuming one flow works everywhere.
- **Small sample.** 15 to 20 testers provide directional feedback, not statistical proof.
- **Testnet conditions.** Testnet CKB has no real value, and testers may need guidance on collateral amounts at current CKB prices.
- **No ongoing operations.** The beta is a four-week validation round, not a permanent hosted service. After the report, the next product step is decided outside Spark.

## 12. CKB Alignment

MoniMkt is a native CKB product. The frontend reads live cells directly, uses CKB wallet signatures, and displays transaction outcomes from the cell model. It does not depend on an off-chain ledger or an account-based contract.

Improving this frontend is useful beyond MoniMkt. It produces a clearer reference for how a CKB lending product should explain wallet connection, cell-backed positions, transaction confirmation, and recovery to ordinary users.

## 13. Closing

I built MoniMkt and it already works on testnet. What I want from Spark is a focused frontend usability pass and a real four-week conversation with CKB users, not funding for market operations, security hardening, or an indefinite beta.

The output is a better frontend, a measured validation report, and a clear answer to what users actually need next.
