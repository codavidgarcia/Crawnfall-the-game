/**
 * VegetationSystem — Snowy planet flora: ice crystals, frozen rocks, snow mounds.
 * Clean shapes, good contrast against white snow. Instanced for performance.
 */

import * as THREE from 'three';
import { valueNoise2D, fbm2D } from '@crownfall/game-core';
import { MAP_SIZE, type QualityPreset } from '@crownfall/game-core';
import type { TerrainGenerator } from './TerrainGenerator.js';

const CRYSTAL_COUNT_MAX = 400;
const ROCK_COUNT_MAX = 300;
const MOUND_COUNT_MAX = 250;

export class VegetationSystem {
    private crystalInstances: THREE.InstancedMesh;
    private rockInstances: THREE.InstancedMesh;
    private moundInstances: THREE.InstancedMesh;

    constructor(
        private scene: THREE.Scene,
        private terrain: TerrainGenerator,
        preset: QualityPreset
    ) {
        const density = preset.vegetationDensity;
        const dummy = new THREE.Object3D();

        // ── Ice Crystals — tall spires, tinted pale blue ──
        const crystalCount = Math.floor(CRYSTAL_COUNT_MAX * density);
        const crystalGeo = new THREE.CylinderGeometry(0.08, 0.2, 2.2, 6);
        crystalGeo.translate(0, 1.1, 0);

        const crystalMat = new THREE.MeshStandardMaterial({
            color: 0x8aa8c0,
            roughness: 0.15,
            metalness: 0.3,
            transparent: true,
            opacity: 0.8,
        });

        this.crystalInstances = new THREE.InstancedMesh(crystalGeo, crystalMat, crystalCount);
        this.crystalInstances.castShadow = true;
        this.crystalInstances.receiveShadow = true;

        let ci = 0;
        for (let i = 0; i < crystalCount * 3 && ci < crystalCount; i++) {
            const x = Math.random() * MAP_SIZE;
            const z = Math.random() * MAP_SIZE;

            const cluster = fbm2D(x / MAP_SIZE * 5, z / MAP_SIZE * 5, 3);
            if (cluster < 0.55) continue;

            // Keep away from center
            const cx = x - MAP_SIZE / 2;
            const cz = z - MAP_SIZE / 2;
            if (cx * cx + cz * cz < 500) continue;

            const y = terrain.getHeightAt(x, z);
            dummy.position.set(x, y, z);
            const s = 0.4 + Math.random() * 0.9;
            dummy.scale.set(s * 0.7, s, s * 0.7);
            dummy.rotation.set(
                (Math.random() - 0.5) * 0.15,
                Math.random() * Math.PI * 2,
                (Math.random() - 0.5) * 0.15
            );
            dummy.updateMatrix();
            this.crystalInstances.setMatrixAt(ci, dummy.matrix);
            ci++;
        }
        this.crystalInstances.count = ci;
        this.crystalInstances.instanceMatrix.needsUpdate = true;
        this.scene.add(this.crystalInstances);

        // ── Dark Rocks — contrast against snow ──
        const rockCount = Math.floor(ROCK_COUNT_MAX * density);
        const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
        const rockMat = new THREE.MeshStandardMaterial({
            color: 0x404550,
            roughness: 0.8,
            metalness: 0.05,
        });
        this.rockInstances = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
        this.rockInstances.castShadow = true;
        this.rockInstances.receiveShadow = true;

        for (let i = 0; i < rockCount; i++) {
            const x = Math.random() * MAP_SIZE;
            const z = Math.random() * MAP_SIZE;
            const y = terrain.getHeightAt(x, z);
            dummy.position.set(x, y + 0.05, z);
            dummy.scale.set(
                0.3 + Math.random() * 0.7,
                0.2 + Math.random() * 0.4,
                0.3 + Math.random() * 0.7
            );
            dummy.rotation.set(
                Math.random() * 0.3,
                Math.random() * Math.PI * 2,
                Math.random() * 0.3
            );
            dummy.updateMatrix();
            this.rockInstances.setMatrixAt(i, dummy.matrix);
        }
        this.rockInstances.instanceMatrix.needsUpdate = true;
        this.scene.add(this.rockInstances);

        // ── Snow Mounds — small white bumps ──
        const moundCount = Math.floor(MOUND_COUNT_MAX * density);
        const moundGeo = new THREE.SphereGeometry(0.3, 6, 4);
        moundGeo.scale(1, 0.4, 1);
        moundGeo.translate(0, 0.05, 0);
        const moundMat = new THREE.MeshStandardMaterial({
            color: 0xd8dce8,
            roughness: 0.9,
            metalness: 0.0,
        });
        this.moundInstances = new THREE.InstancedMesh(moundGeo, moundMat, moundCount);
        this.moundInstances.receiveShadow = true;

        for (let i = 0; i < moundCount; i++) {
            const x = Math.random() * MAP_SIZE;
            const z = Math.random() * MAP_SIZE;
            const y = terrain.getHeightAt(x, z);
            dummy.position.set(x, y, z);
            dummy.scale.setScalar(0.5 + Math.random() * 1.2);
            dummy.rotation.y = Math.random() * Math.PI;
            dummy.updateMatrix();
            this.moundInstances.setMatrixAt(i, dummy.matrix);
        }
        this.moundInstances.instanceMatrix.needsUpdate = true;
        this.scene.add(this.moundInstances);
    }

    dispose(): void {
        this.scene.remove(this.crystalInstances);
        this.scene.remove(this.rockInstances);
        this.scene.remove(this.moundInstances);
        this.crystalInstances.geometry.dispose();
        this.rockInstances.geometry.dispose();
        this.moundInstances.geometry.dispose();
        (this.crystalInstances.material as THREE.Material).dispose();
        (this.rockInstances.material as THREE.Material).dispose();
        (this.moundInstances.material as THREE.Material).dispose();
    }
}
