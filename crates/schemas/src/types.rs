//! Cell and action value types.
//!
//! Field order matches `schemas/market.mol`. All integers are little-endian and
//! fixed-size.

use crate::codec::{CodecError, Decode, Encode, Reader, Writer};

/// Signed principal encoded as sign + magnitude.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Principal {
    /// 1 for negative (borrow), 0 for non-negative (supply).
    pub negative: u8,
    pub magnitude: u128,
}

impl Principal {
    pub const ZERO: Self = Self {
        negative: 0,
        magnitude: 0,
    };

    pub fn from_i128(value: i128) -> Self {
        if value >= 0 {
            Self {
                negative: 0,
                magnitude: value as u128,
            }
        } else {
            Self {
                negative: 1,
                magnitude: value.unsigned_abs(),
            }
        }
    }

    pub fn to_i128(self) -> Result<i128, CodecError> {
        if self.negative == 0 {
            i128::try_from(self.magnitude).map_err(|_| CodecError::Overflow)
        } else {
            let magnitude = i128::try_from(self.magnitude).map_err(|_| CodecError::Overflow)?;
            Ok(-magnitude)
        }
    }

    pub fn is_zero(self) -> bool {
        self.magnitude == 0
    }

    pub fn is_negative(self) -> bool {
        self.negative != 0 && self.magnitude != 0
    }

    pub fn is_positive(self) -> bool {
        self.negative == 0 && self.magnitude != 0
    }
}

/// Global market state (singleton cell).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct MarketState {
    pub version: u8,
    pub market_id: [u8; 32],
    pub base_asset_id: [u8; 32],
    pub base_decimals: u8,
    pub supply_index: u128,
    pub borrow_index: u128,
    pub tracking_supply_index: u128,
    pub tracking_borrow_index: u128,
    pub total_supply_principal: u128,
    pub total_borrow_principal: u128,
    pub total_cash: u128,
    pub last_accrual_time: u64,
    pub pause_flags: u8,
    pub asset_count: u8,
    pub config_hash: [u8; 32],
    pub reserved: [u8; 32],
}

/// Market-level configuration (governance cell).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct MarketConfig {
    pub version: u8,
    pub market_id: [u8; 32],
    pub supply_kink: u64,
    pub borrow_kink: u64,
    pub supply_slope_low: u64,
    pub supply_slope_high: u64,
    pub supply_base: u64,
    pub borrow_slope_low: u64,
    pub borrow_slope_high: u64,
    pub borrow_base: u64,
    pub store_front: u64,
    pub base_borrow_min: u128,
    pub target_reserves: u128,
    pub base_min_for_rewards: u128,
    pub tracking_index_scale: u64,
    pub base_tracking_supply_speed: u64,
    pub base_tracking_borrow_speed: u64,
    pub max_oracle_age: u64,
    pub max_price_deviation: u64,
    pub reserved: [u8; 32],
}

/// Per-asset risk configuration (governance cell).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct AssetConfig {
    pub version: u8,
    pub market_id: [u8; 32],
    pub asset_id: [u8; 32],
    pub price_feed_id: [u8; 32],
    /// `asset_kind::XUDT` or `asset_kind::CKB`.
    pub kind: u8,
    pub scale: u64,
    pub borrow_cf: u64,
    pub liquidate_cf: u64,
    pub liquidation_factor: u64,
    pub supply_cap: u128,
    pub reserved: [u8; 32],
}

/// Per-asset mutable totals.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct AssetTotals {
    pub version: u8,
    pub market_id: [u8; 32],
    pub asset_id: [u8; 32],
    pub total_supplied: u128,
    pub reserved: [u8; 32],
}

/// Per-user position (market-locked cell).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct UserPosition {
    pub version: u8,
    pub market_id: [u8; 32],
    pub owner_lock_hash: [u8; 32],
    pub principal: Principal,
    pub tracking_index: u128,
    pub tracking_accrued: u64,
    pub reward_claimed: u64,
    pub nonce: u64,
    pub assets_in: u32,
    pub collateral: [u128; 8],
    pub reserved: [u8; 32],
}

/// User-owned account handle (nonce, authorization anchor).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Account {
    pub version: u8,
    pub market_id: [u8; 32],
    pub owner_lock_hash: [u8; 32],
    pub nonce: u64,
    pub flags: u8,
    pub reserved: [u8; 32],
}

/// Scoped manager capability.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Approval {
    pub version: u8,
    pub market_id: [u8; 32],
    pub owner_lock_hash: [u8; 32],
    pub manager_lock_hash: [u8; 32],
    pub permissions: u32,
    pub expiry: u64,
    pub nonce: u64,
    pub reserved: [u8; 32],
}

