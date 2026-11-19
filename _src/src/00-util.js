/* ==========================================================
   00 · 工具函数与程序化纹理生成
   全部离线生成，不加载任何外部资源
   ========================================================== */
const NR = (window.NR = {});
const T = window.THREE;

/* ---- 确定性随机 ---- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let RNG = mulberry32(20261119);
const rnd = () => RNG();
const rand = (a, b) => a + (b - a) * RNG();
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(RNG() * arr.length)];
NR.rand = rand; NR.randInt = randInt; NR.pick = pick; NR.rnd = rnd;

/* ---- 值噪声 / FBM ---- */
function valueNoise(size, cells, seed) {
  const g = new Float32Array(cells * cells);
  const r = mulberry32(seed);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(size * size);
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = sm(fx - x0), ty = sm(fy - y0);
      const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
      const c00 = x0 % cells, c01 = y0 % cells;
      const a = g[c01 * cells + c00] * (1 - tx) + g[c01 * cells + x1] * tx;
      const b = g[y1 * cells + c00] * (1 - tx) + g[y1 * cells + x1] * tx;
      out[y * size + x] = a * (1 - ty) + b * ty;
    }
  }
  return out;
}

function fbm(size, baseCells, octaves, seed, gain = 0.5) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0, cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(size, Math.min(cells, size), seed + o * 131);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp; amp *= gain; cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/* 高度图 -> 法线贴图 */
function normalFromHeight(h, size, strength) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xl = (x - 1 + size) % size, xr = (x + 1) % size;
      const yu = (y - 1 + size) % size, yd = (y + 1) % size;
      const l = h[y * size + xl], r = h[y * size + xr];
      const u = h[yu * size + x], d = h[yd * size + x];
      let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new T.DataTexture(data, size, size, T.RGBAFormat);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.magFilter = T.LinearFilter;
  tex.minFilter = T.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/* 高度图 -> 灰度 DataTexture（粗糙度等） */
