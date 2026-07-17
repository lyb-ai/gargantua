import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const canvas = document.querySelector("#scene");
const diskSpeedInput = document.querySelector("#diskSpeed");
const lensPowerInput = document.querySelector("#lensPower");
const detailPowerInput = document.querySelector("#detailPower");
const orbitButton = document.querySelector("#toggleOrbit");
const readout = document.querySelector("#readout");

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x020307, 0.018);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const camera = new THREE.PerspectiveCamera(
  48,
  window.innerWidth / window.innerHeight,
  0.1,
  220
);

function fitCameraToViewport() {
  const narrow = window.innerWidth < 760;
  camera.fov = narrow ? 60 : 48;
  camera.position.set(0, narrow ? 5.5 : 4.7, narrow ? 14.2 : 10.5);
  camera.updateProjectionMatrix();
}

fitCameraToViewport();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 5;
controls.maxDistance = 26;
controls.target.set(0, 0.2, 0);
controls.autoRotate = true;
controls.autoRotateSpeed = 0.34;

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.58,
  0.38,
  0.68
);

composer.addPass(renderPass);
composer.addPass(bloomPass);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.setSize(window.innerWidth, window.innerHeight);

function tuneBloomForViewport() {
  const narrow = window.innerWidth < 760;
  bloomPass.strength = narrow ? 0.44 : 0.58;
  bloomPass.radius = narrow ? 0.32 : 0.38;
  bloomPass.threshold = narrow ? 0.72 : 0.68;
}

tuneBloomForViewport();

scene.add(new THREE.AmbientLight(0x6f8790, 0.28));

const clock = new THREE.Clock();
const uniforms = {
  time: { value: 0 },
  diskSpeed: { value: Number(diskSpeedInput.value) },
  lensPower: { value: Number(lensPowerInput.value) },
  detailPower: { value: Number(detailPowerInput.value) },
};

