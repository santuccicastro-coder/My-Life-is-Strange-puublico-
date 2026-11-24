import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    __duofinDeferredInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

let cachedDeferredPrompt: BeforeInstallPromptEvent | null =
  typeof window !== 'undefined' ? window.__duofinDeferredInstallPrompt ?? null : null;
const promptListeners = new Set<(ev: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    const ev = e as BeforeInstallPromptEvent;
    cachedDeferredPrompt = ev;
    window.__duofinDeferredInstallPrompt = ev;
    promptListeners.forEach((cb) => cb(cachedDeferredPrompt));
  });

  window.addEventListener('appinstalled', () => {
    cachedDeferredPrompt = null;
    window.__duofinDeferredInstallPrompt = null;
    promptListeners.forEach((cb) => cb(null));
  });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () =>
      cachedDeferredPrompt ??
      (typeof window !== 'undefined' ? window.__duofinDeferredInstallPrompt ?? null : null)
  );
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const standaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
      const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
      setIsInstalled(standaloneMedia || iosStandalone);
    };

    checkStandalone();

    if (!cachedDeferredPrompt && window.__duofinDeferredInstallPrompt) {
      cachedDeferredPrompt = window.__duofinDeferredInstallPrompt;
      setDeferredPrompt(cachedDeferredPrompt);
    }

    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleMediaChange = () => checkStandalone();
    mediaQuery.addEventListener?.('change', handleMediaChange);

    const ua = navigator.userAgent;
    const isMacTouch = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const ios =
      (/iPad|iPhone|iPod/.test(ua) || isMacTouch) &&
      !(window as { MSStream?: unknown }).MSStream;
    setIsIOS(ios);

    const listener = (ev: BeforeInstallPromptEvent | null) => {
      setDeferredPrompt(ev);
    };
    promptListeners.add(listener);

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      promptListeners.delete(listener);
      mediaQuery.removeEventListener?.('change', handleMediaChange);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    const promptEvent =
      deferredPrompt ?? cachedDeferredPrompt ?? window.__duofinDeferredInstallPrompt ?? null;
    if (!promptEvent) return false;
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      cachedDeferredPrompt = null;
      window.__duofinDeferredInstallPrompt = null;
      setDeferredPrompt(null);
      return outcome === 'accepted';
    } catch {
      cachedDeferredPrompt = null;
      window.__duofinDeferredInstallPrompt = null;
      setDeferredPrompt(null);
      return false;
    }
  }, [deferredPrompt]);

  const refreshPWA = useCallback(async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => k.includes('workbox') || k.includes('duofin') || k.includes('precache'))
            .map((k) => caches.delete(k))
        );
      }
    } catch {
      // Ignore SW/Cache errors and force reload below
    }
    window.location.reload();
  }, []);

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    isInIframe,
    install,
    refreshPWA,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
