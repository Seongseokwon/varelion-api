import balance from '../../config/game-balance.json';

// Portable JSON is the contract shared with the frontend repository. Keep all
// runtime typing/coercion here so DTOs and services consume one source of truth.
export const VALID_JOB_IDS = balance.validJobIds as [string, ...string[]];
export const META_LEVEL_CAP = balance.metaLevelCap;
export const META_XP_BASE = balance.metaXp.base;
export const META_XP_POW = balance.metaXp.power;
export const MAX_XP_PER_SEC = balance.saveGrowthLimits.xpPerSecond;
export const MAX_GOLD_PER_SEC = balance.saveGrowthLimits.goldPerSecond;
export const XP_BASE_ALLOWANCE = balance.saveGrowthLimits.xpBaseAllowance;
export const GOLD_BASE_ALLOWANCE = balance.saveGrowthLimits.goldBaseAllowance;
