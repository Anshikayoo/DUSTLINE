import React from 'react';
import { GRENADE_SPECS, HudSnapshot, MATCH_CONSTANTS, WEAPON_SPECS, WeaponId } from '../game/types';

interface BuyMenuProps {
  hud: HudSnapshot;
  onBuy: (
    item:
      | 'usps'
      | 'mp9'
      | 'nova'
      | 'm4a4'
      | 'awp'
      | 'armor'
      | 'helmet'
      | 'kit'
      | 'smoke'
      | 'flash'
      | 'he'
  ) => void;
  onClose: () => void;
}

const WeaponSilhouette: React.FC<{ id: WeaponId }> = ({ id }) => {
  if (id === 'mp9') {
    return (
      <svg viewBox="0 0 120 38" className="w-full h-7 text-slate-300" fill="currentColor">
        <path d="M18 12h54v10H64l-4 13h-9l2-13H34l-3 10h-8l1-10H18zM72 15h14v4H72zM40 8h18v4H40z" />
      </svg>
    );
  }
  if (id === 'nova') {
    return (
      <svg viewBox="0 0 120 38" className="w-full h-7 text-slate-300" fill="currentColor">
        <path d="M8 16l22-3h74v4H62l-2 4H34l-14 8-8-3 8-7H8zM44 21h22v4H44z" />
      </svg>
    );
  }
  if (id === 'm4a4') {
    return (
      <svg viewBox="0 0 120 38" className="w-full h-7 text-slate-300" fill="currentColor">
        <path d="M8 14h18l6-2h42v4h34v3H74v4H60l4 11h-9l-5-11H38l-3 9h-8l2-9H18l-4 6H8zM42 8h18v4H42z" />
      </svg>
    );
  }
  if (id === 'awp') {
    return (
      <svg viewBox="0 0 120 38" className="w-full h-7 text-slate-300" fill="currentColor">
        <path d="M6 16h24l8-3h32v3h44v3H70v4H50l2 9h-9l-3-9H26l-10 7H6zM38 7h28v4H38zM46 11h12v2H46z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 38" className="w-full h-7 text-slate-300" fill="currentColor">
      <path d="M30 12h42v7H54l-4 13H40l4-13H30zM72 13h24v5H72z" />
    </svg>
  );
};

const StatBar: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="flex items-center gap-2 text-[11px]">
    <span className="w-12 text-slate-400">{label}</span>
    <div className="flex-1 h-1.5 bg-white/10">
      <div className="h-full bg-[#6cb8eb]" style={{ width: `${value}%` }} />
    </div>
    <span className="w-6 text-right font-mono-num text-slate-300">{value}</span>
  </div>
);