/// Price oracle cell.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Oracle {
    pub version: u8,
    pub asset_id: [u8; 32],
    pub price: u128,
    /// Signed decimal exponent, stored as two's-complement `i8` bits.
    pub exponent: i8,
    pub timestamp: u64,
    pub confidence: u128,
    pub publisher_set_hash: [u8; 32],
    pub reserved: [u8; 32],
}

/// Emergency pause flags.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Pause {
    pub version: u8,
    pub market_id: [u8; 32],
    pub flags: u8,
    pub updated_at: u64,
    pub reserved: [u8; 32],
}

/// Base or collateral vault state. The actual token is held in a separate
/// token cell (or native CKB capacity) controlled by the vault lock.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Vault {
    pub version: u8,
    pub market_id: [u8; 32],
    pub asset_id: [u8; 32],
    pub amount: u128,
    pub reserved: [u8; 32],
}

/// Action hint carried in the witness. Scripts must always derive the actual
/// state change from cells and verify it matches this hint.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Action {
    pub tag: u8,
    pub asset_index: u8,
    pub flags: u8,
    pub reserved0: u8,
    pub amount: u128,
    pub min_amount: u128,
    pub target: [u8; 32],
}

/// Action tags.
pub mod action_tag {
    pub const CREATE_ACCOUNT: u8 = 1;
    pub const SUPPLY_BASE: u8 = 2;
    pub const SUPPLY_COLLATERAL: u8 = 3;
    pub const WITHDRAW_BASE: u8 = 4;
    pub const WITHDRAW_COLLATERAL: u8 = 5;
    pub const BORROW: u8 = 6;
    pub const REPAY: u8 = 7;
    pub const TRANSFER_BASE: u8 = 8;
    pub const TRANSFER_COLLATERAL: u8 = 9;
    pub const ABSORB: u8 = 10;
    pub const BUY_COLLATERAL: u8 = 11;
    pub const ACCRUE: u8 = 12;
    pub const PAUSE: u8 = 13;
    pub const WITHDRAW_RESERVES: u8 = 14;
    pub const CREATE_APPROVAL: u8 = 15;
    pub const REVOKE_APPROVAL: u8 = 16;
}

/// Asset kinds.
pub mod asset_kind {
    pub const XUDT: u8 = 0;
    pub const CKB: u8 = 1;
}

/// Approval permission bits.
pub mod permission {
    pub const SUPPLY: u32 = 1 << 0;
    pub const WITHDRAW: u32 = 1 << 1;
    pub const TRANSFER: u32 = 1 << 2;
    pub const BORROW: u32 = 1 << 3;
    pub const COLLATERAL: u32 = 1 << 4;
}

/// Pause flag bits.
pub mod pause_flag {
    pub const SUPPLY: u8 = 1 << 0;
    pub const TRANSFER: u8 = 1 << 1;
    pub const WITHDRAW: u8 = 1 << 2;
    pub const ABSORB: u8 = 1 << 3;
    pub const BUY: u8 = 1 << 4;
}

macro_rules! impl_codec {
    ($ty:ty { $($field:ident),+ $(,)? }) => {
        impl Encode for $ty {
            fn encode(&self, writer: &mut Writer) {
                $(self.$field.encode(writer);)+
            }
        }

        impl Decode for $ty {
            fn decode(reader: &mut Reader<'_>) -> Result<Self, CodecError> {
                Ok(Self {
                    $($field: Decode::decode(reader)?),+
                })
            }
        }
    };
}

