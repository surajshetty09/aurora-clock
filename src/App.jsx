import { useEffect, useRef, useState } from "react";
import "./App.css";

// ─── Aurora Engine ───────────────────────────────────────────────────────────
// Multi-layer fluid simulation using layered sine waves with Perlin-like noise

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Simple smooth noise
function noise(x, y, t) {
  const X = Math.floor(x), Y = Math.floor(y);
  const xf = x - X, yf = y - Y;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = Math.sin(X * 127.1 + Y * 311.7 + t * 0.3) * 43758.5453;
  const b = Math.sin((X+1) * 127.1 + Y * 311.7 + t * 0.3) * 43758.5453;
  const c = Math.sin(X * 127.1 + (Y+1) * 311.7 + t * 0.3) * 43758.5453;
  const d = Math.sin((X+1) * 127.1 + (Y+1) * 311.7 + t * 0.3) * 43758.5453;
  return lerp(lerp(a - Math.floor(a), b - Math.floor(b), u),
               lerp(c - Math.floor(c), d - Math.floor(d), u), v);
}

function fbm(x, y, t, octaves = 4) {
  let val = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * noise(x * freq, y * freq, t);
    amp *= 0.5; freq *= 2.1;
  }
  return val;
}

// Color palettes that shift with the hour
const HOUR_PALETTES = [
  // 0-3h: Midnight deep blue/indigo
  { name:"Midnight", colors:["#0d0221","#0a0440","#1a0a6b","#2d0080","#00008b"] },
  // 4-6h: Pre-dawn purple/crimson
  { name:"Twilight", colors:["#1a0030","#3d0050","#6b0080","#8b0050","#ff1493"] },
  // 7-9h: Dawn rose/amber
  { name:"Dawn",     colors:["#1a0a00","#4a1500","#8b2500","#c04000","#ff6600"] },
  // 10-13h: Midday teal/cyan
  { name:"Zenith",   colors:["#001a1a","#003030","#005050","#008080","#00b0b0"] },
  // 14-17h: Afternoon gold/green
  { name:"Solstice", colors:["#001000","#003000","#006600","#009900","#00cc44"] },
  // 18-20h: Sunset magenta/orange
  { name:"Dusk",     colors:["#1a0010","#400030","#800060","#c00060","#ff4080"] },
  // 21-23h: Night aurora green/blue
  { name:"Aurora",   colors:["#000a10","#001525","#003060","#006090","#00d4ff"] },
];

function getPalette(hour) {
  if (hour < 4)  return HOUR_PALETTES[0];
  if (hour < 7)  return HOUR_PALETTES[1];
  if (hour < 10) return HOUR_PALETTES[2];
  if (hour < 14) return HOUR_PALETTES[3];
  if (hour < 18) return HOUR_PALETTES[4];
  if (hour < 21) return HOUR_PALETTES[5];
  return HOUR_PALETTES[6];
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return [r,g,b];
}

