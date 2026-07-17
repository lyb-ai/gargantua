# Visual Optimization Roadmap

This document records follow-up directions for improving the Three.js Gargantua black hole scene.

## Priority Directions

1. Add bloom post-processing - implemented
   - Use `EffectComposer` with `UnrealBloomPass`.
   - Apply bloom mostly to the photon ring, hot inner disk, caustic arcs, and disk sparks.
   - Keep the event horizon silhouette black and readable.
   - Current implementation uses a threshold-tuned bloom pass with lower strength on narrow viewports.

2. Add screen-space gravitational lensing
   - Implement a post-processing shader that bends the rendered scene around the black hole center.
   - Distort the starfield and accretion disk radially near the event horizon.
   - Use stronger distortion near the photon ring and softer falloff outward.

3. Split the accretion disk into multiple layers
   - Inner hot disk: bright, fast, white-yellow, dense filament detail.
   - Outer dust disk: slower, darker, red/amber, wider turbulent bands.
   - Spark layer: sparse high-energy particles with orbital motion.
   - Caustic layer: thin lensing arcs above and below the horizon.

## Additional Visual Improvements

4. Refine the event horizon shadow
   - Make the edge slightly asymmetric instead of a perfect sphere.
   - Add a subtle, non-uniform rim glow driven by view angle and lensing strength.
   - Preserve the central black silhouette.

5. Distort background stars near the black hole
   - Stretch stars close to the lensing area into short arcs.
   - Add a faint Einstein-ring effect around the black hole.
   - Keep distant stars crisp to maintain depth.

6. Improve camera movement
   - Add a slow cinematic drift even when orbit rotation is paused.
   - Add optional camera presets: front view, grazing disk view, top view.
   - Smooth transitions between presets.

7. Tune color grading
   - Create selectable looks:
     - Film warm white: restrained, Interstellar-inspired.
     - Scientific Doppler: stronger blue/red velocity contrast.
     - High-energy plasma: brighter blue-white inner disk.
   - Keep the palette balanced and avoid washing out disk detail.

8. Improve relativistic jets
   - Replace the current cone-based jets with layered particle streams.
   - Add turbulent opacity, core brightness, and width variation.
   - Let jet intensity respond to the detail or lensing controls.

9. Add quality presets
   - Low: fewer stars, fewer sparks, no bloom.
   - Medium: current-level detail with limited post-processing.
   - High: bloom, more particles, higher disk segments.
   - Cinematic: full post-processing and maximum shader detail.

10. Improve interactive controls
    - Display numeric values beside sliders.
    - Add toggles for jets, bloom, star distortion, and disk particles.
    - Add reset-view and screenshot buttons.

## Suggested Implementation Order

1. Bloom post-processing.
2. Screen-space gravitational lensing shader.
3. Multi-layer accretion disk.
4. Star distortion around the black hole.
5. Camera presets and quality presets.

These first three items should produce the largest visible improvement with the least disruption to the current scene structure.