impl_codec!(Principal {
    negative,
    magnitude
});
impl_codec!(MarketState {
    version,
    market_id,
    base_asset_id,
    base_decimals,
    supply_index,
    borrow_index,
    tracking_supply_index,
    tracking_borrow_index,
    total_supply_principal,
    total_borrow_principal,
    total_cash,
    last_accrual_time,
    pause_flags,
    asset_count,
    config_hash,
    reserved,
});
impl_codec!(MarketConfig {
    version,
    market_id,
    supply_kink,
    borrow_kink,
    supply_slope_low,
    supply_slope_high,
    supply_base,
    borrow_slope_low,
    borrow_slope_high,
    borrow_base,
    store_front,
    base_borrow_min,
    target_reserves,
    base_min_for_rewards,
    tracking_index_scale,
    base_tracking_supply_speed,
    base_tracking_borrow_speed,
    max_oracle_age,
    max_price_deviation,
    reserved,
});
impl_codec!(AssetConfig {
    version,
    market_id,
    asset_id,
    price_feed_id,
    kind,
    scale,
    borrow_cf,
    liquidate_cf,
    liquidation_factor,
    supply_cap,
    reserved,
});
impl_codec!(AssetTotals {
    version,
    market_id,
    asset_id,
    total_supplied,
    reserved,
});
impl_codec!(UserPosition {
    version,
    market_id,
    owner_lock_hash,
    principal,
    tracking_index,
    tracking_accrued,
    reward_claimed,
    nonce,
    assets_in,
    collateral,
    reserved,
});
impl_codec!(Account {
    version,
    market_id,
    owner_lock_hash,
    nonce,
    flags,
    reserved,
});
impl_codec!(Approval {
    version,
    market_id,
    owner_lock_hash,
    manager_lock_hash,
    permissions,
    expiry,
    nonce,
    reserved,
});
impl_codec!(Oracle {
    version,
    asset_id,
    price,
    exponent,
    timestamp,
    confidence,
    publisher_set_hash,
    reserved,
});
impl_codec!(Pause {
    version,
    market_id,
    flags,
    updated_at,
    reserved,
});
impl_codec!(Vault {
    version,
    market_id,
    asset_id,
    amount,
    reserved,
});
impl_codec!(Action {
    tag,
    asset_index,
    flags,
    reserved0,
    amount,
    min_amount,
    target,
});

#[cfg(test)]
mod tests {
    use super::*;
    use alloc::vec::Vec;

    fn roundtrip<T>(value: T) -> Vec<u8>
    where
        T: Encode + Decode + PartialEq + core::fmt::Debug + Copy,
    {
        let mut writer = Writer::new();
        value.encode(&mut writer);
        let bytes = writer.into_vec();
        let mut reader = Reader::new(&bytes);
        let decoded = T::decode(&mut reader).unwrap();
        reader.finish().unwrap();
        assert_eq!(decoded, value);
        bytes
    }

    fn sample_id(byte: u8) -> [u8; 32] {
        [byte; 32]
    }

    fn sample_market_state() -> MarketState {
        MarketState {
            version: 1,
            market_id: sample_id(1),
            base_asset_id: sample_id(2),
            base_decimals: 8,
            supply_index: 1_000_000_000_000_000,
            borrow_index: 1_000_000_000_000_000,
            tracking_supply_index: 0,
            tracking_borrow_index: 0,
            total_supply_principal: 100_000_000,
            total_borrow_principal: 0,
            total_cash: 100_000_000,
            last_accrual_time: 1_700_000_000,
            pause_flags: 0,
            asset_count: 1,
            config_hash: sample_id(3),
            reserved: [0u8; 32],
        }
    }

    #[test]
    fn market_state_roundtrip_and_size() {
        let bytes = roundtrip(sample_market_state());
        assert_eq!(bytes.len(), 252);
    }

    #[test]
    fn market_config_roundtrip_and_size() {
        let value = MarketConfig {
            version: 1,
            market_id: sample_id(1),
            supply_kink: 800_000_000_000_000_000,
            borrow_kink: 800_000_000_000_000_000,
            supply_slope_low: 35_000_000_000_000_000,
            supply_slope_high: 400_000_000_000_000_000,
            supply_base: 0,
            borrow_slope_low: 40_000_000_000_000_000,
            borrow_slope_high: 500_000_000_000_000_000,
            borrow_base: 0,
            store_front: 500_000_000_000_000_000,
            base_borrow_min: 1_000_000_000,
            target_reserves: 10_000_000_000_000,
            base_min_for_rewards: 1_000_000_000_000,
            tracking_index_scale: 1_000_000_000_000_000,
            base_tracking_supply_speed: 0,
            base_tracking_borrow_speed: 0,
            max_oracle_age: 3600,
            max_price_deviation: 100_000_000_000_000_000,
            reserved: [0u8; 32],
        };
        let bytes = roundtrip(value);
        assert_eq!(bytes.len(), 225);
    }

    #[test]
    fn asset_config_roundtrip_and_size() {
        let value = AssetConfig {
            version: 1,
            market_id: sample_id(1),
            asset_id: sample_id(2),
            price_feed_id: sample_id(3),
            kind: asset_kind::CKB,
            scale: 100_000_000,
            borrow_cf: 500_000_000_000_000_000,
            liquidate_cf: 600_000_000_000_000_000,
            liquidation_factor: 900_000_000_000_000_000,
            supply_cap: 50_000_000_000_000_000,
            reserved: [0u8; 32],
        };
        let bytes = roundtrip(value);
        assert_eq!(bytes.len(), 178);
    }

