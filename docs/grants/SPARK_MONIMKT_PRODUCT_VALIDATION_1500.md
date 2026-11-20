# Spark Program | MoniMkt: CKB Lending Validation Toolkit and Product Field Test

## 1. Project Overview

**Project name:** MoniMkt

**One-line summary:** A reusable CKB lending validation toolkit, field-tested with real users against the MoniMkt testnet product.

**Positioning:** The primary deliverable is a standalone, reusable validation toolkit for cell-based lending markets on CKB. MoniMkt is the first reference fixture and field test, not the product being funded. This directly follows the committee’s suggestion to focus on a testing suite or validation tool without broader market operations.

MoniMkt is the CKB equivalent of what Compound built for Ethereum: a pooled lending market where users supply, borrow, repay, and withdraw against collateral. The difference is that MoniMkt uses CKB cells directly. Market state, positions, vaults, and the oracle are cells, and the rules are enforced by CKB scripts.

The market and frontend already work on testnet. What is missing is a reusable way to validate lending behavior across CKB lending products, and real product evidence from users who are not the builder. This proposal delivers both, with the toolkit as the core and MoniMkt as the first field test.

## 2. Committee Alignment

This proposal is structured around the committee’s feedback:

- The core deliverable is a **standalone validation toolkit**, not a market operations package.
- MoniMkt is one **reference fixture** and field test, not the product being funded.
- The work is **testing and validation only**.
- There is **no security hardening**, no oracle operations, no mainnet work, no custody work, and no ongoing hosted beta.
- The entire scope is one toolkit plus one bounded field test.

The product field test exists to prove the toolkit is useful in practice, not to turn Spark into an operations funder.

## 3. Team Profile

**Applicant / core developer:** North Bear, full-stack and Rust, protocol and smart-contract development.

- GitHub: https://github.com/NOrththebear/MoniMkt
- Email: capc55005@gmail.com
- Discord: northbears

I built the MoniMkt contracts, testnet deployment, frontend, and oracle keeper. I also built Bees Network, a CKB observation-layer MVP deployed on Pudge testnet, including its cell-based registry, epoch accounting, and desktop client.

## 4. Product Background

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

The product has been exercised end to end on testnet. What we do not have is:

- A reusable validation harness that other CKB lending teams can use.
- Evidence from users who are not the builder.
- A clear answer to which product surfaces help or block real users.

These are testing and product questions. They are suitable for a small Spark project.

## 5. What We Are Building

### A. Core deliverable: CKB lending validation toolkit

A standalone, open-source toolkit for validating cell-based lending markets.

**CLI and scenario format**

- A command-line runner that executes a lending scenario file.
- A small scenario format for actors, actions, expected results, and failure cases.
- Deterministic fixtures for market state, RUSD cells, CKB vaults, accounts, positions, and oracle cells.
- One-command clean run against a local devnet or `ckb-testtool`.

**Adapters**

- `ckb-testtool` adapter for script-level and transaction-level validation.
- Local devnet adapter for end-to-end flows with real wallets and RPC.
- A fixture builder that can target a new CKB lending market without rewriting the runner.

**Scenario coverage**

- Supply and withdraw base asset.
- Supply and withdraw collateral.
- Borrow and repay.
- Interest accrual and index updates.
- Liquidation, absorb, and discounted collateral purchase.
- Pause and approval behavior where supported.
- Stale oracle, insufficient collateral, wrong witness, malformed cell data, wrong action, and capacity failures.
- Token conservation and vault capacity checks.

**Assertions and reports**

- Assertions on output cells, cell data, lock and type errors, token deltas, vault deltas, nonce changes, and transaction outcomes.
- Deterministic pass or fail results.
- JSON and HTML reports with scenario names, expected outcomes, actual outcomes, and transaction hashes.
- CI templates so a project can run the suite on every push.

**Documentation**

- A short integration guide for another CKB lending project.
- A scenario authoring guide.
- A “verify in five minutes” guide.
- The MoniMkt fixture as a worked example.

### B. MoniMkt field test

MoniMkt is the first reference fixture and the first real product test.

