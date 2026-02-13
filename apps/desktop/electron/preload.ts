/**
 * Electron Preload Script — Minimal, sandboxed.
 * Exposes a safe API to the renderer via contextBridge.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    isElectron: true,
    toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
    getVersion: () => process.env.npm_package_version ?? '0.1.0',
});
