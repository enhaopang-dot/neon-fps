/* ==========================================================
   10 · 渲染核心：渲染器 / 相机 / 后处理 / 天空 / 环境光照
   ========================================================== */
const canvas = document.getElementById('scene');
const renderer = new T.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.16;
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;

const scene = new T.Scene();
scene.fog = new T.FogExp2(0x0c1728, 0.0155);

const camera = new T.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 520);
camera.position.set(0, 1.68, 16);

/* ---------------- 天空穹顶 ---------------- */
{
  const skyGeo = new T.SphereGeometry(450, 40, 24);
  const skyMat = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uTop: { value: new T.Color(0x03060f) },
      uHorizon: { value: new T.Color(0x14243d) },
      uGlow: { value: new T.Color(0x2a4a70) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uGlow;
      uniform float uTime;
      varying vec3 vWorld;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p);
        vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
                   mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
      }
      float fbm(vec2 p){
        float v=0.0, a=0.5;
        for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; }
        return v;
      }
      void main(){
        vec3 dir = normalize(vWorld);
        float h = clamp(dir.y*1.35, -0.2, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(clamp(h,0.0,1.0), 0.62));

        // 城市光污染：地平线暖光 + 两处强光晕
        float horizon = exp(-abs(dir.y)*7.5);
        col += uGlow * horizon * 0.85;
        vec2 hp = dir.xz * 2.2;
        float pol = fbm(hp*1.6 + 4.0);
        col += vec3(0.42,0.16,0.30) * horizon * smoothstep(0.45,0.95,pol) * 0.55;
        col += vec3(0.10,0.30,0.48) * horizon * smoothstep(0.5,1.0,fbm(hp*1.1+11.0)) * 0.4;

        // 低云层
        if(dir.y > 0.0){
          vec2 cp = dir.xz / max(dir.y, 0.06) * 1.1 + vec2(uTime*0.006, uTime*0.004);
          float c = fbm(cp*1.35);
          c = smoothstep(0.42, 0.92, c) * smoothstep(0.02, 0.30, dir.y);
          vec3 cloudCol = mix(vec3(0.045,0.06,0.10), vec3(0.28,0.20,0.30), fbm(cp*2.6));
          col = mix(col, cloudCol, c*0.72);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new T.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  scene.add(sky);
  NR.sky = sky;
}

/* ---------------- 基础光照 ---------------- */
scene.add(new T.AmbientLight(0x1b2c47, 0.85));

const hemi = new T.HemisphereLight(0x21395c, 0x0a0d14, 0.55);
scene.add(hemi);

// 一盏带阴影的主街灯，制造纵深与投影
const keyLight = new T.SpotLight(0x9fd8ff, 130, 46, Math.PI / 3.4, 0.55, 1.7);
keyLight.position.set(-5.5, 9.5, 6);
keyLight.target.position.set(-3, 0, 10);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 44;
keyLight.shadow.bias = -0.0009;
keyLight.shadow.normalBias = 0.035;
scene.add(keyLight, keyLight.target);

// 第二盏暖色辅助光（无阴影）
const warmLight = new T.PointLight(0xff8a3d, 42, 26, 2.0);
warmLight.position.set(6.2, 4.6, -6);
scene.add(warmLight);

const coolLight = new T.PointLight(0x35c8ff, 34, 24, 2.0);
coolLight.position.set(-6.4, 3.4, -14);
scene.add(coolLight);

NR.lights = { keyLight, warmLight, coolLight, hemi };

/* ---------------- 后处理 ---------------- */
const composer = new T.EffectComposer(renderer);
{
  const pr = renderer.getPixelRatio();
  const w = Math.floor(window.innerWidth * pr);
  const h = Math.floor(window.innerHeight * pr);
  composer.setSize(window.innerWidth, window.innerHeight);
}

const renderPass = new T.RenderPass(scene, camera);
composer.addPass(renderPass);

const bloom = new T.UnrealBloomPass(
  new T.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5),
  0.52,  // strength
  0.62,  // radius
  0.85   // threshold
);
composer.addPass(bloom);

const outputPass = new T.OutputPass();
composer.addPass(outputPass);

/* 调色 / 色差 / 暗角 / 颗粒 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 1.0 },
    uAberr: { value: 0.0016 },
    uGrain: { value: 0.055 },
    uExposureBoost: { value: 1.0 },
    uHurt: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uAberr, uGrain, uExposureBoost, uHurt;
    varying vec2 vUv;
    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c,c);
      float ab = uAberr * (0.35 + r2 * 2.6);

      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab).b;

      // 冷调色偏 + 轻微反差
      col *= vec3(0.99, 1.00, 1.045);
      col = (col - 0.5) * 1.045 + 0.5;
      col *= uExposureBoost;

      // 受击：红边
      col.r += uHurt * smoothstep(0.12, 0.5, r2) * 0.55;
      col.gb *= 1.0 - uHurt * smoothstep(0.1,0.5,r2) * 0.45;

      // 暗角
      float vig = smoothstep(1.02, 0.26, length(c) * 1.26);
      col *= mix(1.0, vig, uVignette);

      // 胶片颗粒
      float g = fract(sin(dot(uv * vec2(1281.3, 3317.7) + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * uGrain;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

const gradePass = new T.ShaderPass(GradeShader);
composer.addPass(gradePass);

/* 武器独立场景：避免近距透视畸变与穿墙 */
const weaponScene = new T.Scene();
const weaponCam = new T.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 20);
weaponScene.add(new T.AmbientLight(0x88a8cc, 0.55));

NR.core = { renderer, scene, camera, composer, bloom, gradePass, outputPass, weaponScene, weaponCam };

/* ---------------- 尺寸自适应 ---------------- */
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  weaponCam.aspect = w / h;
  weaponCam.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w * 0.5, h * 0.5);
}
window.addEventListener('resize', onResize);
