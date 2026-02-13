/**
 * SceneManager — Three.js scene for a snowy alien planet.
 * Bright, cold atmosphere. Stars overhead. Clean and readable.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { type QualityPreset, QUALITY_PRESETS } from '@crownfall/game-core';

export class SceneManager {
    public readonly scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;
    public readonly renderer: THREE.WebGLRenderer;
    public readonly canvas: HTMLCanvasElement;
    private renderPass!: RenderPass;

    private composer: EffectComposer;
    private bloomPass: UnrealBloomPass;
    private fxaaPass: ShaderPass;
    private sunLight: THREE.DirectionalLight;
    private ambientLight: THREE.HemisphereLight;
    private currentPreset: QualityPreset;

    constructor(container: HTMLElement, preset?: QualityPreset) {
        this.currentPreset = preset ?? QUALITY_PRESETS.high;

        // ── Canvas & Renderer ──
        this.canvas = document.createElement('canvas');
        container.appendChild(this.canvas);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: false,
            powerPreference: 'high-performance',
            alpha: false,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.currentPreset.resolutionScale);
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.3;

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // ── Scene ──
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xc8d0e0);

        // Light misty fog — cool tone, not oppressive
        this.scene.fog = new THREE.FogExp2(0xc8d0e0, 0.0018);

        // ── Camera ──
        this.camera = new THREE.PerspectiveCamera(
            45,
            window.innerWidth / window.innerHeight,
            0.5,
            500
        );
        this.camera.position.set(100, 60, 100);
        this.camera.lookAt(100, 0, 100);

        // ── Lighting ──
        // Hemisphere: pale blue sky + cool shadow fill
        this.ambientLight = new THREE.HemisphereLight(
            0xb0c0d8, // sky: pale blue
            0x707880, // ground: cool gray
            0.8
        );
        this.scene.add(this.ambientLight);

        // Main sun — warm white, strong. Creates warm/cool interplay on snow.
        this.sunLight = new THREE.DirectionalLight(0xfff4e8, 2.5);
        this.sunLight.position.set(-50, 75, -35);
        this.sunLight.castShadow = true;
        this.configureShadows();
        this.scene.add(this.sunLight);
        this.scene.add(this.sunLight.target);
        this.sunLight.target.position.set(100, 0, 100);

        // Cool fill light from opposite side
        const fillLight = new THREE.DirectionalLight(0x90a8c0, 0.4);
        fillLight.position.set(50, 30, 60);
        this.scene.add(fillLight);

        // ── Sky ──
        this.createSky();

        // ── Postprocessing ──
        this.composer = new EffectComposer(this.renderer);

        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);

        this.fxaaPass = new ShaderPass(FXAAShader);
        this.updateFXAAResolution();
        this.composer.addPass(this.fxaaPass);

        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.12,  // subtle bloom
            0.5,
            0.85
        );
        if (this.currentPreset.bloom) {
            this.composer.addPass(this.bloomPass);
        }

        const outputPass = new OutputPass();
        this.composer.addPass(outputPass);

        window.addEventListener('resize', () => this.onResize());
    }

    private configureShadows(): void {
        const shadowSize = this.currentPreset.shadowMapSize;
        this.sunLight.shadow.mapSize.set(shadowSize, shadowSize);
        this.sunLight.shadow.camera.near = 1;
        this.sunLight.shadow.camera.far = 300;

        const extent = 80;
        this.sunLight.shadow.camera.left = -extent;
        this.sunLight.shadow.camera.right = extent;
        this.sunLight.shadow.camera.top = extent;
        this.sunLight.shadow.camera.bottom = -extent;

        this.sunLight.shadow.bias = -0.0005;
        this.sunLight.shadow.normalBias = 0.02;
    }

    private createSky(): void {
        const skyGeo = new THREE.SphereGeometry(400, 32, 16);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x0a1020) },
                midColor: { value: new THREE.Color(0x3a4a68) },
                horizonColor: { value: new THREE.Color(0xc0c8d8) },
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 midColor;
                uniform vec3 horizonColor;
                varying vec3 vWorldPosition;
                varying vec2 vUv;

                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
                }

                void main() {
                    float h = normalize(vWorldPosition).y;
                    float hNorm = h * 0.5 + 0.5;

                    // Gradient: dark space at top → blue-gray mid → pale horizon
                    vec3 sky = mix(horizonColor, midColor, smoothstep(0.4, 0.65, hNorm));
                    sky = mix(sky, topColor, smoothstep(0.6, 0.9, hNorm));

                    // Stars only in upper sky
                    vec2 grid = floor(vUv * 400.0);
                    float star = hash(grid);
                    float starMask = step(0.994, star) * smoothstep(0.55, 0.75, hNorm);
                    sky += vec3(starMask * 0.5);

                    gl_FragColor = vec4(sky, 1.0);
                }
            `,
            side: THREE.BackSide,
            depthWrite: false,
        });
        this.scene.add(new THREE.Mesh(skyGeo, skyMat));
    }

    private updateFXAAResolution(): void {
        const pixelRatio = this.renderer.getPixelRatio();
        (this.fxaaPass.material as THREE.ShaderMaterial).uniforms['resolution'].value.set(
            1 / (window.innerWidth * pixelRatio),
            1 / (window.innerHeight * pixelRatio)
        );
    }

    private onResize(): void {
        const w = window.innerWidth;
        const h = window.innerHeight;

        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(w, h);
        this.composer.setSize(w, h);
        this.bloomPass.setSize(w, h);
        this.updateFXAAResolution();
    }

    updateShadowTarget(targetX: number, targetZ: number): void {
        this.sunLight.target.position.set(targetX, 0, targetZ);
        this.sunLight.position.set(targetX - 50, 75, targetZ - 35);
        this.sunLight.target.updateMatrixWorld();
    }

    setQualityPreset(preset: QualityPreset): void {
        this.currentPreset = preset;
        this.renderer.setPixelRatio(
            Math.min(window.devicePixelRatio, 2) * preset.resolutionScale
        );
        this.configureShadows();

        const bloomIdx = this.composer.passes.indexOf(this.bloomPass);
        if (preset.bloom && bloomIdx === -1) {
            this.composer.insertPass(this.bloomPass, this.composer.passes.length - 1);
        } else if (!preset.bloom && bloomIdx !== -1) {
            this.composer.removePass(this.bloomPass);
        }

        this.onResize();
    }

    render(camera?: THREE.Camera): void {
        if (camera && camera instanceof THREE.PerspectiveCamera) {
            this.renderPass.camera = camera;
        }
        this.composer.render();
    }

    setCamera(camera: THREE.PerspectiveCamera): void {
        this.camera = camera;
        this.renderPass.camera = camera;
    }

    handleResize(w: number, h: number): void {
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.composer.setSize(w, h);
        this.bloomPass.setSize(w, h);
        this.updateFXAAResolution();
    }

    dispose(): void {
        this.renderer.dispose();
        this.composer.dispose();
    }
}
