You are an expert game-engineering AI agent and technical director. Build a cross-platform medieval warband arena game in **Three.js** with a **single shared game codebase** and three distribution targets:
1) **Web app** (PWA-ready)
2) **iOS + Android** via **Capacitor**
3) **Desktop (Steam-ready)** via **Electron**

You must generate a complete working repository scaffold, code, configs, and a **root README.md** that contains step-by-step instructions from install → dev → build → package for each platform. Use **NPM** (not pnpm). Use **npm workspaces**.

---

# 1) Game Concept: Crawnfall — War Serpent Arena (Critical)

The game is a **real-time PvP warband strategy** game where the player commands a leader (the "War Serpent") who leads a growing army of warriors across a snowy alien planet. The core loop is:

- **Move your leader** by clicking on the terrain — your warband follows in formation
- **Collect essence shards** scattered across the map — each shard spawns a new warrior in your army
- **Fight enemy warbands** — warriors auto-engage with rock-paper-scissors combat priorities
- **Kill enemy leaders** — a fallen leader drops their **Crown**, which you can pick up to absorb their army
- **Win** by being the last leader alive (**crown victory**), by annihilating all enemies (**annihilation**), or by having the largest army when the 5-minute timer expires (**timeout**)

This is NOT a city builder. This is NOT a MOBA. It's a **warband tactics arena** — think Totally Accurate Battle Simulator meets Slither.io meets Mount & Blade, set on an icy alien planet.

---

# 2) Visual Target: Snowy Alien Planet (Critical)

The visual target is a **clean, readable, atmospheric snowy planet** — NOT realistic AAA, NOT low-poly. The aesthetic is:

- A **continuous terrain mesh** (NOT grid tiles) with rolling white snowfields, dark exposed rock on slopes, pale blue ice patches in valleys, and frozen river paths
- Custom **GLSL ShaderMaterial** for terrain with slope-based snow/rock blending, value noise texture variation, fog, and per-vertex AO
- **Procedural vegetation** via InstancedMesh: ice crystal spires (tall hexagonal cylinders, pale blue translucent), dark rocks (dodecahedron), and snow mounds (squashed spheres) — density controlled by quality presets
- **Entity rendering** uses simple, clean geometric shapes — NOT GLTF models:
  - Warriors: `CylinderGeometry(0.3, 0.35, 1.0, 8)` with team-colored PBR materials
  - Leaders: Larger `CylinderGeometry(0.35, 0.4, 1.4, 8)` with emissive glow + a small golden `ConeGeometry` crown on top + a `PointLight`
  - Essence Shards: `OctahedronGeometry(0.5, 1)` with emissive cyan material, floating and rotating
  - Dropped Crowns: `ConeGeometry(0.4, 0.6, 5)` with golden emissive material, bobbing
- **Health bars**: `PlaneGeometry` billboarded above damaged entities, color-coded green → yellow → red

### Required rendering features (Three.js)

You MUST implement a modern rendering stack:

- PBR workflow using `MeshStandardMaterial` with cloned materials per entity
- ACES Filmic tone mapping (`THREE.ACESFilmicToneMapping`, exposure 1.3)
- Directional sunlight (warm white, intensity 2.5) with PCFSoftShadowMap, configurable shadow map size per quality preset
- Hemisphere lighting (pale blue sky, cool gray ground) for ambient
- Cool fill light from opposite direction for depth
- Procedural sky gradient (dark starfield above, blue-gray horizon, atmospheric haze)
- Fog: `FogExp2` with cool tone to match terrain shader fog
- Postprocessing chain (EffectComposer):
  - RenderPass
  - FXAA (always on)
  - UnrealBloomPass (subtle: strength 0.12, radius 0.5, threshold 0.85) — toggled by quality preset
  - OutputPass
- InstancedMesh for all vegetation (ice crystals, rocks, snow mounds) — hundreds of objects at zero draw call cost
- Team colors: Blue (player), Red (aggressive AI), Green (cautious AI), Orange (balanced AI), Purple (farmer AI)

### Camera (RTS-style, NOT top-down)

Camera must be **inclined** for 3D depth:

- `PerspectiveCamera` (FOV 45, near 0.5, far 500) with ~55° tilt
- RTS controls: WASD/arrow keys to pan, mouse wheel to zoom (clamped), smooth damped movement
- Camera **follows the player's leader** with configurable smoothing
- Edge-of-map clamping so camera stays within world bounds
- Dynamic shadow target follows camera position

