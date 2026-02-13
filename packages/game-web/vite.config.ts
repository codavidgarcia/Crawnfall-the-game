import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            '@crownfall/game-core': path.resolve(__dirname, '../game-core/src/index.ts'),
        },
    },
    build: {
        outDir: 'dist',
        target: 'es2022',
        sourcemap: true,
        rollupOptions: {
            output: {
                manualChunks: {
                    three: ['three'],
                },
            },
        },
    },
    server: {
        port: 3000,
        open: true,
    },
    assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.hdr', '**/*.ktx2'],
});
