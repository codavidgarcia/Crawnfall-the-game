/**
 * Crownfall: Kingdom Serpents — Entry Point
 * Initializes the game and shows loading progress.
 */

import './ui/styles.css';
import { Game } from './game/Game.js';

async function main(): Promise<void> {
    const loadingBar = document.getElementById('loading-bar') as HTMLElement;
    const loadingText = document.getElementById('loading-text') as HTMLElement;

    const setProgress = (pct: number, text: string) => {
        loadingBar.style.width = `${pct}%`;
        loadingText.textContent = text;
    };

    setProgress(10, 'Loading engine...');

    // Small delay to let the loading screen render
    await wait(100);
    setProgress(30, 'Generating terrain...');
    await wait(50);

    const container = document.getElementById('app')!;

    setProgress(50, 'Initializing world...');
    await wait(50);

    const game = new Game(container);

    setProgress(80, 'Spawning entities...');
    await wait(50);

    setProgress(100, 'Ready');
    await wait(300);

    game.start();

    // Expose for debugging
    (window as any).__crownfall = game;
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);
