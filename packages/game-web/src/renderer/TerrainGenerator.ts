/**
 * TerrainGenerator — Clean snowy alien terrain.
 *
 * White snow base, dark exposed rock on slopes, subtle blue shadows.
 * Big clean zones, wide transitions, readable from RTS camera height.
 */

import * as THREE from 'three';
import { fbm2D, valueNoise2D } from '@crownfall/game-core';
import { MAP_SIZE, TERRAIN_SEGMENTS, TERRAIN_HEIGHT_SCALE } from '@crownfall/game-core';

export class TerrainGenerator {
  public readonly mesh: THREE.Mesh;
  public readonly heightData: Float32Array;
  private geometry: THREE.PlaneGeometry;

  constructor() {
    const segments = TERRAIN_SEGMENTS;
    this.geometry = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, segments, segments);
    this.geometry.rotateX(-Math.PI / 2);

    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const count = posAttr.count;
    this.heightData = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);

      const nx = (x + MAP_SIZE / 2) / MAP_SIZE;
      const nz = (z + MAP_SIZE / 2) / MAP_SIZE;

      // Broad rolling terrain — smooth snowfields with gentle ridges
      let height = fbm2D(nx * 4, nz * 4, 3, 2.0, 0.38) * TERRAIN_HEIGHT_SCALE;

      // Flatten center for camp
      const cx = nx - 0.5;
      const cz = nz - 0.5;
      const distFromCenter = Math.sqrt(cx * cx + cz * cz);
      if (distFromCenter < 0.15) {
        height *= 0.2 + (distFromCenter / 0.15) * 0.8;
      }

      // Frozen river valleys
      const pathNoise = valueNoise2D(nx * 2.5, nz * 2.5);
      if (pathNoise > 0.42 && pathNoise < 0.58) {
        height *= 0.55;
      }

      posAttr.setY(i, height);
      this.heightData[i] = height;
    }

    this.geometry.computeVertexNormals();
    const material = this.createTerrainMaterial();

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.position.set(MAP_SIZE / 2, 0, MAP_SIZE / 2);
  }

  private createTerrainMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        // Snow — bright white with slight blue tint
        snowColor1: { value: new THREE.Color(0xe8e8f0) },
        snowColor2: { value: new THREE.Color(0xd8dce8) },

        // Exposed rock on slopes — dark cool gray
        rockColor: { value: new THREE.Color(0x484850) },
        rockColor2: { value: new THREE.Color(0x3a3a44) },

        // Ice patches in valleys — pale blue
        iceColor: { value: new THREE.Color(0xc0d0e0) },

        // Lighting
        sunDir: { value: new THREE.Vector3(-0.4, 0.75, -0.35).normalize() },
        sunColor: { value: new THREE.Color(0xfff4e8) },
        ambientColor: { value: new THREE.Color(0x8090b8) },
        fogColor: { value: new THREE.Color(0xc8d0e0) },
        fogDensity: { value: 0.0018 },
      },
      vertexShader: /* glsl */ `
                varying vec3 vNormal;
                varying vec3 vWorldPos;
                varying float vHeight;

                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    vec4 wp = modelMatrix * vec4(position, 1.0);
                    vWorldPos = wp.xyz;
                    vHeight = position.y;
                    gl_Position = projectionMatrix * viewMatrix * wp;
                }
            `,
      fragmentShader: /* glsl */ `
                uniform vec3 snowColor1;
                uniform vec3 snowColor2;
                uniform vec3 rockColor;
                uniform vec3 rockColor2;
                uniform vec3 iceColor;
                uniform vec3 sunDir;
                uniform vec3 sunColor;
                uniform vec3 ambientColor;
                uniform vec3 fogColor;
                uniform float fogDensity;

                varying vec3 vNormal;
                varying vec3 vWorldPos;
                varying float vHeight;

                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
                }

                float vnoise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    float a = hash(i);
                    float b = hash(i + vec2(1.0, 0.0));
                    float c = hash(i + vec2(0.0, 1.0));
                    float d = hash(i + vec2(1.0, 1.0));
                    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
                }

                void main() {
                    vec3 N = normalize(vNormal);
                    float slope = 1.0 - N.y;

                    // ── Snow base — large-scale warm/cool variation ──
                    float snowShift = vnoise(vWorldPos.xz * 0.006);
                    vec3 snow = mix(snowColor1, snowColor2, snowShift);

                    // ── Rock — exposed on steep slopes ──
                    float rockShift = vnoise(vWorldPos.xz * 0.02 + 30.0);
                    vec3 rock = mix(rockColor, rockColor2, rockShift);

                    // Slope-based blend: snow on flat, rock on steep
                    float rockMask = smoothstep(0.2, 0.45, slope);
                    vec3 surfaceColor = mix(snow, rock, rockMask);

                    // ── Ice patches in valleys ──
                    float valleyMask = smoothstep(1.5, -0.5, vHeight);
                    float iceNoise = vnoise(vWorldPos.xz * 0.018);
                    float iceMask = valleyMask * smoothstep(0.4, 0.6, iceNoise);
                    surfaceColor = mix(surfaceColor, iceColor, iceMask * 0.4);

                    // ── Subtle surface detail — very mild ──
                    float detail = vnoise(vWorldPos.xz * 0.12) * 0.04 - 0.02;
                    surfaceColor *= (1.0 + detail);

                    // ── Lighting ──
                    float NdotL = max(dot(N, sunDir), 0.0);
                    vec3 diffuse = sunColor * NdotL * 1.3;

                    // Cool blue ambient — stronger from sky for snowy look
                    float ambUp = N.y * 0.5 + 0.5;
                    vec3 ambient = ambientColor * (0.55 + ambUp * 0.3);

                    vec3 lit = surfaceColor * (diffuse + ambient);

                    // Shadow tint — blue in shadows (snow reflects sky)
                    float shadowFactor = 1.0 - NdotL;
                    lit += vec3(0.02, 0.04, 0.08) * shadowFactor;

                    // AO from height
                    float ao = smoothstep(-2.0, 4.0, vHeight);
                    lit *= 0.82 + ao * 0.18;

                    // ── Fog — light misty ──
                    float dist = length(vWorldPos - cameraPosition);
                    float fog = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
                    lit = mix(lit, fogColor, clamp(fog, 0.0, 1.0));

                    gl_FragColor = vec4(lit, 1.0);
                }
            `,
      side: THREE.FrontSide,
    });
  }

  getHeightAt(worldX: number, worldZ: number): number {
    const u = worldX / MAP_SIZE;
    const v = worldZ / MAP_SIZE;

    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;

    const segments = TERRAIN_SEGMENTS;
    const gridX = u * segments;
    const gridZ = v * segments;
    const ix = Math.floor(gridX);
    const iz = Math.floor(gridZ);
    const fx = gridX - ix;
    const fz = gridZ - iz;

    const idx = iz * (segments + 1) + ix;
    const h00 = this.heightData[idx] ?? 0;
    const h10 = this.heightData[idx + 1] ?? h00;
    const h01 = this.heightData[idx + segments + 1] ?? h00;
    const h11 = this.heightData[idx + segments + 2] ?? h00;

    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    return h0 * (1 - fz) + h1 * fz;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.ShaderMaterial).dispose();
  }
}
