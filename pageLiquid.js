/* =========================================================
   OROBRICK — page-wide liquid pointer trail
   - Full-viewport fixed WebGL canvas above ALL content
   - 2D wave-equation simulation driven by cursor motion
   - Renders as a transparent overlay with:
     · Gold-tinted specular highlights at wave peaks
     · Refractive distortion rings (chromatic aberration)
     · Shadow troughs on the opposite side
     · Visible ripple rings that warp text and tiles beneath
   - Uses alpha blend so idle areas are fully transparent
   ========================================================= */

const VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FS_SIM = `
precision highp float;
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform float uDamping;
uniform float uSpeed;
varying vec2 vUv;

void main() {
  vec4 c = texture2D(uPrev, vUv);
  float h = c.r;
  float v = c.g;

  float lh =
    (texture2D(uPrev, vUv + vec2( uTexel.x,        0.0)).r +
     texture2D(uPrev, vUv + vec2(-uTexel.x,        0.0)).r +
     texture2D(uPrev, vUv + vec2(       0.0,  uTexel.y)).r +
     texture2D(uPrev, vUv + vec2(       0.0, -uTexel.y)).r) * 0.25 - h;

  v += lh * uSpeed;
  v *= uDamping;
  h += v;

  gl_FragColor = vec4(h, v, 0.0, 1.0);
}
`;

const FS_SPLAT = `
precision highp float;
uniform sampler2D uPrev;
uniform vec2 uPoint;
uniform float uRadius;
uniform float uForce;
varying vec2 vUv;

void main() {
  vec4 c = texture2D(uPrev, vUv);
  vec2 d = vUv - uPoint;
  float g = exp(-dot(d, d) / (uRadius * uRadius));
  c.r += uForce * g;
  gl_FragColor = c;
}
`;

// Display shader: renders visible ripple distortion over page content.
// Uses hard-light blend mode — neutral gray (0.5) is invisible,
// brighter = lighten content, darker = darken content.
// The wave gradient drives:
//  1. Specular highlight (gold) on wave crests
//  2. Shadow (dark) on wave troughs
//  3. Chromatic shift — R/B channels offset by gradient to simulate refraction
//  4. Visible ripple rings from wave height contours
const FS_DISPLAY = `
precision highp float;
uniform sampler2D uWave;
uniform vec2 uTexel;
varying vec2 vUv;

void main() {
  // Wave-field gradient
  vec2 grad = vec2(
    texture2D(uWave, vUv + vec2( uTexel.x, 0.0)).r - texture2D(uWave, vUv + vec2(-uTexel.x, 0.0)).r,
    texture2D(uWave, vUv + vec2(0.0,  uTexel.y)).r - texture2D(uWave, vUv + vec2(0.0, -uTexel.y)).r
  );

  vec4 w = texture2D(uWave, vUv);
  float height = w.r;
  float velocity = w.g;
  float activity = abs(height) + abs(velocity) * 0.5;

  // --- Normal map from wave gradient (reduced strength) ---
  vec3 normal = normalize(vec3(grad * 10.0, 1.0));

  // --- Specular highlight — soft gold ---
  vec3 lightDir = normalize(vec3(0.8, 1.0, 1.2));
  float spec = pow(max(dot(normal, lightDir), 0.0), 64.0);
  vec3 lightDir2 = normalize(vec3(-0.5, 0.8, 1.5));
  float spec2 = pow(max(dot(normal, lightDir2), 0.0), 32.0);
  vec3 specColor = vec3(1.0, 0.85, 0.55) * spec * 0.35
                 + vec3(0.95, 0.90, 0.75) * spec2 * 0.15;

  // --- Shadow — subtle ---
  float shadow = pow(max(dot(normal, normalize(vec3(-0.8, -1.0, 0.4))), 0.0), 10.0) * 0.15;

  // --- Chromatic aberration — very subtle ---
  float aberStr = length(grad) * 3.0;
  float rShift = 0.5 + aberStr * 0.1;
  float bShift = 0.5 - aberStr * 0.08;

  // --- Ripple rings — faint ---
  float rings = sin(height * 60.0) * 0.025;

  // --- Composite ---
  float r = 0.5 + specColor.r + rings - shadow + (rShift - 0.5) * 0.3;
  float g = 0.5 + specColor.g + rings - shadow;
  float b = 0.5 + specColor.b + rings - shadow + (bShift - 0.5) * 0.3;

  vec3 color = clamp(vec3(r, g, b), 0.0, 1.0);

  // Alpha — gentler falloff
  float alpha = smoothstep(0.002, 0.025, activity) * clamp(activity * 3.0, 0.0, 0.7);

  gl_FragColor = vec4(color, alpha);
}
`;