function createStarfield() {
  const count = 9800;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const color = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const radius = 45 + Math.random() * 140;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    const index = i * 3;

    positions[index] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index + 1] = radius * Math.cos(phi);
    positions[index + 2] = radius * Math.sin(phi) * Math.sin(theta);

    const warmStar = Math.random() > 0.72;
    color.setHSL(
      warmStar ? 0.09 + Math.random() * 0.08 : 0.55 + Math.random() * 0.14,
      warmStar ? 0.38 : 0.26,
      0.62 + Math.random() * 0.34
    );
    colors[index] = color.r;
    colors[index + 1] = color.g;
    colors[index + 2] = color.b;
    sizes[i] = 0.45 + Math.random() * 2.4;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    uniforms,
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      varying float vDepth;

      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vDepth = clamp((-mvPosition.z - 20.0) / 140.0, 0.0, 1.0);
        gl_PointSize = size * (145.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vDepth;
      uniform float time;

      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p);
        float alpha = smoothstep(0.5, 0.0, d);
        float twinkle = 0.72 + 0.28 * sin(time * 1.7 + vDepth * 38.0);
        gl_FragColor = vec4(vColor * twinkle, alpha * (0.55 + vDepth * 0.45));
      }
    `,
  });

  return new THREE.Points(geometry, material);
}

function createAccretionDisk(innerRadius, outerRadius, radialSegments, angularSegments) {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let r = 0; r <= radialSegments; r += 1) {
    const radius = THREE.MathUtils.lerp(innerRadius, outerRadius, r / radialSegments);
    for (let a = 0; a <= angularSegments; a += 1) {
      const angle = (a / angularSegments) * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      uvs.push(r / radialSegments, a / angularSegments);
    }
  }

  const stride = angularSegments + 1;
  for (let r = 0; r < radialSegments; r += 1) {
    for (let a = 0; a < angularSegments; a += 1) {
      const current = r * stride + a;
      const next = current + stride;
      indices.push(current, next, current + 1);
      indices.push(next, next + 1, current + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createDiskSparks() {
  const count = 1350;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const color = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const radius = 1.85 + Math.pow(Math.random(), 1.8) * 5.8;
    const angle = Math.random() * Math.PI * 2;
    const index = i * 3;
    positions[index] = Math.cos(angle) * radius;
    positions[index + 1] = THREE.MathUtils.randFloatSpread(0.18);
    positions[index + 2] = Math.sin(angle) * radius;
    color.setHSL(0.08 + Math.random() * 0.06, 0.86, 0.48 + Math.random() * 0.26);
    colors[index] = color.r;
    colors[index + 1] = color.g;
    colors[index + 2] = color.b;
    sizes[i] = 0.38 + Math.random() * 1.45;
    phases[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("phase", new THREE.BufferAttribute(phases, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    uniforms,
    vertexShader: `
      attribute float size;
      attribute float phase;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float time;
      uniform float diskSpeed;
      uniform float detailPower;

      void main() {
        vec3 pos = position;
        float radius = length(pos.xz);
        float angle = atan(pos.z, pos.x);
        angle += time * diskSpeed * (0.18 + 1.7 / radius) + phase * 0.03;
        pos.xz = vec2(cos(angle), sin(angle)) * radius;
        pos.y += sin(time * diskSpeed * 2.0 + phase + radius) * 0.06 * detailPower;
        vColor = color;
        vAlpha = smoothstep(7.8, 1.7, radius) * (0.22 + detailPower * 0.18);
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = size * (115.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p);
        float core = smoothstep(0.5, 0.02, d);
        gl_FragColor = vec4(vColor * (0.95 + core * 0.78), core * vAlpha);
      }
    `,
  });

  return new THREE.Points(geometry, material);
}

function createLensedTorus(radius, tube, opacity, colorA, colorB) {
  return new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 16, 360),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        time: uniforms.time,
        lensPower: uniforms.lensPower,
        detailPower: uniforms.detailPower,
        colorA: { value: new THREE.Color(colorA) },
        colorB: { value: new THREE.Color(colorB) },
        opacity: { value: opacity },
      },
      vertexShader: `
        varying vec3 vWorld;

        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorld = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vWorld;
        uniform float time;
        uniform float lensPower;
        uniform float detailPower;
        uniform vec3 colorA;
        uniform vec3 colorB;
        uniform float opacity;

        void main() {
          float angle = atan(vWorld.z, vWorld.x);
          float bead = pow(sin(angle * 24.0 - time * 2.2) * 0.5 + 0.5, 3.0);
          float caustic = sin(angle * 5.0 + time * 0.35) * 0.5 + 0.5;
          float rearBoost = smoothstep(-0.35, 0.75, vWorld.y + 0.2);
          vec3 color = mix(colorA, colorB, caustic + bead * 0.28);
          gl_FragColor = vec4(color * (1.15 + bead * detailPower), opacity * lensPower * (0.72 + rearBoost * 0.42));
        }
      `,
    })
  );
}

const starfield = createStarfield();
scene.add(starfield);

const eventHorizon = new THREE.Mesh(
  new THREE.SphereGeometry(1.38, 96, 96),
  new THREE.MeshBasicMaterial({ color: 0x000000 })
);
scene.add(eventHorizon);

const shadowRim = new THREE.Mesh(
  new THREE.SphereGeometry(1.43, 96, 96),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(cameraPosition - worldPosition.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vView;

      void main() {
        float fresnel = pow(1.0 - abs(dot(vNormal, vView)), 3.0);
        vec3 color = mix(vec3(0.1, 0.32, 0.46), vec3(1.0, 0.58, 0.16), fresnel);
        gl_FragColor = vec4(color, fresnel * 0.42);
      }
    `,
  })
);
scene.add(shadowRim);

