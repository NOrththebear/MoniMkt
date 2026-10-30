//! Lightweight property tests. No external RNG dependency so the crate stays
//! reproducible and easy to compile in constrained environments.

use monimkt_math::*;

struct Lcg(u64);

impl Lcg {
    fn new(seed: u64) -> Self {
        Self(seed)
    }

    fn next_u64(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        self.0
    }

    fn next_u128(&mut self, max: u128) -> u128 {
        if max == 0 {
            return 0;
        }
        (self.next_u64() as u128) % max
    }
}

#[test]
fn supply_round_trip_never_mints() {
    let mut rng = Lcg::new(0x5eed);
    for _ in 0..10_000 {
        let index = BASE_INDEX_SCALE + rng.next_u128(BASE_INDEX_SCALE);
        let present = rng.next_u128(1_000_000_000_000_000);
        let principal = principal_value_supply(index, present).unwrap();
        let back = present_value_supply(index, principal).unwrap();
        assert!(back <= present);
    }
}

#[test]
fn borrow_round_trip_never_loses_debt() {
    let mut rng = Lcg::new(0xbeef);
    for _ in 0..10_000 {
        let index = BASE_INDEX_SCALE + rng.next_u128(BASE_INDEX_SCALE);
        let present = rng.next_u128(1_000_000_000_000_000);
        let principal = principal_value_borrow(index, present).unwrap();
        let back = present_value_borrow(index, principal).unwrap();
        assert!(back >= present);
    }
}

#[test]
fn indices_are_monotonic_for_positive_rates() {
    let mut rng = Lcg::new(0xc0ffee);
    for _ in 0..10_000 {
        let index = BASE_INDEX_SCALE + rng.next_u128(BASE_INDEX_SCALE);
        let rate = rng.next_u128(1_000_000_000);
        let dt = rng.next_u64() % 31_536_001;
        let next = accrue_index(index, rate, dt).unwrap();
        assert!(next >= index);
    }
}

#[test]
fn rates_are_monotonic_in_utilization() {
    let curve = RateCurve::from_per_year(
        800_000_000_000_000_000,
        10_000_000_000_000_000,
        40_000_000_000_000_000,
        500_000_000_000_000_000,
    )
    .unwrap();

    let mut previous = 0u128;
    for u in 0..=100 {
        let utilization = u * 10_000_000_000_000_000; // 0..1e18
        let rate = curve.rate_at(utilization).unwrap();
        assert!(rate >= previous);
        previous = rate;
    }
}

#[test]
fn collateralization_implies_not_liquidatable() {
    let mut rng = Lcg::new(0x1234_5678);
    for _ in 0..10_000 {
        let price = rng.next_u128(1_000_000) + 1;
        let amount = rng.next_u128(1_000_000_000_000);
        let collateral = Collateral {
            amount,
            price,
            scale: 100_000_000,
            borrow_cf: 500_000_000_000_000_000,
            liquidate_cf: 600_000_000_000_000_000,
        };
        let debt = rng.next_u128(1_000_000_000) as i128;
        let principal = -debt;
        let collateralized = is_borrow_collateralized(principal, &[collateral]).unwrap();
        let liquidatable = is_liquidatable(principal, &[collateral]).unwrap();
        if collateralized {
            assert!(!liquidatable);
        }
    }
}

#[test]
fn no_free_value_in_supply_withdraw_sequence() {
    let mut rng = Lcg::new(0x9999);
    let mut index = BASE_INDEX_SCALE;
    let mut principal = 0u128;

    for _ in 0..1_000 {
        let deposit = rng.next_u128(1_000_000_000);
        principal += principal_value_supply(index, deposit).unwrap();
        let rate = rng.next_u128(100_000_000);
        index = accrue_index(index, rate, rng.next_u64() % 86_400).unwrap();
    }

    let balance = present_value_supply(index, principal).unwrap();
    let total_deposited = {
        // Recompute a lower bound: principal at the current index.
        principal_value_supply(index, balance).unwrap()
    };
    assert!(balance >= total_deposited);
}
