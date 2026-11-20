# Spark Program | MoniMkt: Product Validation for a Native CKB Lending Market

## 1. Project Overview

**Project name:** MoniMkt

**One-line summary:** A native CKB lending market with RUSD as the base asset and CKB as collateral, already live on testnet, applying for a six-week product validation round with real CKB users.

**Positioning:** This is a product validation proposal, not a feature build and not a market operations request. The product already exists. The grant funds the work needed to put it in front of users, learn where the product fails them, and publish a clear next-step roadmap.

MoniMkt is the CKB equivalent of what Compound built for Ethereum: a pooled lending market where users supply, borrow, repay, and withdraw against collateral. The difference is that MoniMkt uses CKB cells directly. Market state, positions, vaults, and the oracle are cells, and the rules are enforced by CKB scripts.

The contracts, testnet deployment, oracle, and a working frontend already exist. The missing piece is product evidence: do CKB users understand the product, complete the lending loop, trust the transaction states, and come back? This proposal is designed to answer those questions with real users, not assumptions.

## 2. Team Profile

**Applicant / core developer:** North Bear, full-stack and Rust, protocol and smart-contract development.

- GitHub: https://github.com/NOrththebear/MoniMkt
- Email: capc55005@gmail.com
- Discord: northbears

I built the MoniMkt contracts, testnet deployment, frontend, and oracle keeper. I also built Bees Network, a CKB observation-layer MVP deployed on Pudge testnet, including its cell-based registry, epoch accounting, and desktop client.

## 3. Product Background

CKB has strong custody and settlement primitives, but most users still meet CKB applications through wallets, forms, and transaction prompts that assume technical knowledge. A working contract is not the same as a usable product.

MoniMkt currently supports:

- CKB wallet connection and account initialization.
- Live reads of market and position cells.
- RUSD supply and withdraw.
- CKB collateral supply and withdraw.
- RUSD borrow and repay.
- Transaction lifecycle feedback.
- Dashboard and activity views.
- A multi-source CKB/USD oracle.

The product has been exercised end to end on testnet. What we do not have is evidence from people who are not the builder:

- Can a new user understand what to do first?
- Do they understand collateral, health factor, and borrow limits?
- Do wallet-specific differences block them?
- Do they trust the transaction confirmation states?
- Which parts of the dashboard help, and which parts are noise?
- What would make them come back for a second session?

These are product questions, not feature questions. The answer will determine what we build next.

## 4. What We Are Validating

The validation round tests five product hypotheses:

1. A CKB user can connect a wallet and initialize an account without manual help.
2. A user can complete one full cycle: supply RUSD, supply CKB, borrow, repay, and withdraw.
3. The transaction lifecycle makes it clear when to confirm in the wallet, when the transaction is confirming, and when it has failed.
4. The dashboard gives a user a clear next action, not just market statistics.
5. The product explains CKB-specific concepts in language a non-technical user can repeat.

If any hypothesis fails, the report will show where, why, and what should change.

## 5. Scope

This grant funds three connected workstreams.

### A. Product surface work

The current frontend works, but it is a builder's interface. Before asking users to test it, the product surface needs a focused pass:

- One frontend state model for wallet, account, market data, position, and transaction status.
- A consistent transaction lifecycle: preparing, confirm in wallet, confirming, confirmed, rejected, and retry guidance.
- Clearer wallet onboarding and recovery for JoyID, OKX Wallet, UTXO Global, and Khie.
- Simpler supply, withdraw, borrow, and repay forms with validation and plain-language errors.
- A dashboard that leads with the user's position and next action.
- Mobile layout, typography, and accessibility improvements.
- Onboarding copy that explains the lending flow without protocol jargon.

This is not a feature expansion. It is the minimum product surface required to run a fair test.

### B. Product validation round

- A fixed four-week validation round with 15 to 20 external CKB users.
- Task scripts covering connection, initialization, supply, borrow, repay, withdraw, and recovery from expected failures.
- Wallet coverage across the CCC-supported wallets used by the product.
- Short surveys, observed task completion, and follow-up interviews.
- A weekly issue review during the test.
- A public report with actual results, not a satisfaction score alone.

### C. Product fixes and next-step report

- Fix the highest-severity usability issues found during the test.
- Re-test the fixed flows with a subset of users.
- Publish a prioritized product roadmap based on evidence.

**No contract changes.** The market scripts and state model remain unchanged.

## 6. What This Proposal Does Not Fund

This is not a request for Spark to fund:

- Smart contract development.
- Security hardening or an external audit.
- Oracle operations or keeper maintenance.
- Mainnet deployment or custody work.
- Hosted beta operations or ongoing support.
- Tester incentives.
- A token, a reward pool, or liquidity incentives.

The existing testnet infrastructure is sufficient. The grant covers product surface work, the validation round, and the report.

## 7. Execution Plan: 6 Weeks

Start on acceptance. The four-week validation round begins after a two-week product surface pass.

**Week 1: Product hypotheses and surface design**

Define the test plan, user segments, task scripts, and success metrics. Build the frontend state model and redesign the core product surfaces around the hypotheses.

