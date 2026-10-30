//! Test vectors modeled on index-based lending behavior, adapted to the
//! RUSD/CKB market.

use monimkt_math::*;

const RUSD: u128 = 100_000_000; // 1e8 units per RUSD
const CKB: u128 = 100_000_000; // 1e8 shannons per CKB
const RUSD_I: i128 = 100_000_000; // signed RUSD unit for debt values

#[test]
fn initial_index_makes_principal_equal_present_value() {
    let index = BASE_INDEX_SCALE;
    assert_eq!(present_value_supply(index, 100 * RUSD).unwrap(), 100 * RUSD);
    assert_eq!(present_value_borrow(index, 100 * RUSD).unwrap(), 100 * RUSD);
    assert_eq!(
        principal_value_supply(index, 100 * RUSD).unwrap(),
        100 * RUSD
    );
    assert_eq!(
        principal_value_borrow(index, 100 * RUSD).unwrap(),
        100 * RUSD
    );
}

#[test]
fn rate_curve_at_kink_is_approx_three_point_two_percent() {
    let curve = RateCurve::from_per_year(
        800_000_000_000_000_000, // 80%
        0,
        40_000_000_000_000_000,  // 4%
        500_000_000_000_000_000, // 50%
    )
    .unwrap();

    let annual = curve.annual_rate_at(800_000_000_000_000_000).unwrap();
    // At the 80% kink the 4% low slope yields ~3.2% APR. Integer division in
    // `from_per_year` leaves a tiny rounding loss.
    assert!(annual <= 32_000_000_000_000_000);
    assert!(annual > 31_900_000_000_000_000);
}

#[test]
fn one_year_accrual_increases_balance() {
    let curve = RateCurve::from_per_year(
        800_000_000_000_000_000,
        0,
        40_000_000_000_000_000,
        500_000_000_000_000_000,
    )
    .unwrap();

    let index = BASE_INDEX_SCALE;
    let rate = curve.rate_at(800_000_000_000_000_000).unwrap();
    let accrued = accrue_index(index, rate, 31_536_000).unwrap();

    let before = present_value_supply(index, 100 * RUSD).unwrap();
    let after = present_value_supply(accrued, 100 * RUSD).unwrap();
    assert!(after > before);

    // 3.2% simple interest over one year: ~103.2 RUSD.
    let growth = after - before;
    assert!(growth >= 310_000_000); // >= 3.1 RUSD
    assert!(growth <= 330_000_000); // <= 3.3 RUSD
}

#[test]
fn utilization_uses_present_values() {
    assert_eq!(
        utilization(1_000 * RUSD, 800 * RUSD).unwrap(),
        800_000_000_000_000_000
    );
    assert_eq!(utilization(0, 100 * RUSD).unwrap(), 0);
}

#[test]
fn ckb_collateral_and_borrow_boundary() {
    // 10,000 CKB at 0.0012 RUSD/CKB = 12 RUSD.
    let collateral = Collateral {
        amount: 10_000 * CKB,
        price: 120_000,
        scale: CKB,
        borrow_cf: 500_000_000_000_000_000,
        liquidate_cf: 600_000_000_000_000_000,
    };

    assert_eq!(collateral_value(&collateral).unwrap(), 12 * RUSD);

    // 50% CF => 6 RUSD borrowing capacity.
    assert!(is_borrow_collateralized(-6 * RUSD_I, &[collateral]).unwrap());
    assert!(!is_borrow_collateralized(-6 * RUSD_I - 1, &[collateral]).unwrap());

    // Liquidation threshold is 60%; 7.2 RUSD is the boundary.
    assert!(!is_liquidatable(-72 * RUSD_I / 10, &[collateral]).unwrap());
    assert!(is_liquidatable(-72 * RUSD_I / 10 - 1, &[collateral]).unwrap());
}

#[test]
fn price_drop_moves_position_from_healthy_to_liquidatable() {
    // 10,000 CKB, 6 RUSD debt.
    let healthy = Collateral {
        amount: 10_000 * CKB,
        price: 120_000, // 0.0012 RUSD/CKB
        scale: CKB,
        borrow_cf: 500_000_000_000_000_000,
        liquidate_cf: 600_000_000_000_000_000,
    };
    let crashed = Collateral {
        price: 80_000, // 0.0008 RUSD/CKB
        ..healthy
    };

    assert!(!is_liquidatable(-6 * RUSD_I, &[healthy]).unwrap());
    assert!(is_liquidatable(-6 * RUSD_I, &[crashed]).unwrap());
}

#[test]
fn absorb_residual_and_protocol_pnl() {
    // 10,000 CKB at 0.0008 = 8 RUSD; debt 6 RUSD; LF 90%; SF 50%.
    let collateral = AbsorbCollateral {
        amount: 10_000 * CKB,
        price: 80_000,
        scale: CKB,
        liquidation_factor: 900_000_000_000_000_000,
    };

    let result = absorb(-6 * RUSD_I, &[collateral]).unwrap();
    assert_eq!(result.debt, 6 * RUSD);
    assert_eq!(result.delta_value, 72 * RUSD / 10);
    assert_eq!(result.residual, 12 * RUSD / 10);
    assert_eq!(result.cost, 72 * RUSD / 10);

    let pnl = protocol_pnl(
        8 * RUSD,
        6 * RUSD,
        900_000_000_000_000_000,
        500_000_000_000_000_000,
    )
    .unwrap();
    assert_eq!(pnl, 4 * RUSD_I / 10);
}

#[test]
fn quote_collateral_sells_ckb_at_discount() {
    let out = quote_collateral(
        76 * RUSD / 10, // 7.6 RUSD
        PRICE_SCALE,
        RUSD,
        80_000, // 0.0008 RUSD/CKB
        CKB,
        900_000_000_000_000_000,
        500_000_000_000_000_000,
    )
    .unwrap();

    assert_eq!(out, 10_000 * CKB);
}

#[test]
fn borrow_round_trip_is_conservative() {
    let index = BASE_INDEX_SCALE + BASE_INDEX_SCALE / 5; // 20% growth
    let present = 100 * RUSD;
    let principal = principal_value_borrow(index, present).unwrap();
    let back = present_value_borrow(index, principal).unwrap();
    assert!(back >= present);
}

#[test]
fn supply_round_trip_is_conservative() {
    let index = BASE_INDEX_SCALE + BASE_INDEX_SCALE / 5; // 20% growth
    let present = 100 * RUSD;
    let principal = principal_value_supply(index, present).unwrap();
    let back = present_value_supply(index, principal).unwrap();
    assert!(back <= present);
}
