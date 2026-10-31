//! Batcher policy layer.
//!
//! This crate validates signed intents and produces a batch plan. It does not
//! submit transactions; a service or CLI uses it to decide what can be included
//! in one batch.

#![no_std]
#![forbid(unsafe_code)]

extern crate alloc;
#[cfg(test)]
extern crate std;

use alloc::collections::BTreeMap;
use alloc::vec::Vec;
use monimkt_schemas::{action_tag, Action};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IntentError {
    WrongMarket,
    Expired,
    DuplicateNonce,
    EmptyBatch,
    InvalidAmount,
}

/// A user-signed action.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Intent {
    pub market_id: [u8; 32],
    pub owner_lock_hash: [u8; 32],
    pub nonce: u64,
    pub expiry: u64,
    pub action: Action,
    pub max_fee: u128,
}

impl Intent {
    pub fn validate(&self, market_id: [u8; 32], now: u64) -> Result<(), IntentError> {
        if self.market_id != market_id {
            return Err(IntentError::WrongMarket);
        }
        if self.expiry <= now {
            return Err(IntentError::Expired);
        }
        if matches!(
            self.action.tag,
            action_tag::SUPPLY_BASE
                | action_tag::SUPPLY_COLLATERAL
                | action_tag::WITHDRAW_BASE
                | action_tag::WITHDRAW_COLLATERAL
                | action_tag::BORROW
                | action_tag::REPAY
        ) && self.action.amount == 0
        {
            return Err(IntentError::InvalidAmount);
        }
        Ok(())
    }
}

/// A validated batch plan.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Batch {
    pub market_id: [u8; 32],
    pub intents: Vec<Intent>,
}

impl Batch {
    pub fn new(market_id: [u8; 32], intents: Vec<Intent>, now: u64) -> Result<Self, IntentError> {
        if intents.is_empty() {
            return Err(IntentError::EmptyBatch);
        }

        let mut nonces: BTreeMap<([u8; 32], u64), ()> = BTreeMap::new();
        for intent in &intents {
            intent.validate(market_id, now)?;
            let key = (intent.owner_lock_hash, intent.nonce);
            if nonces.insert(key, ()).is_some() {
                return Err(IntentError::DuplicateNonce);
            }
        }

        Ok(Self { market_id, intents })
    }

    pub fn total_fees(&self) -> u128 {
        self.intents.iter().map(|intent| intent.max_fee).sum()
    }

    /// Net base-asset movement into the market.
    ///
    /// Positive means the market receives base (supply/repay); negative means
    /// the market pays base (withdraw/borrow).
    pub fn net_base_delta(&self) -> i128 {
        let mut delta = 0i128;
        for intent in &self.intents {
            let amount = intent.action.amount as i128;
            match intent.action.tag {
                action_tag::SUPPLY_BASE | action_tag::REPAY => delta += amount,
                action_tag::WITHDRAW_BASE | action_tag::BORROW => delta -= amount,
                _ => {}
            }
        }
        delta
    }

    pub fn count_by_tag(&self) -> BTreeMap<u8, usize> {
        let mut counts = BTreeMap::new();
        for intent in &self.intents {
            *counts.entry(intent.action.tag).or_insert(0) += 1;
        }
        counts
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloc::vec;

    const MARKET: [u8; 32] = [1u8; 32];
    const OWNER: [u8; 32] = [2u8; 32];

    fn intent(nonce: u64, amount: u128, tag: u8) -> Intent {
        Intent {
            market_id: MARKET,
            owner_lock_hash: OWNER,
            nonce,
            expiry: 200,
            action: Action {
                tag,
                amount,
                ..Default::default()
            },
            max_fee: 10,
        }
    }

    #[test]
    fn valid_batch_accepts_mixed_actions() {
        let batch = Batch::new(
            MARKET,
            vec![
                intent(1, 100, action_tag::SUPPLY_BASE),
                intent(2, 40, action_tag::BORROW),
            ],
            100,
        )
        .unwrap();
        assert_eq!(batch.net_base_delta(), 60);
        assert_eq!(batch.total_fees(), 20);
        assert_eq!(batch.count_by_tag().get(&action_tag::SUPPLY_BASE), Some(&1));
    }

    #[test]
    fn duplicate_nonce_is_rejected() {
        let result = Batch::new(
            MARKET,
            vec![
                intent(1, 100, action_tag::SUPPLY_BASE),
                intent(1, 50, action_tag::BORROW),
            ],
            100,
        );
        assert_eq!(result, Err(IntentError::DuplicateNonce));
    }

    #[test]
    fn expired_intent_is_rejected() {
        let mut intent = intent(1, 100, action_tag::SUPPLY_BASE);
        intent.expiry = 100;
        assert_eq!(
            Batch::new(MARKET, vec![intent], 100),
            Err(IntentError::Expired)
        );
    }

    #[test]
    fn wrong_market_is_rejected() {
        let mut intent = intent(1, 100, action_tag::SUPPLY_BASE);
        intent.market_id = [9u8; 32];
        assert_eq!(
            Batch::new(MARKET, vec![intent], 100),
            Err(IntentError::WrongMarket)
        );
    }

    #[test]
    fn empty_batch_is_rejected() {
        assert_eq!(
            Batch::new(MARKET, Vec::new(), 100),
            Err(IntentError::EmptyBatch)
        );
    }
}
