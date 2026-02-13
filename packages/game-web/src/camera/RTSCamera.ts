/**
 * RTSCamera — Auto-follow camera for Crawnfall Arena.
 *
 * Camera automatically follows the player's leader with smooth damping.
 * Player can zoom in/out with scroll wheel. No manual pan (WASD removed).
 * The camera tilts and distance adjust based on zoom level.
 */

import * as THREE from 'three';
import type { World, TransformC, BannerLeaderC } from '@crownfall/game-core';
import { CK, MAP_SIZE } from '@crownfall/game-core';

export interface CameraParams {
    /** Min/max distance from target */
    minDist: number;
    maxDist: number;
    /** Default distance */
    defaultDist: number;
    /** Tilt angle at close zoom (radians from vertical) */
    tiltClose: number;
    /** Tilt angle at far zoom */
    tiltFar: number;
    /** Smooth follow speed (0..1, higher = faster) */
    followSpeed: number;
    /** Zoom speed multiplier */
    zoomSpeed: number;
}

const DEFAULT_PARAMS: CameraParams = {
    minDist: 15,
    maxDist: 100,
    defaultDist: 40,
    tiltClose: 0.8,  // ~45° from vertical → more behind-the-shoulder
    tiltFar: 0.4,    // ~23° from vertical → more top-down
    followSpeed: 0.08,
    zoomSpeed: 3,
};

export class RTSCamera {
    readonly camera: THREE.PerspectiveCamera;
    private params: CameraParams;
    private targetPos = new THREE.Vector3(0, 0, 0);
    private currentPos = new THREE.Vector3(0, 0, 0);
    private distance: number;
    private playerLeaderId = 0;

    private getTerrainHeight: (x: number, z: number) => number;

    constructor(
        container: HTMLElement,
        getTerrainHeight: (x: number, z: number) => number,
        params?: Partial<CameraParams>,
    ) {
        this.params = { ...DEFAULT_PARAMS, ...params };
        this.distance = this.params.defaultDist;
        this.getTerrainHeight = getTerrainHeight;

        const aspect = container.clientWidth / container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(50, aspect, 0.5, 500);
        this.camera.position.set(0, this.distance, this.distance * 0.5);
        this.camera.lookAt(0, 0, 0);

        // Zoom with scroll
        container.addEventListener('wheel', (e: WheelEvent) => {
            e.preventDefault();
            this.distance += e.deltaY * 0.05 * this.params.zoomSpeed;
            this.distance = Math.max(this.params.minDist, Math.min(this.params.maxDist, this.distance));
        }, { passive: false });

        // Pinch zoom for touch
        let lastPinchDist = 0;
        container.addEventListener('touchstart', (e: TouchEvent) => {
            if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                lastPinchDist = Math.sqrt(dx * dx + dy * dy);
            }
        }, { passive: true });

        container.addEventListener('touchmove', (e: TouchEvent) => {
            if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const pinchDist = Math.sqrt(dx * dx + dy * dy);
                const delta = lastPinchDist - pinchDist;
                this.distance += delta * 0.1;
                this.distance = Math.max(this.params.minDist, Math.min(this.params.maxDist, this.distance));
                lastPinchDist = pinchDist;
            }
        }, { passive: true });
    }

    setPlayerLeaderId(id: number): void {
        this.playerLeaderId = id;
    }

    /** Update camera to follow the player's leader */
    update(dt: number, world: World): void {
        // Get leader position
        if (this.playerLeaderId) {
            const transforms = world.getStore<TransformC>(CK.Transform);
            const lt = transforms.get(this.playerLeaderId);
            if (lt) {
                const terrainY = this.getTerrainHeight(lt.position.x, lt.position.y);
                const h = MAP_SIZE / 2;
                this.targetPos.set(lt.position.x + h, terrainY, lt.position.y + h);
            }
        }

        // Smooth follow
        const speed = this.params.followSpeed;
        this.currentPos.lerp(this.targetPos, speed);

        // Calculate tilt based on zoom distance
        const zoomT = (this.distance - this.params.minDist) / (this.params.maxDist - this.params.minDist);
        const tilt = THREE.MathUtils.lerp(this.params.tiltClose, this.params.tiltFar, zoomT);

        // Position camera behind and above
        const camX = this.currentPos.x;
        const camY = this.currentPos.y + this.distance * Math.cos(tilt);
        const camZ = this.currentPos.z + this.distance * Math.sin(tilt);

        this.camera.position.set(camX, camY, camZ);
        this.camera.lookAt(this.currentPos);
    }

    handleResize(width: number, height: number): void {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    dispose(): void { }
}