const diskGeometry = createAccretionDisk(1.66, 8.35, 112, 620);
const diskMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  uniforms,
  vertexShader: `
    varying vec2 vUv;
    varying float vRadius;
    varying float vSide;
    varying float vDoppler;
    varying float vBend;
    uniform float time;
    uniform float diskSpeed;
    uniform float lensPower;
    uniform float detailPower;

    void main() {
      vUv = uv;
      vec3 pos = position;
      float radius = length(pos.xz);
      float angle = atan(pos.z, pos.x);
      float innerPull = exp(-abs(radius - 2.02) * 1.15);
      float bend = innerPull * lensPower;
      float corrugation =
        sin(angle * 5.0 + time * diskSpeed * 1.7) * 0.035 +
        sin(angle * 11.0 - radius * 2.6 - time * diskSpeed * 2.1) * 0.018;
      float verticalLens = sin(angle) * bend * (0.5 + detailPower * 0.16);
      pos.y += verticalLens + corrugation * detailPower;
      pos.xz *= 1.0 + bend * (0.042 + detailPower * 0.018);
      vRadius = radius;
      vSide = sin(angle);
      vDoppler = cos(angle - 0.38);
      vBend = bend;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    varying float vRadius;
    varying float vSide;
    varying float vDoppler;
    varying float vBend;
    uniform float time;
    uniform float diskSpeed;
    uniform float detailPower;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      for (int i = 0; i < 5; i++) {
        value += amplitude * noise(p);
        p *= 2.03;
        amplitude *= 0.52;
      }
      return value;
    }

    void main() {
      float radial = vUv.x;
      float angle = vUv.y;
      float swirl = time * diskSpeed;
      float shear = 2.2 + pow(1.0 - radial, 2.0) * 7.2;
      float flow = angle * 46.0 - swirl * shear + radial * 8.0;
      float fineFlow = angle * 118.0 + radial * 34.0 - swirl * 6.5;
      float bands = sin(flow) * 0.5 + 0.5;
      float filaments = pow(sin(fineFlow) * 0.5 + 0.5, 3.2);
      float turbulence = fbm(vec2(angle * 82.0 - swirl * 3.4, radial * 18.0 + swirl * 0.18));
      float clumps = smoothstep(0.58, 0.95, fbm(vec2(angle * 36.0 + swirl * 0.8, radial * 24.0)));
      float innerHeat = pow(1.0 - radial, 3.0);
      float innerRim = smoothstep(0.03, 0.12, radial) * smoothstep(0.28, 0.1, radial);
      float outerFade = smoothstep(1.0, 0.12, radial);
      float innerFade = smoothstep(0.0, 0.07, radial);
      float doppler = smoothstep(-0.75, 1.0, vDoppler);
      float lensBoost = 0.85 + vBend * 1.6;
      float structure =
        0.18 +
        bands * 0.24 +
        filaments * 0.22 * detailPower +
        turbulence * 0.36 +
        clumps * 0.28 * detailPower;
      float alpha = outerFade * innerFade * structure;
      alpha *= 0.48 + max(vSide, 0.0) * 0.4 + doppler * 0.28;
      alpha += innerRim * (0.22 + detailPower * 0.18);

      vec3 redShift = vec3(0.86, 0.1, 0.025);
      vec3 amber = vec3(1.0, 0.48, 0.07);
      vec3 whiteHot = vec3(1.0, 0.93, 0.68);
      vec3 blueShift = vec3(0.52, 0.82, 1.0);
      vec3 color = mix(redShift, amber, radial);
      color = mix(color, whiteHot, innerHeat * 1.08 + innerRim * 0.8);
      color = mix(color, blueShift, doppler * (0.18 + innerHeat * 0.34));
      color *= lensBoost * (1.08 + turbulence * 1.35 + filaments * detailPower * 0.8 + innerHeat * 2.3);

      gl_FragColor = vec4(color, alpha);
    }
  `,
});
const disk = new THREE.Mesh(diskGeometry, diskMaterial);
disk.rotation.x = -0.08;
scene.add(disk);

const diskSparks = createDiskSparks();
diskSparks.rotation.x = disk.rotation.x;
scene.add(diskSparks);

const upperArc = new THREE.Mesh(
  new THREE.TorusGeometry(1.98, 0.055, 12, 256, Math.PI * 2),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms,
    vertexShader: `
      varying vec3 vWorld;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorld = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      uniform float time;
      uniform float lensPower;

      void main() {
        float angle = atan(vWorld.z, vWorld.x);
        float pulse = sin(angle * 18.0 - time * 3.0) * 0.5 + 0.5;
        float backArc = smoothstep(-0.1, 0.75, vWorld.y + 0.28);
        vec3 color = mix(vec3(0.95, 0.16, 0.04), vec3(1.0, 0.86, 0.45), pulse);
        gl_FragColor = vec4(color * (1.6 + lensPower), backArc * 0.58 * lensPower);
      }
    `,
  })
);
upperArc.rotation.x = Math.PI / 2.22;
upperArc.scale.set(1.15, 1.15, 0.52);
scene.add(upperArc);

