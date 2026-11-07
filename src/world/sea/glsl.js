// Shader snippets shared by everything drawn on the water surface, so foam,
// ripples and wakes ride the exact same waves as the water mesh.

// Wave height at a point. The water mesh, the surf, the stilt foam and the
// foam particles all lift themselves with this.
export const WAVE_FN = /* glsl */ `
  float waveY(vec2 p, float t) {
    return 0.07 * sin(p.x * 0.35 + t * 0.8) + 0.05 * cos(p.y * 0.42 + t * 0.63) + 0.03 * sin((p.x + p.y) * 0.9 + t * 1.4);
  }
`;

// Cheap value noise, plenty for lacy foam edges.
export const NOISE_FN = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float lace(vec2 p) {
    return vnoise(p) * 0.62 + vnoise(p * 2.3 + 7.1) * 0.38;
  }
`;

// The same wave height on the CPU, for things that float.
export function waveY(x, z, t) {
  return 0.07 * Math.sin(x * 0.35 + t * 0.8) + 0.05 * Math.cos(z * 0.42 + t * 0.63) + 0.03 * Math.sin((x + z) * 0.9 + t * 1.4);
}
