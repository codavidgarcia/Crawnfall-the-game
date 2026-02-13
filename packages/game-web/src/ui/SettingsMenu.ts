/**
 * SettingsMenu — Graphics quality presets menu.
 * Toggle with Escape key.
 */

import {
  QUALITY_PRESETS,
  MOBILE_QUALITY_PRESETS,
  type QualityPreset,
} from '@crownfall/game-core';
import type { SceneManager } from '../renderer/SceneManager.js';

export class SettingsMenu {
  private overlay: HTMLElement;
  private visible = false;
  private isMobile: boolean;
  private currentPresetKey: string;
  private onPresetChange: (preset: QualityPreset) => void;

  constructor(
    parent: HTMLElement,
    private sceneManager: SceneManager,
    onPresetChange: (preset: QualityPreset) => void
  ) {
    this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    this.currentPresetKey = this.isMobile ? 'balanced' : 'high';
    this.onPresetChange = onPresetChange;

    this.overlay = document.createElement('div');
    this.overlay.id = 'settings-overlay';
    this.overlay.innerHTML = this.getTemplate();
    this.overlay.style.display = 'none';
    parent.appendChild(this.overlay);

    this.setupListeners();
  }

  private getTemplate(): string {
    const presets = this.isMobile ? MOBILE_QUALITY_PRESETS : QUALITY_PRESETS;
    const presetButtons = (Object.entries(presets) as [string, QualityPreset][])
      .map(
        ([key, p]) =>
          `<button class="settings-preset-btn ${key === this.currentPresetKey ? 'active' : ''}"
                  data-preset="${key}" id="settings-${key}">
            ${p.name}
          </button>`
      )
      .join('');

    return `
      <div class="settings-backdrop" id="settings-backdrop"></div>
      <div class="settings-panel">
        <h2 class="settings-title">Graphics Settings</h2>
        <div class="settings-section">
          <label class="settings-label">Quality Preset</label>
          <div class="settings-preset-group">${presetButtons}</div>
        </div>
        <div class="settings-section" id="settings-details">
          <div class="settings-detail"><span>Shadows:</span><span id="sd-shadows">—</span></div>
          <div class="settings-detail"><span>SSAO:</span><span id="sd-ssao">—</span></div>
          <div class="settings-detail"><span>Bloom:</span><span id="sd-bloom">—</span></div>
          <div class="settings-detail"><span>Vegetation:</span><span id="sd-veg">—</span></div>
          <div class="settings-detail"><span>Resolution:</span><span id="sd-res">—</span></div>
        </div>
        <button class="settings-close-btn" id="settings-close">Close (Esc)</button>
      </div>
    `;
  }

  private setupListeners(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this.toggle();
    });

    this.overlay.querySelector('#settings-backdrop')?.addEventListener('click', () => {
      this.hide();
    });

    this.overlay.querySelector('#settings-close')?.addEventListener('click', () => {
      this.hide();
    });

    this.overlay.querySelectorAll('.settings-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = (btn as HTMLElement).dataset.preset!;
        this.applyPreset(key);
      });
    });

    this.updateDetails();
  }

  private applyPreset(key: string): void {
    const presets = this.isMobile ? MOBILE_QUALITY_PRESETS : QUALITY_PRESETS;
    const preset = presets[key];
    if (!preset) return;

    this.currentPresetKey = key;
    this.sceneManager.setQualityPreset(preset);
    this.onPresetChange(preset);

    // Save preference
    try {
      localStorage.setItem('crownfall_quality', key);
    } catch { /* ignore */ }

    // Update UI
    this.overlay.querySelectorAll('.settings-preset-btn').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.preset === key);
    });
    this.updateDetails();
  }

  private updateDetails(): void {
    const presets = this.isMobile ? MOBILE_QUALITY_PRESETS : QUALITY_PRESETS;
    const p = presets[this.currentPresetKey];
    if (!p) return;

    const set = (id: string, val: string) => {
      const el = this.overlay.querySelector(`#${id}`);
      if (el) el.textContent = val;
    };

    set('sd-shadows', `${p.shadowMapSize}px`);
    set('sd-ssao', p.ssao ? 'On' : 'Off');
    set('sd-bloom', p.bloom ? 'On' : 'Off');
    set('sd-veg', `${Math.round(p.vegetationDensity * 100)}%`);
    set('sd-res', `${Math.round(p.resolutionScale * 100)}%`);
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  show(): void {
    this.visible = true;
    this.overlay.style.display = 'block';
  }

  hide(): void {
    this.visible = false;
    this.overlay.style.display = 'none';
  }

  isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    this.overlay.remove();
  }
}

// Inject settings styles
const settingsCSS = `
#settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  font-family: 'Inter', sans-serif;
}

.settings-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.settings-panel {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(12, 14, 22, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 24px 30px;
  min-width: 300px;
  color: #ccc;
}

.settings-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #ccc;
  margin-bottom: 18px;
  text-align: center;
  letter-spacing: 0.04em;
}

.settings-section {
  margin-bottom: 14px;
}

.settings-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #666;
  margin-bottom: 8px;
  display: block;
}

.settings-preset-group {
  display: flex;
  gap: 4px;
}

.settings-preset-btn {
  flex: 1;
  padding: 8px 10px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  color: #888;
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.12s;
}

.settings-preset-btn:hover {
  background: rgba(255, 255, 255, 0.04);
  color: #ccc;
}

.settings-preset-btn.active {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
  color: #eee;
}

.settings-detail {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
  padding: 3px 0;
  color: #666;
}

.settings-detail span:last-child {
  font-family: 'JetBrains Mono', monospace;
  color: #aaa;
  font-size: 0.68rem;
}

.settings-close-btn {
  width: 100%;
  margin-top: 12px;
  padding: 9px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: #aaa;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.12s;
}

.settings-close-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ddd;
}
`;

// Inject stylesheet
const style = document.createElement('style');
style.textContent = settingsCSS;
document.head.appendChild(style);

