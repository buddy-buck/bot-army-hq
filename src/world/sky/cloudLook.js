import * as THREE from 'three';

// The cloud look, shared by the clouds in Sky.jsx and the sky show's cloud
// letters: faceted puffs whose tops take sky.cloud, undersides a cooler
// shade that warms with the sunrise/sunset glow, and a warm rim on the sun
// side. Per-instance colors tint a puff (bot eyes, the antenna bulb).

export const cloudVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vTint;
  void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vN = normalize(mat3(m) * normal);
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #else
      vTint = vec3(1.0);
    #endif
    gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
  }
`;
export const cloudFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uUnder;
  uniform vec3 uRim;
  uniform vec3 uSunDir;
  uniform vec3 uHaze;
  varying vec3 vN;
  varying vec3 vTint;
  void main() {
    vec3 n = normalize(vN);
    float up = n.y * 0.5 + 0.5;
    vec3 col = mix(uUnder, uTop, smoothstep(0.15, 0.85, up));
    float facing = max(dot(n, normalize(uSunDir)), 0.0);
    col += uRim * pow(facing, 2.0) * 0.35;
    col *= vTint;
    col = mix(col, uHaze, 0.12);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function cloudUniforms() {
  return {
    uTop: { value: new THREE.Color() },
    uUnder: { value: new THREE.Color() },
    uRim: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uHaze: { value: new THREE.Color() },
  };
}

export const cloudMaterial = (uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: cloudVertex, fragmentShader: cloudFragment, fog: false });

const _c = new THREE.Color();
export function setCloudUniforms(uniforms, sky) {
  const k = sky.glowK || 0;
  uniforms.uTop.value.set(sky.cloud);
  uniforms.uUnder.value.set(sky.cloud).multiplyScalar(sky.isNight ? 0.72 : 0.8).lerp(_c.set('#b8c8e8'), sky.isNight ? 0 : 0.12 * (1 - k));
  uniforms.uUnder.value.lerp(_c.set(sky.glow || sky.cloud), k * 0.7);
  uniforms.uRim.value.set(sky.sunUp ? sky.sun : '#7080b0').multiplyScalar(sky.sunUp ? 0.6 + 0.6 * k : 0.25);
  uniforms.uSunDir.value.fromArray(sky.sunUp ? sky.sunDir : sky.moonDir);
  uniforms.uHaze.value.set(sky.horizon);
}

// Every puff is the same faceted ball.
export const PUFF_GEO = new THREE.IcosahedronGeometry(1, 1);