function drawAurora(ctx, W, H, t, palette, mouseX, mouseY, seconds) {
  ctx.clearRect(0, 0, W, H);

  // Background gradient — deep space
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  const [r0,g0,b0] = hexToRgb(palette.colors[0]);
  const [r1,g1,b1] = hexToRgb(palette.colors[1]);
  bg.addColorStop(0, `rgb(${r0},${g0},${b0})`);
  bg.addColorStop(1, `rgb(${r1},${g1},${b1})`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Stars
  const starSeed = 42;
  for (let i = 0; i < 180; i++) {
    const sx = ((Math.sin(i * 127.1 + starSeed) * 0.5 + 0.5)) * W;
    const sy = ((Math.sin(i * 311.7 + starSeed) * 0.5 + 0.5)) * H * 0.7;
    const brightness = 0.3 + 0.7 * ((Math.sin(i * 91.3 + t * 0.5) * 0.5 + 0.5));
    const size = 0.5 + 1.5 * ((Math.sin(i * 53.2 + starSeed) * 0.5 + 0.5));
    ctx.save();
    ctx.globalAlpha = brightness * 0.8;
    ctx.fillStyle = "#ffffff";
    ctx.shadowBlur = size * 3;
    ctx.shadowColor = "#aaccff";
    ctx.beginPath();
    ctx.arc(sx, sy, size * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Mouse influence ripple
  const mx = mouseX / W, my = mouseY / H;
  const mouseStrength = 0.15;

  // Aurora layers — 5 curtains of light
  const LAYERS = 5;
  for (let layer = 0; layer < LAYERS; layer++) {
    const layerT = t * (0.08 + layer * 0.03) + layer * 2.5;
    const layerOffset = layer * 0.2;
    const layerAlpha = 0.12 + layer * 0.05;
    const [lr, lg, lb] = hexToRgb(palette.colors[Math.min(layer + 1, palette.colors.length - 1)]);

    // Sample resolution
    const cols = 80;
    const bandH = H * (0.15 + layer * 0.04);
    const bandY = H * (0.1 + layer * 0.09);

    // Build the curtain as a series of vertical strips
    for (let xi = 0; xi < cols; xi++) {
      const xn = xi / cols;
      const xp = xn * W;

      // Mouse distortion
      const distX = xn - mx;
      const distY = 0.3 - my;
      const dist = Math.sqrt(distX * distX + distY * distY);
      const mouseWarp = mouseStrength * Math.exp(-dist * 4);

      // FBM warp
      const warpX = xn * 3 + layerOffset;
      const warpY = layerOffset;
      const warp = fbm(warpX + mouseWarp, warpY, layerT);
      const warp2 = fbm(warpX + 1.7, warpY + 3.4 + mouseWarp * 0.5, layerT + 1.5);

      // Curtain shape — sine waves with warp
      const baseY = bandY + warp * bandH * 0.8 + warp2 * bandH * 0.4;
      const curtainH = bandH * (0.5 + 0.5 * Math.abs(Math.sin(xn * Math.PI * 2 + layerT * 0.5)));

      // Seconds pulse — breathing effect
      const breathe = 1 + 0.08 * Math.sin(seconds * Math.PI * 2 / 60 + layer);

      const grad = ctx.createLinearGradient(xp, baseY, xp, baseY + curtainH * breathe);
      grad.addColorStop(0,   `rgba(${lr},${lg},${lb},0)`);
      grad.addColorStop(0.2, `rgba(${lr},${lg},${lb},${layerAlpha * 1.5})`);
      grad.addColorStop(0.5, `rgba(${lr},${lg},${lb},${layerAlpha})`);
      grad.addColorStop(0.8, `rgba(${lr},${lg},${lb},${layerAlpha * 0.6})`);
      grad.addColorStop(1,   `rgba(${lr},${lg},${lb},0)`);

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = grad;
      const stripW = W / cols + 1;
      ctx.fillRect(xp, baseY, stripW, curtainH * breathe);
      ctx.restore();
    }
  }

  // Glow horizon
  const [hr,hg,hb] = hexToRgb(palette.colors[2]);
  const horizGrad = ctx.createLinearGradient(0, H*0.45, 0, H*0.7);
  horizGrad.addColorStop(0, `rgba(${hr},${hg},${hb},0.08)`);
  horizGrad.addColorStop(0.5, `rgba(${hr},${hg},${hb},0.18)`);
  horizGrad.addColorStop(1, `rgba(${hr},${hg},${hb},0)`);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = horizGrad;
  ctx.fillRect(0, H*0.45, W, H*0.25);
  ctx.restore();

  // Ground silhouette — pine forest
  ctx.save();
  ctx.fillStyle = "#000000";
  const groundY = H * 0.72;

  // Draw tree line
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, groundY);

  const treeCount = Math.floor(W / 18);
  for (let i = 0; i <= treeCount; i++) {
    const tx = (i / treeCount) * W;
    const seed = i * 137.5;
    const treeH = 30 + 45 * ((Math.sin(seed) * 0.5 + 0.5));
    const treeW = 8 + 10 * ((Math.sin(seed * 1.7) * 0.5 + 0.5));
    const ty = groundY - treeH;
    // Pine tree shape
    ctx.lineTo(tx - treeW * 0.5, groundY);
    ctx.lineTo(tx - treeW * 0.3, groundY - treeH * 0.35);
    ctx.lineTo(tx - treeW * 0.15, groundY - treeH * 0.35);
    ctx.lineTo(tx, ty);
    ctx.lineTo(tx + treeW * 0.15, groundY - treeH * 0.35);
    ctx.lineTo(tx + treeW * 0.3, groundY - treeH * 0.35);
    ctx.lineTo(tx + treeW * 0.5, groundY);
  }

  ctx.lineTo(W, groundY);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  // Snow ground
  const snowGrad = ctx.createLinearGradient(0, groundY, 0, H);
  snowGrad.addColorStop(0, "#0a0a14");
  snowGrad.addColorStop(1, "#050508");
  ctx.fillStyle = snowGrad;
  ctx.fillRect(0, groundY + 2, W, H - groundY);

  // Reflection on snow
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const refGrad = ctx.createLinearGradient(0, groundY, 0, H);
  const [rr,rg,rb] = hexToRgb(palette.colors[3]);
  refGrad.addColorStop(0, `rgba(${rr},${rg},${rb},0.08)`);
  refGrad.addColorStop(1, `rgba(${rr},${rg},${rb},0)`);
  ctx.fillStyle = refGrad;
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.restore();

  ctx.restore();
}

// ─── Clock Face ──────────────────────────────────────────────────────────────

function drawClock(ctx, W, H, hours, minutes, seconds, palette) {
  const cx = W / 2, cy = H * 0.55;
  const r = Math.min(W, H) * 0.18;

  const [cr, cg, cb] = hexToRgb(palette.colors[3]);
  const glowColor = `rgba(${cr},${cg},${cb}`;

  // Outer ring glow
  ctx.save();
  ctx.shadowBlur = 40;
  ctx.shadowColor = `${glowColor},0.6)`;
  ctx.strokeStyle = `${glowColor},0.3)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Clock face — frosted glass
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = `${glowColor},1)`;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Clock border
  ctx.save();
  ctx.strokeStyle = `${glowColor},0.5)`;
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 20;
  ctx.shadowColor = `${glowColor},0.8)`;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Hour markers
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const isMain = i % 3 === 0;
    const outer = r - 4;
    const inner = r - (isMain ? 14 : 9);
    ctx.save();
    ctx.strokeStyle = `${glowColor},${isMain ? 0.9 : 0.4})`;
    ctx.lineWidth = isMain ? 2 : 1;
    ctx.shadowBlur = isMain ? 8 : 4;
    ctx.shadowColor = `${glowColor},0.8)`;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.lineTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.stroke();
    ctx.restore();
  }

  // Hour hand
  const hAngle = ((hours % 12) / 12 + minutes / 720) * Math.PI * 2 - Math.PI / 2;
  ctx.save();
  ctx.strokeStyle = `${glowColor},0.95)`;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.shadowBlur = 15;
  ctx.shadowColor = `${glowColor},1)`;
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(hAngle) * r * 0.12, cy - Math.sin(hAngle) * r * 0.12);
  ctx.lineTo(cx + Math.cos(hAngle) * r * 0.55, cy + Math.sin(hAngle) * r * 0.55);
  ctx.stroke();
  ctx.restore();

  // Minute hand
  const mAngle = (minutes / 60 + seconds / 3600) * Math.PI * 2 - Math.PI / 2;
  ctx.save();
  ctx.strokeStyle = `${glowColor},0.85)`;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.shadowBlur = 12;
  ctx.shadowColor = `${glowColor},0.9)`;
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(mAngle) * r * 0.1, cy - Math.sin(mAngle) * r * 0.1);
  ctx.lineTo(cx + Math.cos(mAngle) * r * 0.78, cy + Math.sin(mAngle) * r * 0.78);
  ctx.stroke();
  ctx.restore();

  // Second hand
  const sAngle = (seconds / 60) * Math.PI * 2 - Math.PI / 2;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 1;
  ctx.lineCap = "round";
  ctx.shadowBlur = 10;
  ctx.shadowColor = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(sAngle) * r * 0.18, cy - Math.sin(sAngle) * r * 0.18);
  ctx.lineTo(cx + Math.cos(sAngle) * r * 0.88, cy + Math.sin(sAngle) * r * 0.88);
  ctx.stroke();
  ctx.restore();

  // Center dot
  ctx.save();
  ctx.fillStyle = "white";
  ctx.shadowBlur = 8;
  ctx.shadowColor = "white";
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const tRef = useRef(0);
  const rafRef = useRef();
  const [timeStr, setTimeStr] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [paletteName, setPaletteName] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let W, H;

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = e => {
      const src = e.touches ? e.touches[0] : e;
      mouseRef.current = { x: src.clientX, y: src.clientY };
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });

    let lastSec = -1;

    const loop = (ts) => {
      tRef.current = ts * 0.001;
      const t = tRef.current;

      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      const s = now.getSeconds();
      const ms = now.getMilliseconds();
      const smoothS = s + ms / 1000;

      const palette = getPalette(h);

      drawAurora(ctx, W, H, t, palette, mouseRef.current.x, mouseRef.current.y, smoothS);
      drawClock(ctx, W, H, h, m, smoothS, palette);

      if (s !== lastSec) {
        lastSec = s;
        const pad = n => String(n).padStart(2, "0");
        setTimeStr(`${pad(h)}:${pad(m)}:${pad(s)}`);
        setPaletteName(palette.name);
        setDateStr(now.toLocaleDateString("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" }));
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
    };
  }, []);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="canvas" />

      {/* Digital time overlay */}
      <div className="ui-overlay">
        <div className="time-digital">{timeStr}</div>
        <div className="date-str">{dateStr}</div>
        <div className="palette-tag">{paletteName} Sky</div>
      </div>

      {/* Bottom hint */}
      <div className="hint">Move your cursor to shape the lights</div>

      {/* Corner watermark */}
      <div className="watermark">AURORA CLOCK</div>
    </div>
  );
}