    #[test]
    fn asset_totals_roundtrip_and_size() {
        let value = AssetTotals {
            version: 1,
            market_id: sample_id(1),
            asset_id: sample_id(2),
            total_supplied: 12_345,
            reserved: [0u8; 32],
        };
        let bytes = roundtrip(value);
        assert_eq!(bytes.len(), 113);
    }

    #[test]
    fn user_position_roundtrip_and_size() {
        let value = UserPosition {
            version: 1,
            market_id: sample_id(1),
            owner_lock_hash: sample_id(4),
            principal: Principal::from_i128(-600_000_000),
            tracking_index: 1_000_000_000_000_000,
            tracking_accrued: 0,
            reward_claimed: 0,
            nonce: 7,
            assets_in: 1,
            collateral: [10_000_000_000_000, 0, 0, 0, 0, 0, 0, 0],
            reserved: [0u8; 32],
        };
        let bytes = roundtrip(value);
        assert_eq!(bytes.len(), 286);
    }

    #[test]
    fn account_roundtrip_and_size() {
        let value = Account {
            version: 1,
            market_id: sample_id(1),
            owner_lock_hash: sample_id(4),
            nonce: 1,
            flags: 0,
            reserved: [0u8; 32],
        };
        let bytes = roundtrip(value);
        assert_eq!(bytes.len(), 106);
    }

    #[test]
    fn approval_roundtrip_and_size() {
        let value = Approval {
            version: 1,
            market_id: sample_id(1),
            owner_lock_hash: sample_id(4),
            manager_lock_hash: sample_id(5),
            permissions: permission::SUPPLY | permission::WITHDRAW,
            expiry: 1_700_000_000,
            nonce: 1,
            reserved: [0u8; 32],
        };
        let bytes = roundtrip(value);
        assert_eq!(bytes.len(), 149);
    }

    #[test]
    fn oracle_roundtrip_and_size() {
        let value = Oracle {
            version: 1,
            asset_id: sample_id(2),
            price: 120_000,
            exponent: -8,
            timestamp: 1_700_000_000,
            confidence: 1,
            publisher_set_hash: sample_id(6),
            reserved: [0u8; 32],
        };
        let bytes = roundtrip(value);
        assert_eq!(bytes.len(), 138);
    }

    #[test]
    fn pause_roundtrip_and_size() {
        let value = Pause {
            version: 1,
            market_id: sample_id(1),
            flags: pause_flag::SUPPLY | pause_flag::WITHDRAW,
            updated_at: 1_700_000_000,
            reserved: [0u8; 32],
        };
        let bytes = roundtrip(value);
        assert_eq!(bytes.len(), 74);
    }

    #[test]
    fn vault_roundtrip_and_size() {
        let value = Vault {
            version: 1,
            market_id: sample_id(1),
            asset_id: sample_id(2),
            amount: 100_000_000,
            reserved: [0u8; 32],
        };
        let bytes = roundtrip(value);
        assert_eq!(bytes.len(), 113);
    }

    #[test]
    fn action_roundtrip_and_size() {
        let value = Action {
            tag: action_tag::BORROW,
            asset_index: 0,
            flags: 0,
            reserved0: 0,
            amount: 600_000_000,
            min_amount: 0,
            target: [0u8; 32],
        };
        let bytes = roundtrip(value);
        assert_eq!(bytes.len(), 68);
    }

    #[test]
    fn principal_roundtrip() {
        for value in [0i128, 1, -1, 100_000_000, -100_000_000] {
            let principal = Principal::from_i128(value);
            assert_eq!(principal.to_i128().unwrap(), value);
            let bytes = roundtrip(principal);
            assert_eq!(bytes.len(), 17);
        }
    }

    #[test]
    fn truncated_data_is_rejected() {
        let mut writer = Writer::new();
        sample_market_state().encode(&mut writer);
        let bytes = writer.into_vec();
        let mut reader = Reader::new(&bytes[..bytes.len() - 1]);
        assert_eq!(
            MarketState::decode(&mut reader),
            Err(CodecError::UnexpectedEof)
        );
    }

    #[test]
    fn trailing_data_is_rejected() {
        let mut writer = Writer::new();
        sample_market_state().encode(&mut writer);
        let mut bytes = writer.into_vec();
        bytes.push(0);
        let mut reader = Reader::new(&bytes);
        MarketState::decode(&mut reader).unwrap();
        assert_eq!(reader.finish(), Err(CodecError::TrailingBytes));
    }

    #[test]
    fn empty_data_is_rejected() {
        let mut reader = Reader::new(&[]);
        assert_eq!(
            MarketState::decode(&mut reader),
            Err(CodecError::UnexpectedEof)
        );
    }
}
