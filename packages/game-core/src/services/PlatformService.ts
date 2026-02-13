/**
 * PlatformService — Abstraction for platform-specific APIs.
 * game-core calls this, and the hosting app (web/mobile/desktop) provides the implementation.
 */

export interface IPlatformService {
    /** Persistent key-value storage */
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;

    /** Platform info */
    readonly platform: 'web' | 'ios' | 'android' | 'desktop';
    readonly isMobile: boolean;
    readonly isTouch: boolean;
    readonly pixelRatio: number;

    /** Haptic feedback (mobile) */
    hapticFeedback?(type: 'light' | 'medium' | 'heavy'): void;
}

/** Default web implementation */
export class WebPlatformService implements IPlatformService {
    readonly platform = 'web' as const;
    readonly isMobile: boolean;
    readonly isTouch: boolean;
    readonly pixelRatio: number;

    constructor() {
        this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        this.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        this.pixelRatio = window.devicePixelRatio ?? 1;
    }

    getItem(key: string): string | null {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }

    setItem(key: string, value: string): void {
        try {
            localStorage.setItem(key, value);
        } catch {
            console.warn('Failed to write to localStorage');
        }
    }

    removeItem(key: string): void {
        try {
            localStorage.removeItem(key);
        } catch {
            // ignore
        }
    }
}
