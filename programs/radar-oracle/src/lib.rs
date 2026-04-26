//! Bridge Radar — on-chain Health Score oracle.
//!
//! Single-attester model in v1 (whitepaper §4.5). Multi-attester quorum is
//! v2. dApps consume via CPI:
//!
//! ```ignore
//! let h = &ctx.accounts.bridge_health;
//! require!(Clock::get()?.unix_timestamp - h.last_updated < 600, MyErr::StaleHealth);
//! require!(h.score >= 70, MyErr::BridgeUnhealthy);
//! ```
//!
//! PDA seeds: `[b"health", bridge_id]`. `bridge_id` is the `sha256` of the
//! canonical bridge slug (e.g. `sha256("wormhole")`), so dApps can derive the
//! PDA without an off-chain lookup.

use anchor_lang::prelude::*;

declare_id!("944WKQwFt6tuDXZTEwN35mC62V3h2r1ekUtceeAyDiNC");

#[program]
pub mod radar_oracle {
    use super::*;

    /// Permissionless: anyone can register a bridge by funding its PDA.
    /// `attester` is the only key that may subsequently call `update_health`
    /// for this bridge.
    pub fn init_bridge(
        ctx: Context<InitBridge>,
        bridge_id: [u8; 32],
        attester: Pubkey,
    ) -> Result<()> {
        let h = &mut ctx.accounts.health;
        h.bridge_id = bridge_id;
        h.attester = attester;
        h.score = 0;
        h.last_updated = 0;
        h.bump = ctx.bumps.health;
        emit!(BridgeRegistered { bridge_id, attester });
        Ok(())
    }

    /// Called by the attester to push a new score. The on-chain row is the
    /// authoritative source for any dApp that gates withdrawals on bridge
    /// health.
    pub fn update_health(
        ctx: Context<UpdateHealth>,
        _bridge_id: [u8; 32],
        score: u8,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.attester.key(),
            ctx.accounts.health.attester,
            RadarError::Unauthorized
        );
        require!(score <= 100, RadarError::InvalidScore);

        let h = &mut ctx.accounts.health;
        let prev = h.score;
        h.score = score;
        h.last_updated = Clock::get()?.unix_timestamp;
        emit!(HealthUpdated {
            bridge_id: h.bridge_id,
            prev_score: prev,
            score,
            timestamp: h.last_updated,
        });
        Ok(())
    }

    /// Operator-only: rotate the attester key. Useful when the off-chain
    /// signer is migrated. Requires the *current* attester to sign.
    pub fn rotate_attester(
        ctx: Context<RotateAttester>,
        _bridge_id: [u8; 32],
        new_attester: Pubkey,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.attester.key(),
            ctx.accounts.health.attester,
            RadarError::Unauthorized
        );
        ctx.accounts.health.attester = new_attester;
        Ok(())
    }
}

#[account]
pub struct BridgeHealth {
    /// `sha256(bridge_slug)` — used as the PDA seed.
    pub bridge_id: [u8; 32],
    /// 0..=100. 0 means "no score yet."
    pub score: u8,
    /// Unix timestamp of the last `update_health`. dApps should treat scores
    /// older than ~10 minutes as stale.
    pub last_updated: i64,
    /// Only key authorized to call `update_health` and `rotate_attester`.
    pub attester: Pubkey,
    /// PDA bump seed.
    pub bump: u8,
}

impl BridgeHealth {
    pub const SIZE: usize = 32 + 1 + 8 + 32 + 1;
}

#[derive(Accounts)]
#[instruction(bridge_id: [u8; 32])]
pub struct InitBridge<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + BridgeHealth::SIZE,
        seeds = [b"health", bridge_id.as_ref()],
        bump
    )]
    pub health: Account<'info, BridgeHealth>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(bridge_id: [u8; 32])]
pub struct UpdateHealth<'info> {
    #[account(
        mut,
        seeds = [b"health", bridge_id.as_ref()],
        bump = health.bump,
    )]
    pub health: Account<'info, BridgeHealth>,
    pub attester: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(bridge_id: [u8; 32])]
pub struct RotateAttester<'info> {
    #[account(
        mut,
        seeds = [b"health", bridge_id.as_ref()],
        bump = health.bump,
    )]
    pub health: Account<'info, BridgeHealth>,
    pub attester: Signer<'info>,
}

#[event]
pub struct BridgeRegistered {
    pub bridge_id: [u8; 32],
    pub attester: Pubkey,
}

#[event]
pub struct HealthUpdated {
    pub bridge_id: [u8; 32],
    pub prev_score: u8,
    pub score: u8,
    pub timestamp: i64,
}

#[error_code]
pub enum RadarError {
    #[msg("only the registered attester can perform this action")]
    Unauthorized,
    #[msg("score must be between 0 and 100 inclusive")]
    InvalidScore,
}