export const BuyMenu: React.FC<BuyMenuProps> = ({ hud, onBuy, onClose }) => {
  const primaries: ('mp9' | 'nova' | 'm4a4' | 'awp')[] = ['mp9', 'nova', 'm4a4', 'awp'];
  const usps = WEAPON_SPECS.usps;
  const helmetCost = hud.armor >= 100 ? 350 : MATCH_CONSTANTS.HELMET_PRICE;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-2.5 sm:p-4 safe-top safe-bottom"
      style={{ backgroundColor: 'rgba(6, 9, 14, 0.78)' }}
    >
      <div
        className="w-full max-w-4xl border border-white/15 p-3.5 sm:p-5 text-slate-100 max-h-[92dvh] overflow-y-auto"
        style={{ backgroundColor: 'rgba(13, 18, 26, 0.98)' }}
      >
        {/* Header with Money */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold tracking-wider text-white">
              TACTICAL ARMORY
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Round {hud.roundNumber} · Buy Phase closes in{' '}
              <span className="font-mono-num text-amber-400 font-semibold">
                {Math.ceil(hud.buyTimer)}s
              </span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[11px] text-slate-400">Available Funds</div>
              <div className="font-mono-num text-xl sm:text-2xl font-bold text-[#8be08b]">
                ${hud.money.toLocaleString()}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-200 border border-white/20 hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap"
            >
              Close [B]
            </button>
          </div>
        </div>

        {/* Primary Weapons Grid */}
        <div className="mt-4">
          <div className="text-xs font-semibold tracking-wider text-slate-400 mb-2">
            PRIMARY FIREARMS (SLOT 1)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {primaries.map((wid) => {
              const spec = WEAPON_SPECS[wid];
              const owned = hud.primaryWeapon?.id === wid;
              const canAfford = hud.money >= spec.price;
              return (
                <button
                  type="button"
                  key={wid}
                  onClick={() => onBuy(wid)}
                  disabled={!owned && !canAfford}
                  className={`min-h-[44px] text-left p-3 border transition-colors cursor-pointer ${
                    owned
                      ? 'border-[#6cb8eb]/70 bg-[#142334]/75'
                      : canAfford
                        ? 'border-white/15 bg-white/[0.03] hover:border-[#6cb8eb]/70 hover:bg-white/[0.06]'
                        : 'border-white/8 bg-white/[0.01] opacity-45 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] text-slate-400">{spec.category}</div>
                      <div className="font-display text-base font-bold text-white">
                        {spec.shortName}
                      </div>
                    </div>
                    <span
                      className={`font-mono-num text-sm font-bold ${
                        owned ? 'text-[#7cc4f5]' : canAfford ? 'text-[#8be08b]' : 'text-red-400'
                      }`}
                    >
                      {owned ? 'EQUIPPED' : `$${spec.price.toLocaleString()}`}
                    </span>
                  </div>

                  <div className="my-2 opacity-85">
                    <WeaponSilhouette id={wid} />
                  </div>

                  <div className="flex flex-col gap-1">
                    <StatBar label="Dmg" value={spec.stats.damage} />
                    <StatBar label="Rate" value={spec.stats.fireRate} />
                    <StatBar label="Acc" value={spec.stats.accuracy} />
                  </div>
                  <div className="mt-2 pt-2 border-t border-white/10 text-[10px] text-slate-400 flex justify-between">
                    <span>
                      {spec.magSize}/{spec.maxReserve}
                    </span>
                    <span>Kill +${spec.killReward}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Secondary, Armor & Kit */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={() => onBuy('usps')}
            disabled={hud.secondaryWeapon?.id !== 'usps' && hud.money < usps.price}
            className={`min-h-[48px] text-left p-3 border transition-colors cursor-pointer ${
              hud.secondaryWeapon?.id === 'usps'
                ? 'border-[#6cb8eb]/60 bg-[#142334]/60'
                : hud.money >= usps.price
                  ? 'border-white/15 bg-white/[0.03] hover:border-[#6cb8eb]/70'
                  : 'border-white/8 opacity-45 cursor-not-allowed'
            }`}
          >
            <div className="flex justify-between items-center gap-1">
              <span className="text-[11px] text-slate-400">Sidearm</span>
              <span className="font-mono-num text-xs font-bold text-[#8be08b]">
                {hud.secondaryWeapon?.id === 'usps' ? 'REFILL' : `$${usps.price}`}
              </span>
            </div>
            <div className="font-display text-sm font-bold text-white mt-0.5">{usps.shortName}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Suppressed · 3.5× HS</div>
          </button>

          <button
            type="button"
            onClick={() => onBuy('armor')}
            disabled={hud.armor >= 100 || hud.money < MATCH_CONSTANTS.ARMOR_PRICE}
            className={`min-h-[48px] text-left p-3 border transition-colors cursor-pointer ${
              hud.armor >= 100
                ? 'border-[#6cb8eb]/60 bg-[#142334]/60'
                : hud.money >= MATCH_CONSTANTS.ARMOR_PRICE
                  ? 'border-white/15 bg-white/[0.03] hover:border-[#6cb8eb]/70'
                  : 'border-white/8 opacity-45 cursor-not-allowed'
            }`}
          >
            <div className="flex justify-between items-center gap-1">
              <span className="text-[11px] text-slate-400">Protection</span>
              <span className="font-mono-num text-xs font-bold text-[#8be08b]">
                {hud.armor >= 100 ? 'EQUIPPED' : `$${MATCH_CONSTANTS.ARMOR_PRICE}`}
              </span>
            </div>
            <div className="font-display text-sm font-bold text-white mt-0.5">Kevlar Vest</div>
            <div className="text-[11px] text-slate-400 mt-0.5">100 Body Armor</div>
          </button>

          <button
            type="button"
            onClick={() => onBuy('helmet')}
            disabled={(hud.armor >= 100 && hud.hasHelmet) || hud.money < helmetCost}
            className={`min-h-[48px] text-left p-3 border transition-colors cursor-pointer ${
              hud.armor >= 100 && hud.hasHelmet
                ? 'border-[#6cb8eb]/60 bg-[#142334]/60'
                : hud.money >= helmetCost
                  ? 'border-white/15 bg-white/[0.03] hover:border-[#6cb8eb]/70'
                  : 'border-white/8 opacity-45 cursor-not-allowed'
            }`}
          >
            <div className="flex justify-between items-center gap-1">
              <span className="text-[11px] text-slate-400">Full Armor</span>
              <span className="font-mono-num text-xs font-bold text-[#8be08b]">
                {hud.armor >= 100 && hud.hasHelmet ? 'EQUIPPED' : `$${helmetCost}`}
              </span>
            </div>
            <div className="font-display text-sm font-bold text-white mt-0.5">Kevlar + Helmet</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Body &amp; Head Guard</div>
          </button>

          <button
            type="button"
            onClick={() => onBuy('kit')}
            disabled={
              hud.setup.side !== 'CT' ||
              hud.hasDefuseKit ||
              hud.money < MATCH_CONSTANTS.DEFUSE_KIT_PRICE
            }
            className={`min-h-[48px] text-left p-3 border transition-colors cursor-pointer ${
              hud.hasDefuseKit
                ? 'border-[#6cb8eb]/60 bg-[#142334]/60'
                : hud.setup.side === 'CT' && hud.money >= MATCH_CONSTANTS.DEFUSE_KIT_PRICE
                  ? 'border-white/15 bg-white/[0.03] hover:border-[#6cb8eb]/70'
                  : 'border-white/8 opacity-40 cursor-not-allowed'
            }`}
          >
            <div className="flex justify-between items-center gap-1">
              <span className="text-[11px] text-slate-400">CT Utility</span>
              <span className="font-mono-num text-xs font-bold text-[#8be08b]">
                {hud.setup.side !== 'CT'
                  ? 'CT ONLY'
                  : hud.hasDefuseKit
                    ? 'EQUIPPED'
                    : `$${MATCH_CONSTANTS.DEFUSE_KIT_PRICE}`}
              </span>
            </div>
            <div className="font-display text-sm font-bold text-white mt-0.5">Defuse Kit</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Defuse 5s → 3s</div>
          </button>
        </div>

        {/* Grenades */}
        <div className="mt-4">
          <div className="text-xs font-semibold tracking-wider text-slate-400 mb-2">
            TACTICAL GRENADES (KEYS 4 / 5 / 6 OR TAP)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
            {(['smoke', 'flash', 'he'] as const).map((gid) => {
              const g = GRENADE_SPECS[gid];
              const owned = hud.grenades[gid] > 0;
              const canAfford = hud.money >= g.price;
              return (
                <button
                  type="button"
                  key={gid}
                  onClick={() => onBuy(gid)}
                  disabled={owned || !canAfford}
                  className={`min-h-[48px] text-left p-3 border transition-colors cursor-pointer ${
                    owned
                      ? 'border-[#6cb8eb]/60 bg-[#142334]/60'
                      : canAfford
                        ? 'border-white/15 bg-white/[0.03] hover:border-[#6cb8eb]/70'
                        : 'border-white/8 opacity-45 cursor-not-allowed'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-mono-num text-xs font-bold text-[#7cc4f5]">[{g.key}]</span>
                    <span className="font-mono-num text-xs font-bold text-[#8be08b]">
                      {owned ? 'CARRYING' : `$${g.price}`}
                    </span>
                  </div>
                  <div className="font-display text-sm font-bold text-white mt-0.5">{g.name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{g.description}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