---

# 3) Gameplay Mechanics (All must be fully implemented)

## 3.1 Warband Movement

Leader follows cursor/click position. Warriors follow their leader using **physics-based flocking**:

- **FORMATION mode** (default): Warriors trail behind the leader in formation slots. Three formation types:
  - **Column**: Warriors follow the leader's breadcrumb trail (position history), spaced 1.8 units apart
  - **Line**: Warriors spread perpendicular to leader's facing direction, spaced 2.2 units
  - **Wedge**: V-shape behind leader, 2.5 unit spacing
- **COMBAT mode** (auto-triggered by CombatSystem): Warriors chase their attack target but STOP at attack range distance, creating distinct **battle lines** instead of blob overlaps
- Separation flocking force to prevent warrior overlap (1.4 unit radius)
- Cohesion radius of 14 units before catch-up urgency kicks in
- Subtle sinusoidal jitter (amplitude 0.4) for organic feel — reduced in combat for stability
- Army speed penalty: -2% per 10 warriors (capped at -30%)
- Leader tracks position history (120 entries) for column formation trail
- Scattered warriors (broken morale) flee in random direction at 80% speed

## 3.2 Essence Shards

The **sole army growth mechanic** — shards are the economy:

- 200 shards spawn randomly across the map at game start
- When a leader walks within 3.5 units (pickup range), the shard is collected → a new warrior spawns at the leader's position
- Shards within 8 units of a leader are magnetically pulled toward them at 3 units/sec
- Collected shards respawn at a random position after ~7 seconds (140 ticks)
- Shards float and rotate (sinusoidal bob, continuous Y-rotation, slight X-oscillation)
- **Hard army cap of 60** per team to prevent runaway growth
- Visual: glowing cyan octahedra with emissive material

### Death Shards

When a warrior dies, it drops **exactly 1 shard** (net-zero economy to prevent exponential loops). Death shards spawn 5-8 units away from the death position (NOT at the position — prevents instant collection feedback loops).

## 3.3 Shard Fountains

Static fountain entities at fixed map positions that periodically spawn shards nearby:

- Spawns 1 shard every 2 seconds (40 ticks) within 8-unit radius
- Max 6 active shards per fountain
- Strategic control points on the map

## 3.4 Combat System

Warriors auto-fight with clear combat roles:

- **Leaders DO NOT FIGHT.** They stay behind their army. Leaders can be attacked but do not auto-attack.
- **Warriors target other WARRIORS first.** They only target enemy leaders when no enemy warriors are within engagement range (6 units).
- **Leaders are harder to reach** — only targeted when within 70% of engagement range
- Attack cooldown: once per 12 ticks (~0.6 sec) for militia, staggered random offset to prevent sync
- **Flanking**: Attacking from behind (within 72° arc of facing direction) deals 1.5× damage + morale penalty
- **Charge bonus**: First hit after CHARGE_COOLDOWN (100 ticks) deals 2× damage

### Morale / Cohesion System

Each warrior has a cohesion value (think morale):

- Cohesion drains when outnumbered (ratio-based, 0.3 per tick × outnumber ratio)
- Cohesion drains -5 when own leader takes damage (morale cascade)
- When cohesion reaches 0 → **morale breaks**: warrior scatters in random direction for 50 ticks (~2.5 sec)
- After scatter: cohesion recovers to 50% of max
- Cohesion regenerates at 0.8/tick when not in combat
- Flanking attacks deal -20 cohesion penalty to victim

### Visual Combat Feedback

- **Attack animation**: Warriors briefly pulse (scale up 1.3×) when attacking
- **Damage flash**: Warriors flash red (emissive 0xFF2200) when taking damage, fading over 6 frames
- **Leader damage pulse**: Leaders pulse scale when under attack

## 3.5 Crown System ("Kill the King")

The core endgame mechanic:

- When a leader dies, their **crown drops** as a golden glowing entity at the death position
- The dead leader's warriors become **neutral** (leaderless, leaderId = 0)
- A surviving leader can walk to the dropped crown (3.0 unit pickup range) to **absorb** it:
  - All neutral warriors from the dead team are absorbed into the collector's army
  - The collector's `CrownBearer` glow intensity increases (+0.25 per crown, max 1.0)
  - The collector's crown count increases
