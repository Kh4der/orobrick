/* =========================================================
   OROBRICK — Fluid scroll-driven WebGL background
   - Full-viewport fixed canvas behind all content
   - Animated organic gradient using FBM noise + domain warping
   - Smoothly transitions between brand-color "stages" as you scroll
   - Cinematic grain overlay
   ========================================================= */

const VERT = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

uniform vec2  uResolution;
uniform float uTime;
uniform float uSpeed;
uniform float uGrain;
uniform float uStageBlend;
uniform vec3  uC0;
uniform vec3  uC1;
uniform vec3  uC2;
uniform vec3  uC3;
uniform vec3  uN0;
uniform vec3  uN1;
uniform vec3  uN2;
uniform vec3  uN3;

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
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
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.05 + vec2(7.3, 4.7);
    a *= 0.5;
  }
  return v;
}

vec3 mixPalette(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float n, float m) {
  vec3 a = mix(c0, c1, smoothstep(0.15, 0.85, n));
  vec3 b = mix(c2, c3, smoothstep(0.15, 0.85, n));
  return mix(a, b, smoothstep(0.15, 0.85, m));
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);

  float t = uTime * uSpeed;

  // Domain warping — two layers of FBM applied to coordinates so the
  // gradient swirls organically instead of looking like a static blob.
  vec2 q = vec2(
    fbm(p * 1.6 + vec2(t * 0.30, 0.0)),
    fbm(p * 1.6 + vec2(0.0, t * 0.24))
  );
  vec2 r = vec2(
    fbm(p * 2.1 + q * 1.4 + vec2(1.7 + t * 0.17, 9.2)),
    fbm(p * 2.1 + q * 1.4 + vec2(8.3, 2.8 + t * 0.13))
  );

  float n1 = fbm(p * 1.2 + r * 0.85);
  float n2 = fbm(p * 0.85 + r * 0.55 + t * 0.10);

  vec3 colA = mixPalette(uC0, uC1, uC2, uC3, n1, n2);
  vec3 colB = mixPalette(uN0, uN1, uN2, uN3, n1, n2);
  vec3 color = mix(colA, colB, uStageBlend);

  // Cinematic grain — high-frequency hash modulated by time
  float grain = (hash(uv * uResolution + t * 100.0) - 0.5) * uGrain;
  color += grain;

  gl_FragColor = vec4(color, 1.0);
}
`;

function hex(c) {
  c = c.replace("#", "");
  return [
    parseInt(c.slice(0, 2), 16) / 255,
    parseInt(c.slice(2, 4), 16) / 255,
    parseInt(c.slice(4, 6), 16) / 255,
  ];
}

/**
 * Stage palettes (4 colors each) keyed to the vertical scroll layout of
 * the Orobrick page. Heights are in vh — they don't have to match each
 * section pixel-perfectly; they just need to advance smoothly as you scroll.
 */
const STAGES = [
  // Hero  — dark cinematic with gold accents
  { palette: ["#1f1c1a", "#b8956a", "#16140f", "#6b4f3a"], height: 100 },
  // Services — cream + warm neutrals
  { palette: ["#f3ede2", "#ebe2d2", "#d8c8a8", "#b8956a"], height: 130 },
  // Process — warm wood tones
  { palette: ["#a08060", "#b8956a", "#6b4f3a", "#ebe2d2"], height: 120 },
  // Why Orobrick — dark moody
  { palette: ["#16140f", "#6b4f3a", "#1f1c1a", "#b8956a"], height: 110 },
  // Gallery — cream
  { palette: ["#f3ede2", "#f4ede0", "#ebe2d2", "#d8c8a8"], height: 140 },
  // About + CTA — warm wood to dark
  { palette: ["#ebe2d2", "#b8956a", "#6b4f3a", "#1f1c1a"], height: 130 },
  // Contact + footer — cream to dark
  { palette: ["#f3ede2", "#ebe2d2", "#1f1c1a", "#b8956a"], height: 150 },
];

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error("Shader compile failed:", gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

export function initBgFluid(opts = {}) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return null;

  const canvas = document.getElementById("bgFluid");
  if (!canvas) return null;

  const gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: "low-power",
  });
  if (!gl) {
    console.warn("[Orobrick] WebGL unavailable — fluid background disabled.");
    return null;
  }

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("[Orobrick] Shader link failed:", gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  // Full-screen triangle strip
  const verts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = {
    res: gl.getUniformLocation(program, "uResolution"),
    time: gl.getUniformLocation(program, "uTime"),
    speed: gl.getUniformLocation(program, "uSpeed"),
    grain: gl.getUniformLocation(program, "uGrain"),
    blend: gl.getUniformLocation(program, "uStageBlend"),
    c: [0, 1, 2, 3].map((i) => gl.getUniformLocation(program, `uC${i}`)),
    n: [0, 1, 2, 3].map((i) => gl.getUniformLocation(program, `uN${i}`)),
  };

  // Pre-resolve palettes
  const stages = STAGES.map((s) => ({
    palette: s.palette.map(hex),
    height: s.height,
  }));

  const dprMax = 1.25; // background doesn't need high pixel density
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, dprMax);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener("resize", resize);

  const speed = opts.speed ?? 0.18;
  const grain = opts.grain ?? 0.045;
  const startMs = performance.now();

  function currentBlend() {
    // Compute scroll-driven stage index + fractional progress within it.
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const vh = window.innerHeight;
    let cum = 0;
    for (let i = 0; i < stages.length; i++) {
      const sH = (stages[i].height * vh) / 100;
      if (scrollY < cum + sH || i === stages.length - 1) {
        return {
          idx: i,
          frac: Math.min(1, Math.max(0, (scrollY - cum) / sH)),
        };
      }
      cum += sH;
    }
    return { idx: stages.length - 1, frac: 1 };
  }

  function render() {
    const t = (performance.now() - startMs) / 1000;
    const { idx, frac } = currentBlend();
    const cur = stages[idx];
    const nxt = stages[Math.min(idx + 1, stages.length - 1)];

    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform1f(u.time, t);
    gl.uniform1f(u.speed, speed);
    gl.uniform1f(u.grain, grain);
    gl.uniform1f(u.blend, frac);

    for (let i = 0; i < 4; i++) {
      gl.uniform3fv(u.c[i], cur.palette[i]);
      gl.uniform3fv(u.n[i], nxt.palette[i]);
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    rafId = requestAnimationFrame(render);
  }
  let rafId = requestAnimationFrame(render);
  // Pause when tab hidden so we don't drain battery off-screen.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    } else if (!rafId) {
      rafId = requestAnimationFrame(render);
    }
  });

  return { canvas, gl, stages };
}
