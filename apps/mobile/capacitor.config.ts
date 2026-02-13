import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.crownfall.kingdomserpents',
    appName: 'Crownfall: Kingdom Serpents',
    webDir: '../../packages/game-web/dist',
    server: {
        androidScheme: 'https',
    },
    plugins: {
        StatusBar: {
            style: 'Dark',
            backgroundColor: '#0a0a14',
        },
    },
    ios: {
        contentInset: 'always',
        preferredContentMode: 'mobile',
    },
    android: {
        backgroundColor: '#0a0a14',
    },
};

export default config;
