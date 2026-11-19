/* ==========================================================
   30 · 天气：雨丝 / 地面蒸汽 / 闪电
   ========================================================== */

/* ---------------- 雨 ---------------- */
const RAIN_COUNT = 16000;
const RAIN_R = 34;
const RAIN_H = 30;

{
  const base = new Float32Array(RAIN_COUNT * 3);
  const speed = new Float32Array(RAIN_COUNT);
  const size = new Float32Array(RAIN_COUNT);
  for (let i = 0; i < RAIN_COUNT; i++) {
    base[i * 3] = rand(-RAIN_R, RAIN_R);
    base[i * 3 + 1] = rand(0, RAIN_H);
    base[i * 3 + 2] = rand(-RAIN_R, RAIN_R);
    speed[i] = rand(16, 32);
    size[i] = rand(0.18, 0.52);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(base.slice(), 3));
  geo.setAttribute('aBase', new T.BufferAttribute(base, 3));
  geo.setAttribute('aSpeed', new T.BufferAttribute(speed, 1));
  geo.setAttribute('aSize', new T.BufferAttribute(size, 1));
  geo.boundingSphere = new T.Sphere(new T.Vector3(), 999);

  const mat = new T.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCam: { value: new T.Vector3() },
      uH: { value: RAIN_H },
      uR: { value: RAIN_R },
      uColor: { value: new T.Color(0xa8dcff) },
      uWind: { value: 0.22 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime, uH, uR, uWind;
      uniform vec3 uCam;
      attribute vec3 aBase;
      attribute float aSpeed;
      attribute float aSize;
      varying float vFade;
      void main(){
        vec3 p = aBase;
        p.x = mod(p.x - uCam.x + uR, 2.0*uR) - uR + uCam.x;
        p.z = mod(p.z - uCam.z + uR, 2.0*uR) - uR + uCam.z;
        float y = mod(aBase.y - uTime*aSpeed, uH);
        p.y = y;
        p.x += y * uWind;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        gl_PointSize = aSize * (200.0 / max(dist, 1.2));
        vFade = smoothstep(1.2, 5.0, dist) * smoothstep(uR*0.92, uR*0.22, dist);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vFade;
      void main(){
        vec2 pc = gl_PointCoord - vec2(0.5);
        float a = smoothstep(0.11, 0.015, abs(pc.x)) * smoothstep(0.53, 0.05, abs(pc.y));
        if(a < 0.02) discard;
        gl_FragColor = vec4(uColor, a * vFade * 0.34);
      }`,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });

  const rain = new T.Points(geo, mat);
  rain.frustumCulled = false;
  scene.add(rain);
  NR.rain = { mesh: rain, mat };
}

/* ---------------- 蒸汽 ---------------- */
{
  const COUNT = 420;
  const emitters = steamEmitters.length ? steamEmitters : [new T.Vector3(0, 0, 0)];
  const base = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const e = emitters[i % emitters.length];
    base[i * 3] = e.x + rand(-0.35, 0.35);
    base[i * 3 + 1] = 0.05;
    base[i * 3 + 2] = e.z + rand(-0.35, 0.35);
    seed[i] = rnd();
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(base.slice(), 3));
  geo.setAttribute('aBase', new T.BufferAttribute(base, 3));
  geo.setAttribute('aSeed', new T.BufferAttribute(seed, 1));
  geo.boundingSphere = new T.Sphere(new T.Vector3(), 999);

  const mat = new T.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new T.Color(0x9fc6e0) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute vec3 aBase;
      attribute float aSeed;
      varying float vA;
      void main(){
        float life = fract(uTime*0.10 + aSeed);
        vec3 p = aBase;
        p.y += life * 5.2;
        p.x += sin(aSeed*31.0 + uTime*0.5) * life * 0.9;
        p.z += cos(aSeed*17.0 + uTime*0.42) * life * 0.9;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        gl_PointSize = (0.22 + life * 0.62) * (300.0 / max(dist, 1.4));
        vA = smoothstep(0.0,0.14,life) * smoothstep(1.0,0.40,life) * smoothstep(55.0,10.0,dist) * 0.030;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vA;
      void main(){
        vec2 pc = gl_PointCoord - vec2(0.5);
        float d = length(pc);
        float a = smoothstep(0.5, 0.05, d) * vA;
        if(a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });

  const steam = new T.Points(geo, mat);
  steam.frustumCulled = false;
  scene.add(steam);
  NR.steam = { mesh: steam, mat };
}

/* ---------------- 闪电 ---------------- */
NR.lightning = { t: rand(6, 14), flash: 0 };
function updateWeather(t, dt) {
  NR.rain.mat.uniforms.uTime.value = t;
  NR.rain.mat.uniforms.uCam.value.copy(camera.position);
  NR.steam.mat.uniforms.uTime.value = t;

  // 闪电
  const L = NR.lightning;
  L.t -= dt;
  if (L.t <= 0) {
    L.t = rand(9, 22);
    L.flash = 1;
  }
  if (L.flash > 0) {
    L.flash = Math.max(0, L.flash - dt * 2.2);
    const f = L.flash * L.flash;
    hemi.intensity = 0.55 + f * 3.2;
    renderer.toneMappingExposure = 1.16 + f * 0.6;
  } else {
    hemi.intensity = 0.55;
    renderer.toneMappingExposure = 1.16;
  }
}
NR.updateWeather = updateWeather;