- A fixed four-week validation round with 15 to 20 external CKB users.
- Structured tasks covering connection, initialization, supply, borrow, repay, withdraw, and recovery from expected failures.
- Wallet coverage across the CCC-supported wallets used by the product.
- Short surveys, observed task completion, and follow-up interviews.
- A weekly issue review during the test.

This is not a hosted beta operation. It is a bounded field test that produces evidence for the toolkit and for the product.

### C. Product surface work needed for a fair test

The current frontend works, but it is still a builder’s interface. Before asking users to test the product, it needs a focused product surface pass:

- A single frontend state model for wallet, account, market data, position, and transaction status.
- A consistent transaction lifecycle: preparing, confirm in wallet, confirming, confirmed, rejected, and retry guidance.
- Clearer wallet onboarding and recovery for JoyID, OKX Wallet, UTXO Global, and Khie.
- Simpler supply, withdraw, borrow, and repay forms with validation and plain-language errors.
- A dashboard that leads with the user’s position and next action.
- Mobile layout, typography, and accessibility improvements.

This is not a feature expansion. It is the minimum product surface required to run a fair test and to demonstrate the toolkit against a real product.

### D. Product fixes and report

- Fix the highest-severity usability issues found during the field test.
- Re-test the fixed flows with a subset of users.
- Publish a prioritized product roadmap based on evidence.
- Publish the toolkit’s scenario coverage, reports, and integration guide.

**No contract changes.** The MoniMkt market scripts and state model remain unchanged.

## 6. What This Proposal Does Not Fund

This is not a request for Spark to fund:

- Smart contract development.
- Security hardening or an external audit.
- Oracle operations or keeper maintenance.
- Mainnet deployment or custody work.
- Hosted beta operations or ongoing support.
- Tester incentives.
- A token, a reward pool, or liquidity incentives.

The existing testnet infrastructure is sufficient. The grant covers the toolkit, the field test, and the minimum product surface needed for that test.

## 7. Execution Plan: 6 Weeks

Start on acceptance. The four-week field test begins after a two-week build phase.

**Week 1: Toolkit foundation**

Define the scenario format, CLI, fixtures, and assertion model. Build the `ckb-testtool` adapter and the first MoniMkt scenarios. Define the product test plan and hypotheses.

Milestone: a clean local run of the first scenario set.

**Week 2: Toolkit coverage and beta build**

Add devnet adapter, failure scenarios, JSON and HTML reports, CI template, and integration docs. Finish the product surface pass, onboarding, transaction states, and beta build. Prepare the test scripts and wallet matrix.

Milestone: public beta build and a documented toolkit that runs the MoniMkt fixture.

**Weeks 3 to 6: Four-week field test**

Run 15 to 20 testers through the structured tasks. Track task completion, wallet-specific issues, transaction outcomes, time to first supply, and qualitative feedback. Triage weekly, fix the highest-severity product issues, and re-test the fixes. Use the field test to refine the toolkit’s scenarios and reports.

Milestone: all testers have attempted the core flows; toolkit and product findings are recorded and prioritized.

**Week 6 close-out**

Publish the validation report, toolkit documentation, scenario pack, before-and-after product notes, a demo video, and the completion report.

Milestone: public toolkit release and product validation report.

## 8. Required Funding and Breakdown

**Requested: USD 1,500, payable in CKB.**

**Why $1,500:** This is one validation project with two coupled outputs. The reusable toolkit is the primary deliverable, and the four-week field test proves it against a real CKB lending product. A $1,000 budget would underfund either the toolkit or the field test. The request remains below the $2,000 ceiling and excludes security, oracle operations, mainnet work, and ongoing support.

| Item | Amount | Use |
|---|---:|---|
| Validation toolkit | $600 | CLI, scenario format, fixtures, `ckb-testtool` and devnet adapters, assertions, reports, CI, docs |
| Product surface for the field test | $450 | State model, transaction lifecycle, onboarding, forms, dashboard, mobile, accessibility |
| Field test design and facilitation | $300 | Test plan, task scripts, 15 to 20 testers, scheduling, interviews, weekly triage |
| Report, demo, and completion package | $150 | Analysis, public report, demo video, docs |
| **Total** | **$1,500** | |

