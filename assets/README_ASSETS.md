# Asset Pipeline — Crownfall: Kingdom Serpents

## Directory Structure

```
assets/
├── characters/     # Unit models (GLTF/GLB) — militia, archer, knight, carrier, banner leader
├── buildings/      # Structure models — camp, outpost, storage cart
├── props/          # World props — cargo crates, sacks, barrels, fences, market stalls
├── terrain/        # Terrain textures — grass, dirt, rock, path (albedo/normal/rough/ao)
├── textures/       # Shared PBR texture maps
├── hdr/            # HDRI environment maps for reflections
└── licenses/       # License files for all third-party assets
```

## Asset Requirements

### Format
- **Models**: GLTF 2.0 / GLB with embedded PBR materials
- **Textures**: PNG or KTX2/Basis for compression
- **HDRI**: .hdr or .exr (512–2K resolution)

### PBR Texture Maps (per material)
- `*_albedo.png` — Base color (sRGB)
- `*_normal.png` — Normal map (linear)
- `*_roughness.png` — Roughness (linear, grayscale)
- `*_ao.png` — Ambient occlusion (linear, grayscale)
- `*_metalness.png` — Metalness (linear, grayscale, optional)

### Polygon Budget
- **Units**: 500–2000 tris (with LOD 0/1/2)
- **Buildings**: 2000–8000 tris
- **Props**: 100–500 tris
- **Terrain**: Procedural (no model needed)

## Recommended Free Asset Sources (CC0/Permissive)

- [Kenney.nl](https://kenney.nl/) — CC0 game assets
- [Quaternius](https://quaternius.com/) — CC0 low-poly medieval packs
- [Poly Haven](https://polyhaven.com/) — CC0 textures and HDRI
- [Sketchfab](https://sketchfab.com/) — Filter by CC0/CC-BY
- [ambientCG](https://ambientcg.com/) — CC0 PBR materials

## Current State

The game currently uses **procedural placeholder geometry** for all entities:
- Units: Cylinder capsules with PBR materials
- Buildings: Box/cone primitives
- Terrain: Procedural heightmap with multi-material shader
- Vegetation: Instanced trees (cylinder+sphere), rocks (dodecahedron), grass (planes)

These placeholders still look presentable thanks to:
- PBR materials with realistic roughness/metalness
- ACES filmic tone mapping
- Soft shadow mapping
- Fog and atmospheric effects
- Procedural terrain blending shader

## Upgrading to AAA Assets

1. Place GLTF/GLB files in the appropriate directory
2. Update `EntityRenderer.ts` to load models via `GLTFLoader`
3. Add LOD variants (LOD0, LOD1, LOD2) by distance
4. Use Draco compression for mesh optimization: `npx gltf-pipeline -i model.gltf -o model.glb -d`
5. Convert textures to KTX2: `npx ktx-parse ...` or use Basis transcoder
6. Update `VegetationSystem.ts` to use instanced GLTF models instead of primitives

## License Tracking

Place a `LICENSE.md` in `assets/licenses/` for EACH asset pack used:
```
Asset: Medieval Unit Pack
Source: https://example.com
Author: Artist Name
License: CC0 1.0 / CC-BY 4.0
Date Acquired: YYYY-MM-DD
```