function compile(gl, src, type) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error("[pageLiquid] shader compile error:", gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

function makeProgram(gl, vsrc, fsrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, vsrc, gl.VERTEX_SHADER));
  gl.attachShader(p, compile(gl, fsrc, gl.FRAGMENT_SHADER));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error("[pageLiquid] link error:", gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

export function initPageLiquid({ canvasId } = {}) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    const c = document.getElementById(canvasId);
    if (c) c.style.display = "none";
    return null;
  }

  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    powerPreference: "low-power",
  });
  if (!gl) {
    canvas.style.display = "none";
    return null;
  }

  // Half-float for better precision in the wave field
  const halfExt = gl.getExtension("OES_texture_half_float");
  gl.getExtension("OES_texture_half_float_linear");
  const dataType = halfExt ? halfExt.HALF_FLOAT_OES : gl.UNSIGNED_BYTE;

  const simProg = makeProgram(gl, VS, FS_SIM);
  const splatProg = makeProgram(gl, VS, FS_SPLAT);
  const displayProg = makeProgram(gl, VS, FS_DISPLAY);
  if (!simProg || !splatProg || !displayProg) {
    canvas.style.display = "none";
    return null;
  }

  // Quad geometry
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  function bindAttribs(prog) {
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  // Wave field — low-res for performance, big enough for crisp ripples
  const SIM_W = 384;
  const SIM_H = 216;
  function createFBO(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, dataType, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fb, tex };
  }
  let fboA = createFBO(SIM_W, SIM_H);
  let fboB = createFBO(SIM_W, SIM_H);

  const simU = {
    prev: gl.getUniformLocation(simProg, "uPrev"),
    texel: gl.getUniformLocation(simProg, "uTexel"),
    damping: gl.getUniformLocation(simProg, "uDamping"),
    speed: gl.getUniformLocation(simProg, "uSpeed"),
  };
  const splatU = {
    prev: gl.getUniformLocation(splatProg, "uPrev"),
    point: gl.getUniformLocation(splatProg, "uPoint"),
    radius: gl.getUniformLocation(splatProg, "uRadius"),
    force: gl.getUniformLocation(splatProg, "uForce"),
  };

  const uDispWave = gl.getUniformLocation(displayProg, "uWave");
  const uDispTexel = gl.getUniformLocation(displayProg, "uTexel");

  // Mouse path → splats — listens to the entire window so the trail
  // works whether the cursor is over the hero, services, gallery, etc.
  let lmx = -1, lmy = -1;
  const pending = [];

  function onMouseMove(e) {
    const mx = e.clientX / window.innerWidth;
    const my = 1.0 - e.clientY / window.innerHeight;
    if (lmx < 0) { lmx = mx; lmy = my; return; }
    const dx = mx - lmx;
    const dy = my - lmy;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.0008) { lmx = mx; lmy = my; return; }
    const steps = Math.max(1, Math.ceil(dist * 220));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      pending.push({
        x: lmx + dx * t,
        y: lmy + dy * t,
        force: Math.min(0.007 + dist * 0.35, 0.035),
      });
    }
    lmx = mx;
    lmy = my;
    if (pending.length > 260) pending.splice(0, pending.length - 260);
  }
  function onMouseLeave() { lmx = -1; lmy = -1; }
  window.addEventListener("mousemove", onMouseMove, { passive: true });
  document.documentElement.addEventListener("mouseleave", onMouseLeave);

  let cw = 0, ch = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === cw && h === ch) return;
    cw = w; ch = h;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
  }
  window.addEventListener("resize", resize);
  resize();

  function render() {
    resize();

    // 1) Wave simulation step
    gl.useProgram(simProg);
    bindAttribs(simProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboA.tex);
    gl.uniform1i(simU.prev, 0);
    gl.uniform2f(simU.texel, 1 / SIM_W, 1 / SIM_H);
    gl.uniform1f(simU.damping, 0.987);
    gl.uniform1f(simU.speed, 0.50);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboB.fb);
    gl.viewport(0, 0, SIM_W, SIM_H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const tmp1 = fboA; fboA = fboB; fboB = tmp1;

    // 2) Apply queued splats
    if (pending.length > 0) {
      gl.useProgram(splatProg);
      bindAttribs(splatProg);
      for (let i = 0; i < pending.length; i++) {
        const s = pending[i];
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, fboA.tex);
        gl.uniform1i(splatU.prev, 0);
        gl.uniform2f(splatU.point, s.x, s.y);
        gl.uniform1f(splatU.radius, 0.025);
        gl.uniform1f(splatU.force, s.force);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fboB.fb);
        gl.viewport(0, 0, SIM_W, SIM_H);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const tmp2 = fboA; fboA = fboB; fboB = tmp2;
      }
      pending.length = 0;
    }

    // 3) Display — render ripple overlay
    gl.useProgram(displayProg);
    bindAttribs(displayProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboA.tex);
    gl.uniform1i(uDispWave, 0);

    gl.uniform2f(uDispTexel, 1.0 / SIM_W, 1.0 / SIM_H);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    rafId = requestAnimationFrame(render);
  }
  let rafId = requestAnimationFrame(render);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    } else if (!rafId) {
      rafId = requestAnimationFrame(render);
    }
  });

  return { canvas };
}
