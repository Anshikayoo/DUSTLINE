import React, { useState } from 'react';
import { Download, Share, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWA';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled || (!isInstallable && !isIOS)) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isInstallable) {
            void promptInstall();
          } else if (isIOS) {
            setShowIOSGuide(true);
          }
        }}
        className="flex items-center justify-center gap-2 px-3.5 min-h-[40px] text-xs font-semibold text-[#7cc4f5] border border-[#5da8dc]/45 hover:bg-[#5da8dc]/15 transition-colors cursor-pointer whitespace-nowrap"
        style={{ backgroundColor: 'rgba(13, 19, 28, 0.88)' }}
      >
        {isIOS ? <Share className="w-4 h-4 shrink-0" /> : <Download className="w-4 h-4 shrink-0" />}
        <span>{compact ? 'Install' : isIOS ? 'Add to Home Screen' : 'Install App'}</span>
      </button>

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(6, 9, 14, 0.84)' }}
        >
          <div
            className="w-full max-w-sm border border-white/15 p-5 text-slate-100"
            style={{ backgroundColor: 'rgba(13, 18, 26, 0.98)' }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-display text-base font-bold tracking-wider text-white">
                INSTALL ON IPHONE / IPAD
              </h3>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-2 text-slate-400 hover:text-white cursor-pointer"
                aria-label="Close install guide"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ol className="mt-3.5 space-y-2.5 text-xs text-slate-300 leading-relaxed">
              <li>
                1. Tap the <span className="font-semibold text-white">Share</span> button in Safari&apos;s toolbar.
              </li>
              <li>
                2. Scroll down and tap{' '}
                <span className="font-semibold text-[#7cc4f5]">Add to Home Screen</span>.
              </li>
              <li>
                3. Launch <span className="font-semibold text-white">DUSTLINE</span> full-screen from your Home Screen.
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-4 w-full py-2.5 bg-[#5da8dc] text-[#081018] font-display text-xs font-bold tracking-wider cursor-pointer"
            >
              GOT IT
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-1 text-[11px] font-medium text-amber-200 border border-amber-400/40 pointer-events-none"
      style={{ backgroundColor: 'rgba(20, 14, 8, 0.92)' }}
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span>Offline Mode — Local Bot Match Ready</span>
    </div>
  );
};