- A fallen leader also drops 5 extra shards (burst)
- **Win condition**: If no other leaders are alive after absorbing a crown → crown victory → match ends

## 3.6 AI System (Multi-personality state machine)

4 AI leaders, each with a distinct **aggression** level that shapes behavior:

| Team | Color | Aggression | Personality |
|---|---|---|---|
| 2 | Red | 0.9 | Aggressive — hunts immediately, rarely farms |
| 3 | Green | 0.4 | Cautious — farms until strong, only fights when provoked |
| 4 | Orange | 0.7 | Balanced — farms then hunts |
| 5 | Purple | 0.3 | Farmer — maximum farming, retreats often |

### AI State Machine

5 states: `idle`, `farm`, `hunt`, `engage`, `retreat`, `flank`

- **farm**: Seek nearest shard cluster. Transition to `hunt` when army ≥ aggression-scaled threshold OR enemy very close
- **hunt**: Move toward nearest enemy (any team, not just player). Retreat if outnumbered. Flank if stronger and at medium range. Transition to `engage` when within 8 units
- **engage**: Stay close to enemy. Retreat if badly outnumbered. Return to `hunt` if enemy runs away
- **retreat**: Run to opposite side of map from enemy. Seek shards along the way. Return to `farm` after 60 ticks
- **flank**: Circle around enemy to attack from behind. Aggressive AIs flank more tightly

