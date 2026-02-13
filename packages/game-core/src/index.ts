/**
 * @crownfall/game-core — Barrel export
 * All public API surface for the game engine.
 */

// ECS
export { ComponentStore, type EntityId, type ISystem } from './ecs/types.js';
export { World, type WorldSnapshot } from './ecs/World.js';

// Components
export * from './components/index.js';

// Events
export { EventBus, type EventHandler } from './events/EventBus.js';
export * from './events/GameEvents.js';

// Utils
export { SeededRandom } from './utils/SeededRandom.js';
export * from './utils/MathUtils.js';

// Data / Config
export * from './data/GameConfig.js';

// Systems
export { MovementSystem } from './systems/MovementSystem.js';
export { CombatSystem } from './systems/CombatSystem.js';
export { AISystem } from './systems/AISystem.js';
export { ShardSystem } from './systems/ShardSystem.js';
export { CrownSystem } from './systems/CrownSystem.js';

// Services
export { StubNetworkAdapter, type INetworkAdapter, type NetworkMessage } from './services/NetworkInterface.js';
export { WebPlatformService, type IPlatformService } from './services/PlatformService.js';