function grayFromHeight(h, size, lo, hi, invert = false) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < h.length; i++) {
    let v = (h[i] - lo) / (hi - lo);
    v = Math.max(0, Math.min(1, v));
    if (invert) v = 1 - v;
    const b = v * 255;
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  const tex = new T.DataTexture(data, size, size, T.RGBAFormat);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.magFilter = T.LinearFilter;
  tex.minFilter = T.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/* Canvas 贴图通用封装 */
function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = T.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

NR.tex = { valueNoise, fbm, normalFromHeight, grayFromHeight, canvasTex };

/* ---------- 通用材质工厂：湿沥青 ---------- */
NR.buildAsphalt = function () {
  const S = 512;
  const h = fbm(S, 24, 5, 9911, 0.55);
  const grit = fbm(S, 160, 2, 4421, 0.5);
  for (let i = 0; i < h.length; i++) h[i] = h[i] * 0.72 + grit[i] * 0.28;
  const nrm = normalFromHeight(h, S, 2.6);

  // 粗糙度：低洼处（水）更光滑
  const rough = new Uint8Array(S * S * 4);
  for (let i = 0; i < h.length; i++) {
    const v = h[i];
    const r = v < 0.44 ? 0.10 : 0.86 - (v - 0.44) * 0.35;
    const b = Math.max(0, Math.min(1, r)) * 255;
    rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = b;
    rough[i * 4 + 3] = 255;
  }
  const roughTex = new T.DataTexture(rough, S, S, T.RGBAFormat);
  roughTex.wrapS = roughTex.wrapT = T.RepeatWrapping;
  roughTex.magFilter = T.LinearFilter;
  roughTex.minFilter = T.LinearMipmapLinearFilter;
  roughTex.generateMipmaps = true;
  roughTex.anisotropy = 8;
  roughTex.needsUpdate = true;

  const map = canvasTex(512, 512, (ctx, w, hh) => {
    const img = ctx.createImageData(w, hh);
    for (let i = 0; i < w * hh; i++) {
      const v = 14 + h[i] * 26;
      img.data[i * 4] = v * 0.92;
      img.data[i * 4 + 1] = v * 0.96;
      img.data[i * 4 + 2] = v * 1.12;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: [14, 14] });

  nrm.repeat.set(14, 14);
  roughTex.repeat.set(14, 14);
  return { map, normalMap: nrm, roughnessMap: roughTex };
};

/* ---------- 混凝土 / 墙面 ---------- */
NR.buildConcrete = function (rep = [2, 2]) {
  const S = 256;
  const h = fbm(S, 8, 5, 7717, 0.6);
  const fine = fbm(S, 96, 2, 3392, 0.5);
  for (let i = 0; i < h.length; i++) h[i] = h[i] * 0.8 + fine[i] * 0.2;
  const nrm = normalFromHeight(h, S, 1.5);
  const map = canvasTex(256, 256, (ctx, w, hh) => {
    const img = ctx.createImageData(w, hh);
    for (let i = 0; i < w * hh; i++) {
      const v = 30 + h[i] * 42;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v * 0.99;
      img.data[i * 4 + 2] = v * 0.97;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: rep });
  nrm.repeat.set(rep[0], rep[1]);
  return { map, normalMap: nrm };
};

/* ---------- 楼体窗户贴图（含自发光通道） ---------- */
NR.buildWindows = function (seed) {
  const r = mulberry32(seed);
  const W = 384, H = 640;
  const cols = 3, rows = 5;
  const cw = W / cols, ch = H / rows;
  const lit = [];
  const color = canvasTex(W, H, (ctx) => {
    // 墙体底色
    ctx.fillStyle = '#0c0f16';
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = x * cw + cw * 0.13, py = y * ch + ch * 0.20;
        const ww = cw * 0.74, wh = ch * 0.56;
        const on = r() < 0.24;
        const hue = r();
        if (on) {
          const col = hue < 0.55 ? [255, 206, 142] : hue < 0.80 ? [128, 196, 235] : [240, 158, 196];
          ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.35 + r() * 0.45})`;
        } else {
          ctx.fillStyle = `rgba(${14 + r() * 12},${18 + r() * 14},${28 + r() * 18},1)`;
        }
        ctx.fillRect(px, py, ww, wh);
        // 窗框
        ctx.strokeStyle = 'rgba(3,4,7,.92)';
        ctx.lineWidth = 4;
        ctx.strokeRect(px, py, ww, wh);
        // 窗棂
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px + ww / 2, py); ctx.lineTo(px + ww / 2, py + wh);
        ctx.moveTo(px, py + wh / 2); ctx.lineTo(px + ww, py + wh / 2);
        ctx.stroke();
        // 百叶
        if (on && r() < 0.45) {
          ctx.fillStyle = 'rgba(0,0,0,.30)';
          for (let k = 0; k < 7; k++) ctx.fillRect(px, py + (k * wh) / 7, ww, wh / 16);
        }
        lit.push(on ? 1 : 0);
      }
    }
    // 楼板分隔线（结构感的关键）
    ctx.fillStyle = 'rgba(6,8,12,.95)';
    for (let y = 0; y <= rows; y++) ctx.fillRect(0, y * ch - 5, W, 10);
    for (let x = 0; x <= cols; x++) ctx.fillRect(x * cw - 3, 0, 6, H);
    // 污渍
    for (let i = 0; i < 26; i++) {
      const gx = r() * W, gy = r() * H, gw = 6 + r() * 26;
      const g = ctx.createLinearGradient(gx, gy, gx, gy + 60 + r() * 90);
      g.addColorStop(0, 'rgba(0,0,0,.34)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(gx, gy, gw, 90 + r() * 80);
    }
  }, { repeat: [1, 1] });

  const emissive = canvasTex(W, H, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    let i = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (lit[i++]) {
          const px = x * cw + cw * 0.13, py = y * ch + ch * 0.20;
          ctx.fillStyle = 'rgba(255,255,255,.92)';
          ctx.fillRect(px, py, cw * 0.74, ch * 0.56);
          ctx.fillStyle = 'rgba(0,0,0,.55)';
          ctx.fillRect(px, py + ch * 0.56 * 0.5 - 1, cw * 0.74, 2);
          ctx.fillRect(px + cw * 0.74 * 0.5 - 1, py, 2, ch * 0.56);
        }
      }
    }
  }, { repeat: [1, 1] });

  return { map: color, emissiveMap: emissive };
};

/* ---------- 霓虹招牌 ---------- */
NR.buildSign = function (text, colorHex, seed) {
  const r = mulberry32(seed);
  const vertical = r() < 0.45;
  const chars = [...text];
  const W = vertical ? 256 : 1024;
  const H = vertical ? Math.max(512, chars.length * 190) : 256;

  const mk = (glow, flip) => canvasTex(W, H, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.clearRect(0, 0, W, H);
    const col = colorHex;
    ctx.strokeStyle = glow ? '#fff' : col;
    ctx.lineWidth = glow ? 10 : 6;
    ctx.strokeRect(14, 14, W - 28, H - 28);
    ctx.shadowColor = glow ? '#ffffff' : col;
    ctx.shadowBlur = glow ? 0 : 0;
    ctx.fillStyle = glow ? '#ffffff' : col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (vertical) {
      ctx.font = `700 ${Math.min(150, (H - 60) / chars.length * 0.82)}px "Microsoft YaHei",sans-serif`;
      chars.forEach((c, i) => ctx.fillText(c, W / 2, 40 + (i + 0.5) * ((H - 80) / chars.length)));
    } else {
      ctx.font = `700 ${Math.min(150, (W - 80) / chars.length * 0.78)}px "Microsoft YaHei",sans-serif`;
      ctx.fillText(text, W / 2, H / 2 + 4);
    }
  }, { repeat: [1, 1], srgb: true, aniso: 8 });

  const flipOf = (tex) => {
    tex.repeat.x = -1;
    tex.offset.x = 1;
    tex.needsUpdate = true;
    return tex;
  };

  return {
    map: mk(false, false),
    mapFlipped: flipOf(mk(false, true)),
    aspect: W / H,
    vertical,
    color: new T.Color(colorHex),
  };
};

/* ---------- 雨滴/污渍叠加贴图（用于湿墙面） ---------- */
NR.buildGrime = function (seed) {
  const S = 512;
  const h = fbm(S, 10, 4, seed, 0.55);
  return canvasTex(256, 256, (ctx, w, hh) => {
    const img = ctx.createImageData(w, hh);
    for (let i = 0; i < w * hh; i++) {
      const v = 255 - h[i * 4] * 255 * 0.55;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: [1, 1] });
};