No tester incentives are included. All testing uses valueless testnet assets.

## 9. Deliverables and How to Verify

**Deliverables**

1. Open-source CKB lending validation toolkit with CLI, scenario format, fixtures, adapters, assertions, and reports.
2. A documented scenario pack with positive and negative lending cases.
3. MoniMkt reference fixture and a five-minute integration guide.
4. CI template and example report.
5. Public beta build with the new product surface and transaction states.
6. Product validation report with 15 to 20 testers, wallet coverage, task completion, transaction results, and verbatim feedback.
7. Prioritized product roadmap.
8. Demo video and completion report.

**How to verify without code review**

- Run the toolkit’s published command against the MoniMkt fixture and inspect the pass/fail report.
- Open the example JSON and HTML reports and confirm expected versus actual outcomes.
- Read the scenario authoring and integration guides.
- Open the public beta URL, connect a CKB wallet, and complete the core lending flow.
- Compare the before-and-after product screenshots and notes.
- Read the product validation report and check the measured results.
- Open the provided testnet explorer links for the flows exercised during validation.
- Watch the demo video.

## 10. Success Metrics

**Toolkit metrics**

| Metric | Target |
|---|---|
| Documented scenarios | At least 15 |
| Positive and negative cases | At least 8 positive, 7 negative |
| One-command clean run | Works on a clean checkout |
| Deterministic reports | Same result on repeated runs |
| External integration guide | One other CKB lending project can follow it without author help |
| CI template | Passes on a sample repository |

**Product field-test metrics**

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

## 11. Current State vs Funded Work

**Already built and live on testnet**

- MoniMkt market with RUSD base asset and CKB collateral.
- 13 RISC-V scripts deployed with Type ID.
- Working supply, withdraw, borrow, repay, collateral, absorb, and discounted collateral flows.
- Static CKB frontend with CCC wallet connection and direct cell reads.
- Multi-source CKB/USD oracle keeper.
- 112 automated tests across contracts and integration scenarios.

**Funded by this grant**

- Reusable validation toolkit and scenario pack.
- MoniMkt field test with 15 to 20 users.
- Product surface and frontend state work required for the test.
- Product fixes, re-test, and a prioritized roadmap.
- Public report, demo, and completion package.

**Not claimed:** this grant does not improve the protocol security model, oracle operations, mainnet readiness, or custody guarantees. Those remain separate work.

## 12. Risks and Limits

- **Toolkit scope.** The toolkit must stay focused on lending scenarios and avoid becoming a general-purpose chain indexer or simulator.
- **Fixture assumptions.** MoniMkt is the first fixture. The integration guide will state what another lending project must adapt.
- **Product surface only.** This grant will not fix contract-level or oracle-level risks.
- **Wallet variance.** CCC-supported wallets can behave differently. The field test records issues per wallet.
- **Small sample.** 15 to 20 testers provide directional product evidence, not statistical proof.
- **Testnet conditions.** Testnet CKB has no real value, and testers may need guidance on collateral amounts at current CKB prices.
- **No ongoing operations.** The field test is a four-week window inside a six-week project, not a permanent hosted service.

## 13. CKB Alignment

MoniMkt is a native CKB product. The frontend reads live cells directly, uses CKB wallet signatures, and displays transaction outcomes from the cell model. It does not depend on an off-chain ledger or an account-based contract.

The validation toolkit is CKB-native as well. It exercises cell transitions, type and lock scripts, token conservation, vault capacity, and transaction-level failure behavior. It gives CKB lending teams a reusable way to validate their own markets rather than rebuilding test infrastructure from scratch.

## 14. Closing

The committee asked for a standalone testing suite or validation tool. This proposal makes that the core deliverable and uses MoniMkt as the first real fixture and field test.

The output is a reusable CKB lending validation toolkit, a documented scenario pack, a public product validation report, and a clear next-step roadmap. It does not fund market operations, security hardening, oracle maintenance, mainnet work, or an indefinite beta.
