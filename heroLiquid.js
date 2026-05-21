/* =========================================================
   OROBRICK — hero liquid displacement
   - WebGL wave-equation simulation on ping-pong FBOs
   - Mouse motion injects impulses → ripples propagate like water
   - Display pass samples the hero <video> and warps UVs by the
     wave-field gradient, so the video appears to ripple beneath
     the cursor as if a stick were dragged through it
   - Inactive areas drift toward a desaturated palette; high
     wave activity restores saturated color (grayscale-to-color)
   ========================================================= */

const VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// One step of the 2D wave equation:
//   ∂²h/∂t² = c² ∇²h  − damping · ∂h/∂t
// We store height in .r and velocity in .g of a half-float texture.
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

// Inject a Gaussian impulse at uPoint into the height field.
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

// Final display: warp the video by the wave gradient.
const FS_DISPLAY = `
precision highp float;
uniform sampler2D uWave;
uniform sampler2D uVideo;
uniform vec2  uTexel;
uniform float uDisp;
uniform float uReveal;
uniform vec3  uTint;
varying vec2 vUv;

void main() {
  // Wave-field gradient (∇h) gives a direction for displacement
  vec2 grad = vec2(
    texture2D(uWave, vUv + vec2( uTexel.x, 0.0)).r - texture2D(uWave, vUv + vec2(-uTexel.x, 0.0)).r,
    texture2D(uWave, vUv + vec2(0.0,  uTexel.y)).r - texture2D(uWave, vUv + vec2(0.0, -uTexel.y)).r
  );
  vec2 du = clamp(vUv + grad * uDisp, 0.001, 0.999);
  vec4 vid = texture2D(uVideo, du);

  // Local "wave activity" — heat that mouse motion has deposited recently
  vec4 wcenter = texture2D(uWave, vUv);
  float activity = abs(wcenter.r) + abs(wcenter.g) * 0.5;
  float sat = clamp(activity * uReveal, 0.0, 1.0);

  // Grayscale baseline; high activity restores full color
  float gray = dot(vid.rgb, vec3(0.299, 0.587, 0.114));
  vec3 desat = mix(vec3(gray), vid.rgb, 0.30);
  vec3 col = mix(desat, vid.rgb, sat);

  // Warm gold tint at wave peaks for the Orobrick palette
  col += uTint * max(wcenter.r, 0.0) * 1.6;

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl, src, type) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error("[heroLiquid] shader compile error:", gl.getShaderInfoLog(s));
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
    console.error("[heroLiquid] link error:", gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

export function initHeroLiquid({ canvasId, videoId, heroSelector } = {}) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return null;
  if (!("matchMedia" in window) || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    // Touch devices skip the effect entirely
    const c = document.getElementById(canvasId);
    if (c) c.style.display = "none";
    return null;
  }

  const canvas = document.getElementById(canvasId);
  const video = document.getElementById(videoId);
  const hero = document.querySelector(heroSelector || ".hero");
  if (!canvas || !video || !hero) return null;

  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    powerPreference: "high-performance",
  });
  if (!gl) {
    canvas.style.display = "none";
    return null;
  }

  // Try to use half-float textures for accurate wave dynamics
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

  // Full-screen quad
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  function bindAttribs(prog) {
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  // Two FBOs for wave-field ping-pong
  const SIM_W = 320;
  const SIM_H = 180;
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

  const videoTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, videoTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

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
  const dispU = {
    wave: gl.getUniformLocation(displayProg, "uWave"),
    video: gl.getUniformLocation(displayProg, "uVideo"),
    texel: gl.getUniformLocation(displayProg, "uTexel"),
    disp: gl.getUniformLocation(displayProg, "uDisp"),
    reveal: gl.getUniformLocation(displayProg, "uReveal"),
    tint: gl.getUniformLocation(displayProg, "uTint"),
  };

  // Mouse path → splats
  let lmx = -1, lmy = -1;
  const pending = [];

  hero.addEventListener("mousemove", (e) => {
    const rect = hero.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = 1.0 - (e.clientY - rect.top) / rect.height;
    if (lmx < 0) { lmx = mx; lmy = my; return; }
    const dx = mx - lmx;
    const dy = my - lmy;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.0008) { lmx = mx; lmy = my; return; }
    // Interpolate many splats along the path so even fast cursor moves
    // leave a continuous wake (the "stick" trail through water).
    const steps = Math.max(1, Math.ceil(dist * 220));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      pending.push({
        x: lmx + dx * t,
        y: lmy + dy * t,
        force: Math.min(0.012 + dist * 0.6, 0.06),
      });
    }
    lmx = mx; lmy = my;
    if (pending.length > 220) pending.splice(0, pending.length - 220);
  });
  hero.addEventListener("mouseleave", () => { lmx = -1; lmy = -1; });

  let cw = 0, ch = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = canvas.clientWidth || hero.clientWidth;
    const h = canvas.clientHeight || hero.clientHeight;
    if (w === cw && h === ch) return;
    cw = w; ch = h;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }

  const TINT = [0.78, 0.62, 0.42]; // warm gold

  function render() {
    resize();

    // 1) Step the wave simulation
    gl.useProgram(simProg);
    bindAttribs(simProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboA.tex);
    gl.uniform1i(simU.prev, 0);
    gl.uniform2f(simU.texel, 1 / SIM_W, 1 / SIM_H);
    gl.uniform1f(simU.damping, 0.989);
    gl.uniform1f(simU.speed, 0.50);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboB.fb);
    gl.viewport(0, 0, SIM_W, SIM_H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const tmp1 = fboA; fboA = fboB; fboB = tmp1;

    // 2) Process splats
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

    // 3) Refresh video/image texture
    const isVideo = video.tagName === "VIDEO";
    const isCanvas = video.tagName === "CANVAS";
    const isReady = isVideo 
      ? (video.readyState >= 2 && video.videoWidth > 0)
      : isCanvas 
        ? (video.width > 0)
        : (video.complete && video.naturalWidth > 0);

    if (isReady) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, videoTex);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
      } catch (e) { /* not enough data yet */ }
    }

    // 4) Display — warp the video by the wave field's gradient
    gl.useProgram(displayProg);
    bindAttribs(displayProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, videoTex);
    gl.uniform1i(dispU.video, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fboA.tex);
    gl.uniform1i(dispU.wave, 1);

    gl.uniform2f(dispU.texel, 1 / SIM_W, 1 / SIM_H);
    gl.uniform1f(dispU.disp, 0.18);
    gl.uniform1f(dispU.reveal, 14.0);
    gl.uniform3f(dispU.tint, TINT[0], TINT[1], TINT[2]);

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
  return { canvas, gl };
}
