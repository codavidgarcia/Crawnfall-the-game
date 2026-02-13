/**
 * NotificationManager — Floating notification toasts.
 * Shows at top-center, auto-fades.
 */

export class NotificationManager {
    readonly element: HTMLElement;

    constructor() {
        this.element = document.createElement('div');
        this.element.id = 'hud-notifications';
        this.element.className = 'hud-notifs';
    }

    show(text: string): void {
        const el = document.createElement('div');
        el.className = 'notif';
        el.textContent = text;
        this.element.appendChild(el);

        setTimeout(() => {
            el.classList.add('out');
            setTimeout(() => el.remove(), 400);
        }, 2000);
    }
}
