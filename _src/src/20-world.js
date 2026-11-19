/* ==========================================================
   20 · 街区世界构建：路面 / 楼体 / 霓虹 / 道具 / 蒸汽
   ========================================================== */
const world = new T.Group();
scene.add(world);
NR.world = world;

const NEON = [
  '#3fe0ff', '#ff2f8e', '#ffb02e', '#8b5cff', '#2bffb0', '#ff5c3d', '#c9f0ff',
];
const SIGN_TEXT = [
  '拉面', '电子', '义体诊所', 'DATA', '九黎', '夜行', '霓虹酒廊', '24H',
  'CYBER', '赛博', '当铺', 'NOODLE', '修理', '黑市', '茶', '代碼',
  'RAMEN', 'BAR', '易物', '网吧',
];

/* 湿地倒影纹理：u=0 侧最亮，向 u=1 衰减 */
function makeReflTex(flip) {
  const tex = canvasTex(256, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.16, 'rgba(255,255,255,0.52)');
    g.addColorStop(0.48, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const r = mulberry32(7788);
    for (let i = 0; i < 64; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.10 + r() * 0.34})`;
      ctx.fillRect(0, r() * h, w, 1 + r() * 3);
    }
  }, { repeat: [1, 1] });
  if (flip) { tex.repeat.x = -1; tex.offset.x = 1; tex.needsUpdate = true; }
  return tex;
}
const reflTex = makeReflTex(false);
const reflTexFlipped = makeReflTex(true);

const sharedBox = new T.BoxGeometry(1, 1, 1);
const box = (mat) => new T.Mesh(sharedBox, mat);
NR.sharedBox = sharedBox;
NR.box = box;

/* ---------------- 路面 ---------------- */
const asphalt = NR.buildAsphalt();
const roadMat = new T.MeshStandardMaterial({
  map: asphalt.map,
  normalMap: asphalt.normalMap,
  normalScale: new T.Vector2(1.1, 1.1),
  roughnessMap: asphalt.roughnessMap,
  roughness: 1.0,
  metalness: 0.62,
  color: 0x8a94a8,
  envMapIntensity: 1.35,
});
const road = new T.Mesh(new T.PlaneGeometry(46, 150), roadMat);
road.rotation.x = -Math.PI / 2;
road.position.set(0, 0, -35);
road.receiveShadow = true;
world.add(road);
NR.road = road;

/* 人行道 + 路缘 */
const curbMat = new T.MeshStandardMaterial({ color: 0x2c3340, roughness: 0.72, metalness: 0.28, envMapIntensity: 0.9 });
const curbTopMat = new T.MeshStandardMaterial({ color: 0x3a4252, roughness: 0.6, metalness: 0.35, envMapIntensity: 1.0 });
for (const s of [-1, 1]) {
  const walk = box(curbTopMat);
  walk.scale.set(3.2, 0.16, 150);
  walk.position.set(s * 8.3, 0.08, -35);
  walk.receiveShadow = true;
  world.add(walk);

  const edge = box(curbMat);
  edge.scale.set(0.22, 0.2, 150);
  edge.position.set(s * 6.75, 0.1, -35);
  world.add(edge);
}

/* ---------------- 楼体生成 ---------------- */
const concrete = NR.buildConcrete([3, 3]);
const wallMats = [0x1a1f2b, 0x161a24, 0x232a38, 0x12161f].map(
  (c) => new T.MeshStandardMaterial({
    map: concrete.map,
    normalMap: concrete.normalMap,
    normalScale: new T.Vector2(0.7, 0.7),
    color: c,
    roughness: 0.88,
    metalness: 0.16,
    envMapIntensity: 0.75,
  })
);

const buildingMeshes = [];
const signAnchors = [];
const signLights = [];

function makeBuilding(side, z, width, height, depth) {
  const x = side * (7.2 + depth / 2);
  const g = new T.Group();
  g.position.set(x, 0, z);

  const body = box(wallMats[randInt(0, wallMats.length - 1)]);
  body.scale.set(depth, height, width);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // 朝街面的窗墙
  const wtex = NR.buildWindows(randInt(1, 99999));
  const repsX = Math.max(1, Math.round(width / 4.5));
  const repsY = Math.max(1, Math.round(height / 11));
  wtex.map.repeat.set(repsX, repsY);
  wtex.emissiveMap.repeat.set(repsX, repsY);
  const windowMat = new T.MeshStandardMaterial({
    map: wtex.map,
    emissiveMap: wtex.emissiveMap,
    emissive: new T.Color(0xffcf9a),
    emissiveIntensity: 0.30,
    roughness: 0.5,
    metalness: 0.3,
    envMapIntensity: 0.8,
    color: 0x3f4759,
  });
  const windowFace = new T.Mesh(new T.PlaneGeometry(width - 0.3, height - 0.4), windowMat);
  windowFace.position.set(-side * (depth / 2 + 0.04), height / 2, 0);
  windowFace.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  windowFace.receiveShadow = true;
  g.add(windowFace);

  // 屋檐 / 女儿墙
  const cap = box(wallMats[0]);
  cap.scale.set(depth + 0.5, 0.5, width + 0.5);
  cap.position.y = height + 0.2;
  cap.castShadow = true;
  g.add(cap);

  // 顶部灯管轮廓
  if (rnd() < 0.62) {
    const c = pick(NEON);
    const tubeMat = new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(1.4), toneMapped: false });
    const tube = box(tubeMat);
    tube.scale.set(0.07, 0.07, width + 0.4);
    tube.position.set(-side * (depth / 2 + 0.12), height - 0.35, 0);
    g.add(tube);
  }

  // 垂直霓虹灯管
  if (rnd() < 0.42) {
    const tc = pick(NEON);
    const tubeMat2 = new T.MeshBasicMaterial({ color: new T.Color(tc).multiplyScalar(1.05), toneMapped: false });
    const vt = box(tubeMat2);
    const vh = height * rand(0.32, 0.68);
    vt.scale.set(0.055, vh, 0.055);
    vt.position.set(-side * (depth / 2 + 0.14), rand(vh * 0.55, height - vh * 0.6), rand(-width / 2 + 0.6, width / 2 - 0.6));
    g.add(vt);
  }

  // 空调外机
  const acMat = new T.MeshStandardMaterial({ color: 0x4a5260, roughness: 0.55, metalness: 0.7, envMapIntensity: 1.2 });
  const acCount = randInt(1, 4);
  for (let i = 0; i < acCount; i++) {
    const ac = box(acMat);
    ac.scale.set(0.42, 0.5, 0.72);
    ac.position.set(
      -side * (depth / 2 + 0.22),
      rand(3, Math.max(4, height - 2)),
      rand(-width / 2 + 1, width / 2 - 1)
    );
    ac.castShadow = true;
    g.add(ac);
    const fan = box(new T.MeshStandardMaterial({ color: 0x181c22, roughness: 0.9 }));
    fan.scale.set(0.44, 0.06, 0.44);
    fan.position.copy(ac.position).add(new T.Vector3(-side * 0.21, 0.14, 0));
    g.add(fan);
  }

  // 排水管
  if (rnd() < 0.5) {
    const pipeMat = new T.MeshStandardMaterial({ color: 0x2f3540, roughness: 0.45, metalness: 0.85, envMapIntensity: 1.3 });
    const pipe = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, height, 8), pipeMat);
    pipe.position.set(-side * (depth / 2 + 0.13), height / 2, width / 2 - 0.6);
    pipe.castShadow = true;
    g.add(pipe);
  }

  world.add(g);
  buildingMeshes.push(g);
  return { g, x, z, width, height, depth, side };
}

const buildings = [];
for (const side of [-1, 1]) {
  let z = 24;
  while (z > -86) {
    const width = rand(6.5, 12.5);
    const depth = rand(7, 13);
    const height = rand(9, 30) * (rnd() < 0.18 ? 1.45 : 1);
    const b = makeBuilding(side, z - width / 2, width, height, depth);
    buildings.push(b);
    z -= width + rand(0.2, 1.6);
  }
}

/* 街道尽头：横向楼 + 远景剪影 */
{
  const endMat = wallMats[2];
  const endB = box(endMat);
  endB.scale.set(40, 26, 16);
  endB.position.set(0, 13, -96);
  endB.receiveShadow = true;
  world.add(endB);

  for (let i = 0; i < 14; i++) {
    const far = box(new T.MeshStandardMaterial({
      color: 0x090d15, roughness: 1, metalness: 0.1,
      emissive: new T.Color(0x0d1626), emissiveIntensity: 0.6,
    }));
    const w = rand(6, 16), h = rand(18, 62);
    far.scale.set(w, h, w * 0.8);
    far.position.set(rand(-70, 70), h / 2, rand(-150, -108));
    world.add(far);
  }
}

/* ---------------- 霓虹招牌 ---------------- */
const neonGroup = new T.Group();
world.add(neonGroup);

function addSign(b, y, projecting) {
  const text = pick(SIGN_TEXT);
  const color = pick(NEON);
  const s = NR.buildSign(text, color, randInt(1, 999999));
  const h = s.vertical ? rand(2.3, 3.5) : rand(0.9, 1.45);
  const w = h * s.aspect;

  const geo = new T.PlaneGeometry(w, h);
  const makeMat = (tex) => {
    const m = new T.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: T.FrontSide,
      toneMapped: false,
      depthWrite: false,
    });
    m.color.setRGB(1.55, 1.55, 1.55);
    return m;
  };
  const mesh = new T.Mesh(geo, makeMat(s.map));
  mesh.renderOrder = 5;

  // 招牌底板
  const back = new T.Mesh(
    new T.PlaneGeometry(w * 1.1, h * 1.12),
    new T.MeshBasicMaterial({
      color: 0x03050a,
      transparent: true,
      opacity: 0.78,
      side: T.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    })
  );
  back.renderOrder = 4;

  const streetX = b.x - b.side * (b.depth / 2 + 0.1);

  if (projecting) {
    mesh.position.set(streetX - b.side * (w * 0.42), y, b.z + rand(-0.1, 0.1));
    mesh.rotation.y = 0;
  } else {
    mesh.position.set(streetX - b.side * 0.06, y, b.z + rand(-b.width * 0.3, b.width * 0.3));
    mesh.rotation.y = b.side > 0 ? -Math.PI / 2 : Math.PI / 2;
  }
  neonGroup.add(mesh);

  back.position.copy(mesh.position);
  back.rotation.copy(mesh.rotation);
  back.translateZ(-0.014);
  neonGroup.add(back);

  // 伸出式招牌：另一面用翻转贴图，两面文字都正着读
  if (projecting) {
    const flipMesh = new T.Mesh(geo, makeMat(s.mapFlipped));
    flipMesh.position.copy(mesh.position);
    flipMesh.rotation.y = Math.PI;
    flipMesh.renderOrder = 5;
    neonGroup.add(flipMesh);
  }

  // 湿地面倒影：从墙脚向街心拖出的一条彩色光带
  if (reflTex) {
    const rw = rand(3.8, 7.5);      // 沿 x 延伸
    const rd = rand(0.9, 2.2);      // 沿 z 宽度
    const refMat = new T.MeshBasicMaterial({
      map: reflTex,
      color: new T.Color(color),
      transparent: true,
      opacity: rand(0.10, 0.24),
      blending: T.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: T.DoubleSide,
    });
    if (b.side > 0) { refMat.map = reflTexFlipped; }
    const ref = new T.Mesh(new T.PlaneGeometry(rw, rd), refMat);
    ref.rotation.x = -Math.PI / 2;
    ref.position.set(streetX - b.side * rw * 0.5, 0.028, mesh.position.z + rand(-0.4, 0.4));
    ref.renderOrder = 2;
    world.add(ref);
  }

  // 灯架
  if (projecting) {
    const barMat = new T.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.5, metalness: 0.9 });
    const bar = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, w * 0.9, 6), barMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(mesh.position.x + b.side * w * 0.42, y + h / 2 - 0.06, mesh.position.z);
    neonGroup.add(bar);
  }

  signAnchors.push({ mesh, color: new T.Color(color) });

  // 招牌把光洒到墙面与地面（限量，控制灯光数量）
  if (signLights.length < 9 && rnd() < 0.5) {
    const pl = new T.PointLight(new T.Color(color), 2.1, 7.5, 2.0);
    pl.position.set(mesh.position.x - b.side * 0.55, y - 0.15, mesh.position.z);
    scene.add(pl);
    signLights.push(pl);
  }
  return mesh;
}

for (const b of buildings) {
  const n = randInt(1, 3);
  for (let i = 0; i < n; i++) {
    const y = rand(2.6, Math.min(b.height - 1.5, 9.5));
    addSign(b, y, rnd() < 0.45);
  }
}

/* 店面门脸：底层发光橱窗 */
for (const b of buildings) {
  if (rnd() < 0.35) continue;
  const col = pick(NEON);
  const w = Math.min(b.width * 0.72, 6);
  const h = rand(1.9, 2.6);
  const mat = new T.MeshBasicMaterial({
    color: new T.Color(col).multiplyScalar(0.62),
    toneMapped: false,
    transparent: true,
    opacity: 0.92,
  });
  const shop = new T.Mesh(new T.PlaneGeometry(w, h), mat);
  shop.position.set(b.x - b.side * (b.depth / 2 + 0.09), h / 2 + 0.3, b.z + rand(-0.6, 0.6));
  shop.rotation.y = b.side > 0 ? -Math.PI / 2 : Math.PI / 2;
  neonGroup.add(shop);

  // 门框
  const frameMat = new T.MeshStandardMaterial({ color: 0x0e1118, roughness: 0.6, metalness: 0.7 });
  const frame = box(frameMat);
  frame.scale.set(0.14, h + 0.34, w + 0.3);
  frame.position.set(b.x - b.side * (b.depth / 2 + 0.03), (h + 0.34) / 2 + 0.15, shop.position.z);
  neonGroup.add(frame);
}

/* ---------------- 街灯 ---------------- */
const lampPositions = [];
for (let i = 0; i < 5; i++) {
  const side = i % 2 === 0 ? -1 : 1;
  const z = 12 - i * 21;
  const g = new T.Group();
  g.position.set(side * 6.4, 0, z);

  const poleMat = new T.MeshStandardMaterial({ color: 0x252b36, roughness: 0.42, metalness: 1.0, envMapIntensity: 1.4 });
  const pole = new T.Mesh(new T.CylinderGeometry(0.075, 0.11, 6.4, 10), poleMat);
  pole.position.y = 3.2;
  pole.castShadow = true;
  g.add(pole);

  const arm = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 1.5, 8), poleMat);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(-side * 0.75, 6.3, 0);
  g.add(arm);

  const bulbMat = new T.MeshBasicMaterial({ color: new T.Color(0xffd7a0).multiplyScalar(2.6), toneMapped: false });
  const bulb = new T.Mesh(new T.SphereGeometry(0.17, 12, 10), bulbMat);
  bulb.position.set(-side * 1.45, 6.16, 0);
  g.add(bulb);

  const shade = new T.Mesh(new T.ConeGeometry(0.32, 0.28, 12, 1, true), poleMat);
  shade.position.set(-side * 1.45, 6.34, 0);
  shade.rotation.x = Math.PI;
  g.add(shade);

  world.add(g);
  lampPositions.push({ x: side * 6.4, z, lightX: -side * 1.45 });
}

/* ---------------- 跨街电缆 ---------------- */
{
  const cableMat = new T.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.85, metalness: 0.2 });
  for (let i = 0; i < 7; i++) {
    const z = rand(14, -70);
    const y = rand(7, 13);
    const sag = rand(0.5, 1.6);
    const curve = new T.CatmullRomCurve3([
      new T.Vector3(-16, y, z),
      new T.Vector3(-5, y - sag * 0.75, z + rand(-0.6, 0.6)),
      new T.Vector3(0, y - sag, z + rand(-0.6, 0.6)),
      new T.Vector3(5, y - sag * 0.75, z + rand(-0.6, 0.6)),
      new T.Vector3(16, y, z),
    ]);
    const tube = new T.Mesh(new T.TubeGeometry(curve, 26, 0.022, 4, false), cableMat);
    world.add(tube);
  }
}

/* ---------------- 地面杂物 ---------------- */
{
  const crateMat = new T.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.78, metalness: 0.3, envMapIntensity: 0.9 });
  const drumMats = [0x7a3b2a, 0x2a4a6a, 0x3a3f22].map(
    (c) => new T.MeshStandardMaterial({ color: c, roughness: 0.68, metalness: 0.55, envMapIntensity: 1.0 })
  );

  for (let i = 0; i < 26; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const z = rand(18, -70);
    const x = side * rand(6.9, 8.6);
    const kind = rnd();
    if (kind < 0.55) {
      const c = box(crateMat);
      const s = rand(0.45, 0.95);
      c.scale.set(s, s * rand(0.7, 1.1), s);
      c.position.set(x, s * 0.5 + 0.16, z);
      c.rotation.y = rand(0, Math.PI);
      c.castShadow = true; c.receiveShadow = true;
      world.add(c);
    } else if (kind < 0.85) {
      const d = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 0.92, 14), pick(drumMats));
      d.position.set(x, 0.62, z);
      d.rotation.y = rand(0, Math.PI);
      d.castShadow = true; d.receiveShadow = true;
      world.add(d);
    } else {
      const bagMat = new T.MeshStandardMaterial({ color: 0x12151c, roughness: 0.95, metalness: 0.1 });
      const bag = new T.Mesh(new T.SphereGeometry(rand(0.3, 0.5), 10, 8), bagMat);
      bag.scale.y = 0.8;
      bag.position.set(x, 0.4, z);
      bag.castShadow = true;
      world.add(bag);
    }
  }
}

/* ---------------- 井盖 + 蒸汽 ---------------- */
const steamEmitters = [];
{
  const lidMat = new T.MeshStandardMaterial({ color: 0x1d222b, roughness: 0.62, metalness: 0.85, envMapIntensity: 1.1 });
  const positions = [[-2.6, 6], [1.8, -8], [-1.2, -26], [3.2, -44], [-3.4, -58]];
  for (const [x, z] of positions) {
    const lid = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 0.05, 18), lidMat);
    lid.position.set(x, 0.03, z);
    world.add(lid);
    steamEmitters.push(new T.Vector3(x, 0.1, z));
  }
}

/* ---------------- 水洼（高反射） ---------------- */
{
  const puddleMat = new T.MeshStandardMaterial({
    color: 0x1a2740,
    roughness: 0.05,
    metalness: 0.98,
    envMapIntensity: 3.0,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  for (let i = 0; i < 16; i++) {
    const w = rand(1.2, 4.2), h = rand(0.8, 2.6);
    const p = new T.Mesh(new T.CircleGeometry(1, 22), puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = rand(0, Math.PI);
    p.position.set(rand(-5.6, 5.6), 0.012, rand(18, -68));
    p.scale.set(w, h, 1);
    p.renderOrder = 2;
    world.add(p);
  }
}

/* ---------------- 地面霓虹反光斑 ---------------- */
{
  const glowTex = canvasTex(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.34)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, { repeat: [1, 1] });
  glowTex.wrapS = glowTex.wrapT = T.ClampToEdgeWrapping;

  for (const sp of signAnchors) {
    const m = new T.Mesh(
      new T.PlaneGeometry(1, 1),
      new T.MeshBasicMaterial({
        map: glowTex,
        color: sp.color.clone(),
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false,
        opacity: rand(0.07, 0.15),
        toneMapped: false,
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(sp.mesh.position.x * 0.55, 0.022, sp.mesh.position.z + rand(-1, 1));
    m.scale.set(rand(3, 6.5), rand(3.2, 7.5), 1);
    m.renderOrder = 1;
    world.add(m);
  }
}

/* ---------------- 霓虹光锥（伪体积光） ---------------- */
const cones = [];
{
  const coneVS = /* glsl */ `
    varying vec2 vUv;
    varying vec3 vPos;
    void main(){
      vUv = uv; vPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }`;
  const coneFS = /* glsl */ `
    uniform vec3 uColor;
    uniform float uIntensity;
    varying vec2 vUv;
    varying vec3 vPos;
    void main(){
      float h = clamp(vUv.y, 0.0, 1.0);
      float fade = pow(h, 1.35) * smoothstep(0.0, 0.22, h);
      float edge = smoothstep(0.0, 0.45, vUv.x) * smoothstep(1.0, 0.55, vUv.x);
      gl_FragColor = vec4(uColor * uIntensity * fade * (0.55 + edge*0.65), fade * 0.22);
    }`;

  for (const sp of signAnchors) {
    if (rnd() < 0.55) continue;
    const mat = new T.ShaderMaterial({
      uniforms: {
        uColor: { value: sp.color.clone() },
        uIntensity: { value: rand(0.045, 0.11) },
      },
      vertexShader: coneVS,
      fragmentShader: coneFS,
      transparent: true,
      blending: T.AdditiveBlending,
      depthWrite: false,
      side: T.DoubleSide,
    });
    const h = rand(3.5, 6.5);
    const cone = new T.Mesh(new T.ConeGeometry(rand(1.1, 2.2), h, 16, 1, true), mat);
    cone.position.copy(sp.mesh.position);
    cone.position.y = 0.1 + h / 2 - 0.2;
    cone.rotation.y = rand(0, Math.PI);
    cone.renderOrder = 3;
    world.add(cone);
    cones.push(cone);
  }
}

/* 街灯下的暖色光锥 */
for (const lp of lampPositions) {
  const mat = new T.ShaderMaterial({
    uniforms: { uColor: { value: new T.Color(0xffc98a) }, uIntensity: { value: 0.07 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vPos;
      void main(){ vUv=uv; vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uIntensity;
      varying vec2 vUv;
      void main(){
        float h = clamp(vUv.y,0.0,1.0);
        float fade = pow(h,1.5)*smoothstep(0.0,0.25,h);
        gl_FragColor = vec4(uColor*uIntensity*fade, fade*0.45);
      }`,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    side: T.DoubleSide,
  });
  const h = 9.5;
  const cone = new T.Mesh(new T.ConeGeometry(1.9, h, 18, 1, true), mat);
  cone.position.set(lp.x + lp.lightX, h / 2 + 1.4, lp.z);
  cone.renderOrder = 3;
  world.add(cone);
  cones.push(cone);
}

/* ---------------- 场景环境反射烘焙 ---------------- */
NR.bakeEnvironment = function () {
  const cubeRT = new T.WebGLCubeRenderTarget(256, { type: T.HalfFloatType });
  const cubeCam = new T.CubeCamera(0.3, 200, cubeRT);
  cubeCam.position.set(0, 4.5, 2);
  cubeCam.update(renderer, scene);
  const pmrem = new T.PMREMGenerator(renderer);
  pmrem.compileCubemapShader();
  const envMap = pmrem.fromCubemap(cubeRT.texture).texture;
  scene.environment = envMap;
  pmrem.dispose();
  cubeRT.dispose();
  return envMap;
};