Decision interval: ~0.75 sec per AI (staggered so they don't all decide on the same tick).

## 3.7 Map Shrink

Battle royale zone mechanic to force confrontation:

- Shrink begins at 180 seconds
- Playable radius decreases at 0.15 units/sec
- Minimum radius: 25 units
- Units outside the zone take 2 damage per tick

## 3.8 Match Rules

- 5 teams: 1 player + 4 AI
- Each team starts with 1 leader + 8 warriors
- Match duration: 5 minutes (300 seconds)
- Fixed-step simulation at 20 ticks/sec
- Rendering at requestAnimationFrame
- **Win conditions** (in priority order):
  1. **Crown victory**: Last surviving leader picks up the final crown
  2. **Annihilation**: All enemy leaders eliminated
  3. **Timeout**: Largest army when timer expires

---

# 4) Architecture: Modular, Reusable, Production-Grade

Everything must be separated into reusable modules/components.

## Core principles

- TypeScript everywhere
- Separation of concerns:
  - **game-core** (pure TypeScript, no DOM/Three.js): ECS, systems, components, events, configs, math utils
  - **game-web** (Three.js + DOM): Rendering, camera, input, UI/HUD, main Game orchestrator
  - **apps/mobile** (Capacitor shell): loads game-web dist
  - **apps/desktop** (Electron shell): loads game-web dist
- Core game must NOT directly depend on DOM, Capacitor, or Electron APIs

## ECS Architecture

Lightweight custom ECS:

- `World` class: entity creation/destruction, component stores, system management, event bus, tick counter, seeded RNG, pause/timeScale, serialization
- `ComponentStore<T>`: generic `Map<EntityId, T>` wrapper
- `ISystem` interface: `name`, `init()`, `update(dt)`, `dispose()`
- Entities are numeric IDs (monotonically incrementing)
- Components are **plain data interfaces** — NO methods, NO references to systems
- Systems run deterministically in registration order
- Pending destroy queue flushed after all systems update

### Component Keys (CK)

```typescript
Transform, Velocity, Health, Team, Unit, BannerLeader, WarbandMember,
Movable, Combatant, Cohesion, Selectable, Selected, RenderRef,
AIController, EssenceShard, Crown, CrownBearer, ShardFountain
```

### Required Systems (all in game-core)

- **MovementSystem** — Leader cursor-follow + warband flocking (formation + combat modes)
- **CombatSystem** — Target acquisition, attack, damage, flanking, charge, morale, death processing
- **AISystem** — Multi-personality AI state machine
- **ShardSystem** — Shard spawning, magnet, collection, warrior spawning, respawning, death shards
- **CrownSystem** — Crown drop on leader death, crown pickup, army absorption, victory check

### Required Renderers/UI (all in game-web)

- **SceneManager** — Three.js scene, lighting, postprocessing pipeline, sky, fog
- **EntityRenderer** — Syncs ECS entities with Three.js meshes, visual combat feedback, health bars
- **TerrainGenerator** — Procedural terrain with custom GLSL shader
- **VegetationSystem** — Instanced ice crystals, rocks, snow mounds
- **RTSCamera** — WASD pan, zoom, leader follow, smooth damping
- **InputManager** — Click-to-move, raycasting against terrain, leader target setting
- **HUD** — Army size, match timer, crown count, minimap-style indicators
- **SettingsMenu** — Graphics quality presets toggle

## Event Bus (required)

Strongly-typed pub/sub event system used by all gameplay and UI:

```typescript
ShardCollected, ShardSpawned, CrownDropped, CrownPickedUp,
WarriorJoined, UnitDied, DamageDealt, FormationChanged, StanceChanged,
WarbandCommandIssued, MoraleBroken, MoraleRecovered, LeaderKilled,
ArmyAbsorbed, EntitySelected, EntityDeselected, MatchStarted,
MatchEnded, TimeScaleChanged, SettingsChanged
```

All events carry typed payloads (e.g., `ShardCollectedEvent { shardId, collectorId, amount }`).

The global army count changes happen ONLY on `WarriorJoined` / `UnitDied` events — never on timers.

## Data-driven content

All balance is defined in a single `GameConfig.ts`:

- Simulation tick rate, map size, terrain params
- Formation configs (spacing, type)
- Unit definitions (militia, archer, knight — HP, speed, damage, range, cooldown, cohesion)
- Shard economy params (count, respawn, pickup range, magnet range, magnet speed, army cap)
- Fountain params, crown params, army params
- Charge mechanic params, combat morale params, scatter duration
- Map shrink params, AI params, match duration
- **Quality presets** (Low/Medium/High/Ultra for desktop, Low/Balanced/High for mobile):
  - Shadow map size, SSAO toggle, bloom toggle, antialiasing mode
  - Vegetation density, LOD distance multiplier, resolution scale, max lights

---

# 5) Cross-Platform Packaging (Web + Capacitor + Electron)

Create a monorepo with **one web build output** used by all platforms:

- Build once (`packages/game-web/dist`)
- Capacitor loads that dist
- Electron loads that dist

## Package manager + monorepo

- Use NPM workspaces in root `package.json`
- Provide scripts at root:
  - `dev:web`, `build:web`, `preview:web`
  - `build:core`
  - `mobile:sync`, `mobile:android`, `mobile:ios`, `mobile:build:android`, `mobile:build:ios`
  - `dev:desktop`, `build:desktop`, `package:desktop`
  - `typecheck`, `clean`

---

# 6) REQUIRED Monorepo Layout (Use exactly)

```
/
  package.json
  tsconfig.base.json
  README.md
  packages/
    game-core/
      src/
        ecs/
          World.ts
          types.ts
        components/
          index.ts
        systems/
          MovementSystem.ts
          CombatSystem.ts
          AISystem.ts
          ShardSystem.ts
          CrownSystem.ts
        events/
          EventBus.ts
          GameEvents.ts
        data/
          GameConfig.ts
        utils/
          MathUtils.ts
          SeededRNG.ts
        index.ts
      package.json
      tsconfig.json
    game-web/
      src/
        game/
          Game.ts
        renderer/
          SceneManager.ts
          EntityRenderer.ts
          TerrainGenerator.ts
          VegetationSystem.ts
        camera/
          RTSCamera.ts
        input/
          InputManager.ts
        ui/
          HUD.ts
          SettingsMenu.ts
        main.ts
      public/
        index.html
      vite.config.ts
      package.json
      tsconfig.json
  apps/
    mobile/
      capacitor.config.ts
      package.json
      tsconfig.json
    desktop/
      electron/
        main.ts
        preload.ts
      package.json
      tsconfig.json
  assets/
    README_ASSETS.md
```

---

# 7) Deliverables You Must Output

You must print:

A) Full folder/file tree (include all major files)

B) Contents of all key configs:
- Root `package.json` (npm workspaces + scripts)
- `tsconfig.base.json` + per-package tsconfigs
- Vite config
- Capacitor config
- Electron main/preload config

