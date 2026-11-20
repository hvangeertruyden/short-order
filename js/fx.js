// ---------------------------------------------------------------------------
// Post-processing (contact shadows, glow, colour grade) + quality scaling.
// Quality 2 = glow + colour grade (sharper on Retina), 1 = colour grade, 0 = plain render.
// It steps down by itself if frames get slow; V cycles it by hand.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// warm grade + gentle vignette + a touch of saturation (applied after tone mapping)
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.12 }, uSat: { value: 1.18 }, uWarm: { value: 0.02 }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVignette, uSat, uWarm, uTime; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb += vec3(uWarm, uWarm * 0.35, -uWarm * 0.6);
      vec2 d = vUv - 0.5; float v = smoothstep(0.85, 0.25, length(d * vec2(1.0, 0.85)));
      c.rgb *= mix(1.0 - uVignette, 1.0, v);
      c.rgb += (hash(vUv * 731.0) - 0.5) * 0.012;   // very fine grain so flat areas don't look plasticky
      gl_FragColor = c;
    }`,
};

export function createPost(renderer, scene, camera) {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(size.x, size.y);
  composer.addPass(new RenderPass(scene, camera));
  const ao = { enabled: false, setSize() {} };   // (no ambient occlusion in the bright cartoon look)
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.5, 2.5);   // only real light sources (neon, lamps) glow
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  let quality = 2;
  queueMicrotask(() => api.setQuality(quality));
  const frames = [];
  let lastChange = performance.now();
  const api = {
    get quality() { return quality; },
    passes: { ao, bloom, grade },
    setQuality(q) {
      quality = Math.max(0, Math.min(2, q));
      // render resolution: Retina screens get a little extra sharpness on high, plain 1x otherwise
      const pr = quality >= 2 ? Math.min(1.25, window.devicePixelRatio) : 1;
      if (renderer.getPixelRatio() !== pr) { renderer.setPixelRatio(pr); const sz = renderer.getSize(new THREE.Vector2()); api.setSize(sz.x, sz.y); }
      lastChange = performance.now();
      frames.length = 0;
    },
    cycle() { api.setQuality(quality === 0 ? 2 : quality - 1); return quality; },
    setSize(w, h) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); ao.setSize(w, h); bloom.setSize(w, h); },
    render(dtMs) {
      grade.uniforms.uTime.value = (performance.now() % 10000) / 1000;
      bloom.enabled = quality >= 2;
      if (quality === 0) renderer.render(scene, camera);
      else composer.render();
      // automatic step-down if the frame rate drops (only while the tab is visible)
      if (dtMs > 0 && dtMs < 250 && document.visibilityState === 'visible') {
        frames.push(dtMs);
        if (frames.length > 90) frames.shift();
        if (frames.length === 90 && quality > 0 && performance.now() - lastChange > 4000) {
          const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
          if (avg > 24) { api.setQuality(quality - 1); api.onAutoDrop?.(quality); }
        }
      }
    },
  };
  return api;
}
