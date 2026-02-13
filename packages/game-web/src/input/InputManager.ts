/**
 * InputManager — Direct cursor-follow control for Crawnfall Arena.
 *
 * The leader continuously moves toward the mouse/touch position.
 * No click-to-move. No right-click commands. Just MOVE.
 * Formation hotkeys (1/2/3) and sprint (Space) are the only other inputs.
 */

import * as THREE from 'three';
import type {
    World,
    BannerLeaderC,
    MovableC,
    TransformC,
} from '@crownfall/game-core';
import { CK, GameEventType, MAP_SIZE } from '@crownfall/game-core';
import type { FormationType } from '@crownfall/game-core';

export class InputManager {
    private mouse = new THREE.Vector2(0, 0);
    private raycaster = new THREE.Raycaster();
    private worldTarget = new THREE.Vector3();
    private hasWorldTarget = false;
    private terrainMesh: THREE.Mesh | null = null;
    private camera: THREE.Camera | null = null;
    private playerLeaderId = 0;

    // Touch support
    private touchActive = false;
    private touchPos = new THREE.Vector2(0, 0);

    // Sprint
    private sprintActive = false;
    private readonly SPRINT_BOOST = 1.6;

    private handlers: Array<[EventTarget, string, EventListener]> = [];

    constructor(
        private el: HTMLElement,
        private world: World,
        private playerTeamId: number,
    ) { }

    setCamera(camera: THREE.Camera): void {
        this.camera = camera;
    }

    setTerrainMesh(mesh: THREE.Mesh): void {
        this.terrainMesh = mesh;
    }

    setPlayerLeaderId(id: number): void {
        this.playerLeaderId = id;
    }

    bind(): void {
        const el = this.el;

        // Mouse movement → cursor-follow
        this.addHandler(el, 'mousemove', (e: Event) => {
            const me = e as MouseEvent;
            const rect = el.getBoundingClientRect();
            this.mouse.x = ((me.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((me.clientY - rect.top) / rect.height) * 2 + 1;
        });

        // Touch → cursor-follow
        this.addHandler(el, 'touchstart', (e: Event) => {
            e.preventDefault();
            this.touchActive = true;
            this.updateTouchPos(e as TouchEvent);
        });

        this.addHandler(el, 'touchmove', (e: Event) => {
            e.preventDefault();
            this.updateTouchPos(e as TouchEvent);
        });

        this.addHandler(el, 'touchend', () => {
            this.touchActive = false;
        });

        // Keyboard
        this.addHandler(window, 'keydown', (e: Event) => {
            const ke = e as KeyboardEvent;
            switch (ke.code) {
                case 'Digit1':
                    this.setFormation('column');
                    break;
                case 'Digit2':
                    this.setFormation('line');
                    break;
                case 'Digit3':
                    this.setFormation('wedge');
                    break;
                case 'Space':
                    ke.preventDefault();
                    this.sprintActive = true;
                    break;
            }
        });

        this.addHandler(window, 'keyup', (e: Event) => {
            const ke = e as KeyboardEvent;
            if (ke.code === 'Space') {
                this.sprintActive = false;
            }
        });
    }

    private updateTouchPos(e: TouchEvent): void {
        const rect = this.el.getBoundingClientRect();
        const t = e.touches[0];
        this.touchPos.x = ((t.clientX - rect.left) / rect.width) * 2 - 1;
        this.touchPos.y = -((t.clientY - rect.top) / rect.height) * 2 + 1;
    }

    /** Call every frame to update leader target position from cursor */
    updateCursorTarget(): void {
        if (!this.camera || !this.terrainMesh) return;

        const screenPos = this.touchActive ? this.touchPos : this.mouse;

        this.raycaster.setFromCamera(screenPos, this.camera);
        const hits = this.raycaster.intersectObject(this.terrainMesh, false);

        if (hits.length > 0) {
            this.worldTarget.copy(hits[0].point);
            this.hasWorldTarget = true;

            // Update leader movable target
            if (this.playerLeaderId) {
                const mov = this.world.getStore<MovableC>(CK.Movable).get(this.playerLeaderId);
                if (mov) {
                    // Convert from Three.js world (0..MAP_SIZE) to game coords (centered at 0)
                    const h = MAP_SIZE / 2;
                    mov.targetPosition = {
                        x: this.worldTarget.x - h,
                        y: this.worldTarget.z - h, // Three.js Z → game Y
                    };

                    // Sprint boost
                    const baseSpeed = 5;
                    mov.moveSpeed = this.sprintActive ? baseSpeed * this.SPRINT_BOOST : baseSpeed;
                }
            }
        }
    }

    getWorldTarget(): THREE.Vector3 | null {
        return this.hasWorldTarget ? this.worldTarget : null;
    }

    private setFormation(formation: FormationType): void {
        const leaders = this.world.getStore<BannerLeaderC>(CK.BannerLeader);
        for (const [lid, leader] of leaders.entries()) {
            if (leader.teamId === this.playerTeamId) {
                leader.formation = formation;
                this.world.events.emit(GameEventType.FormationChanged, {
                    teamId: this.playerTeamId,
                    formationType: formation,
                });
                break;
            }
        }
    }

    private addHandler(target: EventTarget, event: string, handler: EventListener): void {
        target.addEventListener(event, handler, { passive: false });
        this.handlers.push([target, event, handler]);
    }

    dispose(): void {
        for (const [target, event, handler] of this.handlers) {
            target.removeEventListener(event, handler);
        }
        this.handlers.length = 0;
    }
}