C) Complete WORKING playable game code:
- Three.js renderer with the snowy planet rendering pipeline described above
- Terrain as continuous mesh with custom GLSL shader (NOT visible tiles)
- Full ECS + event bus + all 5 systems fully implemented
- Warband flocking with column/line/wedge formations — dual formation/combat movement modes
- Complete combat system: target priorities, flanking, charge, morale/cohesion, scatter
- Complete shard system: spawn, magnet, collection, warrior spawn, respawn, death shards, army cap
- Complete crown system: leader death → crown drop → pickup → army absorption → victory check
- Complete AI system: 5-state machine with 4 AI personalities
- Map shrink mechanic
- Entity renderer with combat visual feedback (attack pulse, damage flash)
- InputManager with click-to-move raycasting
- HUD overlay: army size, match timer, crown count
- Match end screen with victory/defeat overlay and Play Again button
- Settings menu with quality preset switching
- Save/Load (World serialization via JSON/snapshot, versioned)
- Full `dispose()` / cleanup chain for memory management (Three.js objects, event listeners, maps)

D) Root `README.md` with step-by-step instructions:
1. Prerequisites (Node 18+, NPM 9+, Android Studio, Xcode)
2. `npm install`
3. `npm run dev:web` → play in browser
4. `npm run build:web`
5. Capacitor sync + run on Android/iOS
6. Build Android AAB/APK + iOS archive notes
7. Electron dev
8. Electron package for distribution
9. Steam onboarding checklist
10. Performance tuning section (web/mobile/desktop)
11. Troubleshooting section (WebGL, shadows, iOS memory, Android WebView, Electron GPU flags)

E) Ensure mobile + desktop shells load `packages/game-web/dist` (single source of truth)

---

# 8) Performance + Quality Targets (must design for)

- 60 FPS on desktop midrange GPU (target)
- 30–60 FPS on modern mobile (target), with scalable settings:
  - Shadow quality tiers (512/1024/2048/4096)
  - Vegetation density (0.2× to 1.0×)
  - Bloom toggle
  - Resolution scale (0.5× to 1.0×)
  - Max lights per preset

Include graphics settings with presets:
- **Low / Medium / High / Ultra** (desktop)
- **Low / Balanced / High** (mobile)

### Memory Management (Critical)

You MUST implement proper Three.js resource disposal:

- Recursive `disposeObject3D()` that traverses children and disposes materials, geometries, and lights
- Shared geometries (unit, leader, shard, crown, health bar) must be allocated ONCE and reused — never cloned
- Cloned materials must be disposed when entities are removed from the scene
- PointLights must be disposed when parent entities are destroyed
- Tracking maps (`prevHealth`, `damageFlash`, `lastChargeHit`) must be cleaned when entities die — NO unbounded growth
- Full `dispose()` chain: Game → World → all Systems → EntityRenderer → VegetationSystem → SceneManager → event listeners

### Spawn Economy Safety

Death shard drops MUST be ≤ 1 per death to prevent exponential growth feedback loops. Hard army cap must be enforced at shard collection time.

---

# 9) Deliverable Format (Strict)

When you respond, do it exactly like this:

1. Print the folder tree
2. Then for each file, output:
   `File: path/to/file`
   `<file contents>`
3. End with the full README.md content
4. Do NOT ask questions. Make reasonable decisions and implement.

---

# 10) Acceptance Criteria (must pass)

- `npm install` at repo root works.
- `npm run dev:web` runs the game in browser.
- `npm run build:web` builds `packages/game-web/dist`.
- `npm run mobile:android` and `npm run mobile:ios` run via Capacitor using the web dist.
- `npm run dev:desktop` runs Electron and loads the same web dist.
- Army growth happens ONLY when essence shards are collected — never on timers.
- Death shard economy is net-zero (1 warrior dies → 1 shard → max 1 warrior for the victor).
- The game renders with an atmospheric snowy planet scene, inclined perspective camera, and continuous terrain mesh.
- 5 teams compete simultaneously (1 player + 4 AI with distinct personalities).
- Combat shows visible battle lines (warriors hold at attack range), NOT blob overlaps.
- Crown mechanic works end-to-end: leader dies → crown drops → pick up → army absorbed → victory check.
- Match ends via crown_victory, annihilation, or 5-minute timeout with correct winner determination.
- No memory leaks: all Three.js resources are properly disposed on entity death and game restart.

Now execute. Produce the complete repo scaffold, configs, game code, and README with exact steps.
