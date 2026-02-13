/**
 * Electron Main Process — Loads game-web dist into a BrowserWindow.
 * Steam-ready: supports fullscreen, hardware acceleration, and proper quit handling.
 */

import { app, BrowserWindow, screen } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;

// Determine if running in development
const isDev = !app.isPackaged;

function createWindow(): void {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    mainWindow = new BrowserWindow({
        width: Math.min(1920, width),
        height: Math.min(1080, height),
        title: 'Crownfall: Kingdom Serpents',
        icon: path.join(__dirname, '../icon.png'),
        backgroundColor: '#0a0a14',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
        // Game-specific
        fullscreenable: true,
        autoHideMenuBar: true,
    });

    // Load the game
    if (isDev) {
        // In dev, load from Vite dev server
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        // In production, load from extraResources
        const gamePath = path.join(process.resourcesPath, 'app', 'index.html');
        mainWindow.loadFile(gamePath);
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // F11 fullscreen toggle
    mainWindow.webContents.on('before-input-event', (_event, input) => {
        if (input.key === 'F11' && input.type === 'keyDown') {
            mainWindow?.setFullScreen(!mainWindow.isFullScreen());
        }
    });
}

// Hardware acceleration
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) createWindow();
});