const photonRing = new THREE.Mesh(
  new THREE.TorusGeometry(1.52, 0.026, 10, 256),
  new THREE.MeshBasicMaterial({
    color: 0xffd38c,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
photonRing.rotation.x = Math.PI / 2;
scene.add(photonRing);

const innerCaustic = createLensedTorus(1.62, 0.012, 0.4, 0xffefe0, 0x7fcaff);
innerCaustic.rotation.x = Math.PI / 2.02;
innerCaustic.scale.set(1.04, 1.04, 0.38);
scene.add(innerCaustic);

const outerCaustic = createLensedTorus(2.23, 0.018, 0.22, 0xff9a2e, 0x8bd8ff);
outerCaustic.rotation.x = Math.PI / 2.18;
outerCaustic.scale.set(1.22, 1.22, 0.48);
scene.add(outerCaustic);

const farCaustic = createLensedTorus(3.08, 0.011, 0.14, 0xff6f1a, 0x5ca7c9);
farCaustic.rotation.x = Math.PI / 2.38;
farCaustic.scale.set(1.42, 1.42, 0.36);
scene.add(farCaustic);

const lensPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(5.25, 5.25, 1, 1),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms,
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float time;
      uniform float lensPower;
      uniform float detailPower;

      void main() {
        vec2 p = vUv - 0.5;
        float d = length(p) * 2.0;
        float angle = atan(p.y, p.x);
        float ring = smoothstep(0.96, 0.74, d) * smoothstep(0.42, 0.58, d);
        float innerGlow = smoothstep(0.72, 0.5, d) * smoothstep(0.18, 0.34, d);
        float caustic = sin(angle * 11.0 + time * 0.58) * 0.5 + 0.5;
        float fine = pow(sin(angle * 31.0 - time * 1.2) * 0.5 + 0.5, 4.0);
        vec3 color = mix(vec3(0.07, 0.36, 0.55), vec3(1.0, 0.64, 0.23), caustic);
        color = mix(color, vec3(0.78, 0.9, 1.0), fine * 0.22);
        float alpha = (ring * 0.16 + innerGlow * 0.07 + fine * ring * 0.06 * detailPower) * lensPower;
        gl_FragColor = vec4(color * (0.46 + lensPower * 0.78), alpha);
      }
    `,
  })
);
scene.add(lensPlane);

const jetsMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms,
  side: THREE.DoubleSide,
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    uniform float time;

    void main() {
      vec2 p = vUv - vec2(0.5, 0.0);
      float core = smoothstep(0.48, 0.0, abs(p.x));
      float fade = smoothstep(1.0, 0.08, vUv.y);
      float streak = sin(vUv.y * 38.0 - time * 2.4) * 0.5 + 0.5;
      vec3 color = vec3(0.28, 0.76, 1.0) * (0.4 + streak * 0.45);
      gl_FragColor = vec4(color, core * fade * 0.16);
    }
  `,
});

const jetGeometry = new THREE.ConeGeometry(0.36, 10, 48, 1, true);
const topJet = new THREE.Mesh(jetGeometry, jetsMaterial);
topJet.position.y = 5;
scene.add(topJet);

const bottomJet = topJet.clone();
bottomJet.rotation.z = Math.PI;
bottomJet.position.y = -5;
scene.add(bottomJet);

diskSpeedInput.addEventListener("input", () => {
  uniforms.diskSpeed.value = Number(diskSpeedInput.value);
  readout.textContent = `${uniforms.diskSpeed.value.toFixed(2)}x`;
});

lensPowerInput.addEventListener("input", () => {
  uniforms.lensPower.value = Number(lensPowerInput.value);
});

detailPowerInput.addEventListener("input", () => {
  uniforms.detailPower.value = Number(detailPowerInput.value);
});

orbitButton.addEventListener("click", () => {
  controls.autoRotate = !controls.autoRotate;
  orbitButton.setAttribute("aria-pressed", String(controls.autoRotate));
  orbitButton.textContent = controls.autoRotate ? "暂停轨道" : "恢复轨道";
});

window.addEventListener("resize", () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  camera.aspect = width / height;
  fitCameraToViewport();
  tuneBloomForViewport();
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);
});

function animate() {
  const elapsed = clock.getElapsedTime();
  uniforms.time.value = elapsed;
  starfield.rotation.y = elapsed * 0.006;
  disk.rotation.y = elapsed * uniforms.diskSpeed.value * 0.1;
  diskSparks.rotation.y = elapsed * uniforms.diskSpeed.value * 0.16;
  photonRing.rotation.z = elapsed * 0.16;
  upperArc.rotation.z = elapsed * 0.04;
  innerCaustic.rotation.z = elapsed * 0.1;
  outerCaustic.rotation.z = -elapsed * 0.045;
  farCaustic.rotation.z = elapsed * 0.026;
  lensPlane.quaternion.copy(camera.quaternion);
  controls.update();
  composer.render();
  requestAnimationFrame(animate);
}

animate();