Milestone: test plan approved and the new product surface is in implementation.

**Week 2: Product surface build and beta release**

Finish onboarding, wallet states, transaction states, forms, dashboard, and mobile layout. Deploy the public beta build. Prepare the feedback forms and wallet matrix.

Milestone: public beta build ready for external testers.

**Weeks 3 to 6: Four-week validation round**

Run 15 to 20 testers through the structured tasks. Collect task completion, wallet-specific issues, transaction outcomes, time to first supply, and qualitative feedback. Triage weekly, fix the highest-severity usability issues, and re-test the fixes.

Milestone: all testers have attempted the core flows; product findings are recorded and prioritized.

**Week 6 close-out**

Publish the validation report, before-and-after product notes, the prioritized roadmap, a demo video, and the completion report.

Milestone: public report and final beta build.

## 8. Required Funding and Breakdown

**Requested: USD 1,500, payable in CKB.**

**Why $1,500:** This is one product-validation project with two coupled halves. The product surface must be clear enough for a fair test, and the test needs enough users and analysis to produce trustworthy product evidence. A $1,000 budget would underfund either the product surface or the validation work. The request remains well below the $2,000 ceiling and excludes security, oracle operations, mainnet work, and ongoing support.

| Item | Amount | Use |
|---|---:|---|
| Product surface and frontend state work | $600 | State model, transaction lifecycle, onboarding, forms, dashboard, mobile, accessibility |
| Validation design, recruitment, and facilitation | $500 | Test plan, task scripts, tester recruitment, scheduling, interviews, weekly triage |
| Product fixes and re-test | $250 | Highest-severity usability fixes and a focused re-test |
| Report, demo, and completion package | $150 | Analysis, public report, demo video, docs |
| **Total** | **$1,500** | |

No tester incentives are included. All testing uses valueless testnet assets.

## 9. Deliverables and How to Verify

**Deliverables**

1. Public beta build with the new product surface and transaction states.
2. Product validation report with 15 to 20 testers, wallet coverage, task completion, transaction results, and verbatim feedback.
3. Prioritized product roadmap based on the evidence.
4. Before-and-after product notes and screenshots.
5. Demo video and a five-minute verification guide.
6. Completion report with plan versus actual and funding usage.

**How to verify without code review**

- Open the public beta URL and connect a CKB wallet.
- Initialize an account, supply RUSD, supply CKB, borrow, repay, and withdraw.
- Check that wallet confirmation, success, rejection, stale oracle, and insufficient collateral states are clear.
- Compare the before-and-after screenshots and product notes.
- Read the validation report and check the measured results.
- Open the provided testnet explorer links for the flows exercised during validation.
- Watch the demo video.

## 10. Success Metrics

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
| Product insights with supporting evidence | At least 5 |

The report will publish actual results, including misses and unresolved issues.

## 11. Current State vs Funded Work

**Already built and live on testnet**

- MoniMkt market with RUSD base asset and CKB collateral.
- 13 RISC-V scripts deployed with Type ID.
- Working supply, withdraw, borrow, repay, collateral, absorb, and discounted collateral flows.
- Static CKB frontend with CCC wallet connection and direct cell reads.
- Multi-source CKB/USD oracle keeper.
- 112 automated tests across contracts and integration scenarios.

**Funded by this grant**

- Product surface and frontend state work needed for a fair validation round.
- A four-week validation round with 15 to 20 community users.
- Product fixes, re-test, and a prioritized roadmap.
- A public report, demo, and completion package.

**Not claimed:** this grant does not improve the protocol security model, oracle operations, mainnet readiness, or custody guarantees. Those remain separate work.

## 12. Risks and Limits

- **Product surface only.** This grant will not fix contract-level or oracle-level risks. It is intentionally limited to product and usability.
- **Wallet variance.** CCC-supported wallets can behave differently. The validation round records issues per wallet rather than assuming one flow works everywhere.
- **Small sample.** 15 to 20 testers provide directional product evidence, not statistical proof.
- **Testnet conditions.** Testnet CKB has no real value, and testers may need guidance on collateral amounts at current CKB prices.
- **No ongoing operations.** The beta is a six-week project with a four-week validation window, not a permanent hosted service. After the report, the next product step is decided outside Spark.

## 13. CKB Alignment

MoniMkt is a native CKB product. The frontend reads live cells directly, uses CKB wallet signatures, and displays transaction outcomes from the cell model. It does not depend on an off-chain ledger or an account-based contract.

Validating this product is useful beyond MoniMkt. It produces evidence about how CKB users understand wallet connection, cell-backed positions, transaction confirmation, and recovery. That is directly useful to the CKB application ecosystem.

## 14. Closing

I built MoniMkt and it already works on testnet. What I want from Spark is the ability to put the product in front of real CKB users, learn where it fails them, fix the worst friction, and publish an honest product report.

This is not a request to fund market operations, security hardening, or an indefinite beta. It is a fixed six-week product validation project with a clear output: better product evidence and a prioritized path forward.
