'use client';

import { useState, useEffect, useRef } from 'react';
import { getDayData, formatTime, getTimeOfDay, CAMP_GOAL } from '@/lib/dayTimeline';
import type { TimeChoice } from '@/lib/dayTimeline';

interface PlayerState {
  wallet: number; piggyBank: number; totalSpent: number; totalEarned: number;
  financialHealth: number; currentTime: number; currentLocation: string;
  flags: Record<string, boolean>; streak: number; bestStreak: number;
  daySpending: number; achievements: string[];
}

interface BDef {
  id: string; xPct: number; yPct: number; wPct: number; hPct: number;
  label: string; roof: string; wall: string; door: string;
}

// Positions as percentages of canvas — scales to any screen size
const BUILDINGS: BDef[] = [
  { id: 'home', xPct: 0.06, yPct: 0.35, wPct: 0.12, hPct: 0.18, label: '🏠 Home', roof: '#5a3a1e', wall: '#4a7a5a', door: '#3a5a3a' },
  { id: 'school', xPct: 0.35, yPct: 0.12, wPct: 0.16, hPct: 0.2, label: '🏫 School', roof: '#6b4914', wall: '#8b7914', door: '#5b5914' },
  { id: 'dairy', xPct: 0.78, yPct: 0.3, wPct: 0.11, hPct: 0.15, label: '🏪 Dairy', roof: '#3a5a7a', wall: '#6b8cae', door: '#4a6c8e' },
  { id: 'mall', xPct: 0.55, yPct: 0.4, wPct: 0.13, hPct: 0.17, label: '🛍️ Mall', roof: '#6b3a5c', wall: '#9b6b8c', door: '#7b4b6c' },
  { id: 'library', xPct: 0.2, yPct: 0.18, wPct: 0.1, hPct: 0.14, label: '📚 Library', roof: '#4a3a2a', wall: '#7a6b5a', door: '#5a4b3a' },
  { id: 'cafe', xPct: 0.68, yPct: 0.14, wPct: 0.09, hPct: 0.13, label: '☕ Café', roof: '#5b3e1c', wall: '#8b5e3c', door: '#6b3e1c' },
];

const INTERIOR_THEME: Record<string, { wall: string; floor: string; trim: string; label: string }> = {
  home:    { wall: '#f3e6c8', floor: '#8a5a3a', trim: '#5a3a1e', label: '🏠 HOME' },
  school:  { wall: '#dce8f0', floor: '#c9a876', trim: '#8b7914', label: '🏫 SCHOOL' },
  dairy:   { wall: '#eef2f5', floor: '#cfd8dc', trim: '#6b8cae', label: '🏪 DAIRY' },
  mall:    { wall: '#f5e8f0', floor: '#e8c8d8', trim: '#9b6b8c', label: '🛍️ MALL' },
  library: { wall: '#3a2a1e', floor: '#5a2a2a', trim: '#7a6b5a', label: '📚 LIBRARY' },
  cafe:    { wall: '#6b4a2e', floor: '#3a2818', trim: '#8b5e3c', label: '☕ CAFÉ' },
};

const CHARACTERS: Record<string, { hair: string; outfit: string; skin: string }> = {
  'Mum':           { hair: '#5a3a2a', outfit: '#c94f4f', skin: '#e8b088' },
  'Dad':           { hair: '#3a2a1e', outfit: '#3a5a7a', skin: '#d8a878' },
  'Mr. Thompson':  { hair: '#999999', outfit: '#2a3a5a', skin: '#e0b090' },
  'Jake':          { hair: '#2a1e14', outfit: '#e94560', skin: '#e8b088' },
  'Mia':           { hair: '#4a2a1e', outfit: '#4ecca3', skin: '#f0c8a0' },
  'Liam':          { hair: '#8a5a2a', outfit: '#f0c038', skin: '#e0b090' },
  'Amy':           { hair: '#5a2a4a', outfit: '#e97fa0', skin: '#f0c8a0' },
};

function drawCharacter(
  ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number,
  c: { hair: string; outfit: string; skin: string }, name: string
) {
  const bob = Math.sin(t * 0.06) * 1.5;
  const blink = Math.sin(t * 0.05) > 0.96;

  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(x, y + 8 * s, 5 * s, 2 * s, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#334466';
  ctx.fillRect(x - 3 * s, y + 2, 2.5 * s, 5 * s);
  ctx.fillRect(x + 0.5 * s, y + 2, 2.5 * s, 5 * s);

  ctx.fillStyle = c.outfit;
  ctx.fillRect(x - 4 * s, y - 9 * s + bob, 8 * s, 11 * s);

  ctx.fillStyle = c.skin;
  ctx.fillRect(x - 3 * s, y - 15 * s + bob, 6 * s, 6 * s);

  ctx.fillStyle = c.hair;
  ctx.fillRect(x - 3 * s, y - 16 * s + bob, 6 * s, 2.5 * s);

  ctx.fillStyle = '#000';
  if (!blink) {
    ctx.fillRect(x - 2 * s, y - 13.5 * s + bob, 1.2 * s, 1.2 * s);
    ctx.fillRect(x + 0.5 * s, y - 13.5 * s + bob, 1.2 * s, 1.2 * s);
  } else {
    ctx.fillRect(x - 2 * s, y - 13 * s + bob, 1.2 * s, 0.3 * s);
    ctx.fillRect(x + 0.5 * s, y - 13 * s + bob, 1.2 * s, 0.3 * s);
  }

  ctx.font = `bold ${Math.max(9, s * 4)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f0c038';
  ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
  ctx.strokeText(name, x, y - 19 * s + bob);
  ctx.fillText(name, x, y - 19 * s + bob);
}

function drawInterior(ctx: CanvasRenderingContext2D, W: number, H: number, id: string, t: number, speaker?: string) {
  const theme = INTERIOR_THEME[id] || INTERIOR_THEME.home;
  const floorY = H * 0.58;

  ctx.fillStyle = theme.wall;
  ctx.fillRect(0, 0, W, floorY);
  ctx.fillStyle = theme.floor;
  ctx.fillRect(0, floorY, W, H - floorY);
  ctx.fillStyle = theme.trim;
  ctx.fillRect(0, floorY - 6, W, 6);

  if (id === 'dairy' || id === 'mall') {
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 2;
    const tile = W / 10;
    for (let x = 0; x <= W; x += tile) { ctx.beginPath(); ctx.moveTo(x, floorY); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = floorY; y <= H; y += tile) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  } else {
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 2;
    for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, floorY); ctx.lineTo(x, H); ctx.stroke(); }
  }

  switch (id) {
    case 'home': {
      ctx.fillStyle = '#aaddee'; ctx.fillRect(W*0.06, H*0.08, W*0.16, H*0.18);
      ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 6; ctx.strokeRect(W*0.06, H*0.08, W*0.16, H*0.18);
      ctx.fillStyle = '#c94f4f';
      ctx.fillRect(W*0.05, H*0.06, W*0.02, H*0.2);
      ctx.fillRect(W*0.06+W*0.16, H*0.06, W*0.02, H*0.2);
      ctx.fillStyle = '#5a3a1e'; ctx.fillRect(W*0.4, H*0.12, W*0.08, H*0.1);
      ctx.fillStyle = '#7aa8d8'; ctx.fillRect(W*0.4+4, H*0.12+4, W*0.08-8, H*0.1-8);
      ctx.fillStyle = '#c94f4f';
      ctx.beginPath(); ctx.ellipse(W*0.5, H*0.82, W*0.22, H*0.08, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#e8e0d0';
      ctx.beginPath(); ctx.ellipse(W*0.5, H*0.82, W*0.16, H*0.05, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#5a3a1e'; ctx.fillRect(W*0.7, H*0.55, W*0.24, H*0.32);
      ctx.fillStyle = '#eef0f5'; ctx.fillRect(W*0.71, H*0.57, W*0.22, H*0.14);
      ctx.fillStyle = '#4a7a5a'; ctx.fillRect(W*0.71, H*0.68, W*0.22, H*0.16);
      ctx.fillStyle = '#fff'; ctx.fillRect(W*0.72, H*0.58, W*0.06, H*0.06);
      ctx.fillStyle = '#5a3a1e'; ctx.fillRect(W*0.15, H*0.68, W*0.1, H*0.05);
      ctx.fillRect(W*0.16, H*0.73, W*0.015, H*0.1);
      ctx.fillRect(W*0.23, H*0.73, W*0.015, H*0.1);
      ctx.fillStyle = '#f0c038';
      ctx.beginPath(); ctx.arc(W*0.2, H*0.63, W*0.02, 0, Math.PI*2); ctx.fill();
      break;
    }
    case 'school': {
      ctx.fillStyle = '#1e3a2a'; ctx.fillRect(W*0.3, H*0.1, W*0.4, H*0.22);
      ctx.strokeStyle = '#6b4914'; ctx.lineWidth = 8; ctx.strokeRect(W*0.3, H*0.1, W*0.4, H*0.22);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W*0.34, H*0.17); ctx.lineTo(W*0.6, H*0.17); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W*0.34, H*0.23); ctx.lineTo(W*0.52, H*0.23); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(W*0.85, H*0.15, W*0.025, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.stroke();
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          const dx = W*0.28 + col * W*0.16, dy = H*0.6 + row * H*0.16;
          ctx.fillStyle = '#a87a4a'; ctx.fillRect(dx, dy, W*0.11, H*0.07);
          ctx.fillStyle = '#5a3a1e'; ctx.fillRect(dx, dy+H*0.07, W*0.015, H*0.05);
          ctx.fillRect(dx+W*0.095, dy+H*0.07, W*0.015, H*0.05);
        }
      }
      ctx.fillStyle = '#aaddee'; ctx.fillRect(W*0.03, H*0.15, W*0.1, H*0.16);
      ctx.fillRect(W*0.87, H*0.15, W*0.1, H*0.16);
      break;
    }
    case 'dairy': {
      const shelfColors = ['#e94560','#4ecca3','#f0c038','#6b8cae','#c94f4f','#8b7914'];
      for (let col = 0; col < 5; col++) {
        const sx = W*0.08 + col * W*0.17;
        ctx.fillStyle = '#cfd8dc'; ctx.fillRect(sx, H*0.1, W*0.13, H*0.32);
        for (let r = 0; r < 3; r++) {
          ctx.fillStyle = shelfColors[(col+r)%shelfColors.length];
          ctx.fillRect(sx+6, H*0.12 + r*H*0.1, W*0.13-12, H*0.06);
        }
      }
      ctx.fillStyle = '#3a5a7a'; ctx.fillRect(W*0.35, H*0.6, W*0.3, H*0.14);
      ctx.fillStyle = '#6b8cae'; ctx.fillRect(W*0.35, H*0.6, W*0.3, H*0.03);
      ctx.fillStyle = '#333'; ctx.fillRect(W*0.42, H*0.53, W*0.08, H*0.07);
      ctx.fillStyle = '#f0c038'; ctx.fillRect(W*0.43, H*0.54, W*0.06, H*0.02);
      ctx.fillStyle = '#b8d8e8'; ctx.fillRect(W*0.78, H*0.4, W*0.16, H*0.32);
      ctx.strokeStyle = '#6b8cae'; ctx.lineWidth = 3; ctx.strokeRect(W*0.78, H*0.4, W*0.16, H*0.32);
      break;
    }
    case 'mall': {
      const stallColors = ['#e94560','#4ecca3','#f0c038'];
      for (let i = 0; i < 3; i++) {
        const sx = W*(0.06 + i*0.31);
        ctx.fillStyle = stallColors[i]; ctx.fillRect(sx, H*0.12, W*0.26, H*0.28);
        ctx.fillStyle = '#fff'; ctx.fillRect(sx+8, H*0.18, W*0.26-16, H*0.16);
        ctx.beginPath();
        ctx.moveTo(sx-6, H*0.12); ctx.lineTo(sx+W*0.13, H*0.04); ctx.lineTo(sx+W*0.26+6, H*0.12);
        ctx.closePath(); ctx.fillStyle = stallColors[i]; ctx.fill();
      }
      ctx.fillStyle = '#8b5e3c'; ctx.fillRect(W*0.46, H*0.68, W*0.06, H*0.08);
      ctx.fillStyle = '#2d7a1e'; ctx.beginPath(); ctx.arc(W*0.49, H*0.65, W*0.04, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#6b3a5c'; ctx.fillRect(W*0.1, H*0.76, W*0.14, H*0.03);
      ctx.fillRect(W*0.12, H*0.79, W*0.015, H*0.05);
      ctx.fillRect(W*0.22, H*0.79, W*0.015, H*0.05);
      break;
    }
    case 'library': {
      const spineColors = ['#e94560','#4ecca3','#f0c038','#6b8cae','#c94f4f'];
      for (let col = 0; col < 4; col++) {
        const sx = W*0.06 + col * W*0.15;
        ctx.fillStyle = '#2a1e14'; ctx.fillRect(sx, H*0.06, W*0.12, H*0.4);
        for (let r = 0; r < 4; r++) {
          for (let b = 0; b < 4; b++) {
            ctx.fillStyle = spineColors[(col+r+b)%spineColors.length];
            ctx.fillRect(sx+4+b*(W*0.12-8)/4, H*0.08+r*H*0.09, (W*0.12-8)/4-2, H*0.08);
          }
        }
      }
      ctx.fillStyle = '#4a3a2a'; ctx.fillRect(W*0.38, H*0.62, W*0.24, H*0.06);
      ctx.fillRect(W*0.4, H*0.68, W*0.015, H*0.08);
      ctx.fillRect(W*0.6, H*0.68, W*0.015, H*0.08);
      const glow = ctx.createRadialGradient(W*0.5, H*0.55, 0, W*0.5, H*0.55, W*0.1);
      glow.addColorStop(0, 'rgba(240,192,56,0.4)'); glow.addColorStop(1, 'rgba(240,192,56,0)');
      ctx.fillStyle = glow; ctx.fillRect(W*0.4, H*0.45, W*0.2, H*0.2);
      ctx.fillStyle = '#f0c038'; ctx.beginPath(); ctx.arc(W*0.5, H*0.58, W*0.012, 0, Math.PI*2); ctx.fill();
      break;
    }
    case 'cafe': {
      ctx.fillStyle = '#5b3e1c'; ctx.fillRect(W*0.05, H*0.42, W*0.28, H*0.2);
      ctx.fillStyle = '#8b5e3c'; ctx.fillRect(W*0.05, H*0.42, W*0.28, H*0.03);
      ctx.fillStyle = '#333'; ctx.fillRect(W*0.08, H*0.3, W*0.1, H*0.14);
      ctx.fillStyle = '#c94f4f'; ctx.fillRect(W*0.1, H*0.33, W*0.02, H*0.05);
      ctx.fillStyle = '#1e1410'; ctx.fillRect(W*0.42, H*0.1, W*0.24, H*0.2);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
      for (let i=0;i<3;i++){ ctx.beginPath(); ctx.moveTo(W*0.45, H*(0.15+i*0.05)); ctx.lineTo(W*0.62, H*(0.15+i*0.05)); ctx.stroke(); }
      [[0.55,0.65],[0.78,0.65]].forEach(([tx,ty])=>{
        ctx.fillStyle = '#3a2818'; ctx.beginPath(); ctx.ellipse(W*tx, H*ty, W*0.05, H*0.025, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#5b3e1c'; ctx.fillRect(W*tx-2, H*ty, 4, H*0.06);
      });
      [0.3,0.6,0.9].forEach(px=>{
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(W*px, 0); ctx.lineTo(W*px, H*0.08); ctx.stroke();
        ctx.fillStyle = '#f0c038'; ctx.beginPath(); ctx.arc(W*px, H*0.08, W*0.015, 0, Math.PI*2); ctx.fill();
      });
      break;
    }
  }
  // Speaking character (if any)
  if (speaker && CHARACTERS[speaker]) {
    const cx = W * 0.3, cy = H * 0.88;
    const cs = Math.max(2.5, W * 0.0042);
    drawCharacter(ctx, cx, cy, cs, t, CHARACTERS[speaker], speaker);
  }

  // Idle player, off to the side so they don't overlap the speaker
  const px = W * 0.65, py = H * 0.9;
  const s = Math.max(2.5, W * 0.004);
  const bob = Math.sin(t * 0.08) * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(px, py + 8*s, 5*s, 2*s, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#334466';
  ctx.fillRect(px-3*s, py+2, 2.5*s, 5*s);
  ctx.fillRect(px+0.5*s, py+2, 2.5*s, 5*s);
  ctx.fillStyle = '#3366cc';
  ctx.fillRect(px-4*s, py-9*s+bob, 8*s, 11*s);
  ctx.fillStyle = '#ffcc99';
  ctx.fillRect(px-3*s, py-15*s+bob, 6*s, 6*s);
  ctx.fillStyle = '#442211';
  ctx.fillRect(px-3*s, py-16*s+bob, 6*s, 2.5*s);
  ctx.fillStyle = '#000';
  ctx.fillRect(px-2*s, py-13.5*s+bob, 1.2*s, 1.2*s);
  ctx.fillRect(px+0.5*s, py-13.5*s+bob, 1.2*s, 1.2*s);

  ctx.font = `bold ${Math.max(12, W*0.016)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 4;
  ctx.strokeText(theme.label, W*0.5, H*0.06);
  ctx.fillText(theme.label, W*0.5, H*0.06);
}

const ACHVS = [
  { id: 'first-save', title: 'Piggy Bank Pioneer', emoji: '🐷', check: (s: PlayerState) => s.piggyBank > 0 },
  { id: 'save-10', title: 'Double Digits', emoji: '💰', check: (s: PlayerState) => s.piggyBank >= 10 },
  { id: 'no-spend', title: 'Iron Will', emoji: '💪', check: (s: PlayerState) => s.flags['no_spend_day'] === true },
  { id: 'helper', title: 'Good Kid', emoji: '⭐', check: (s: PlayerState) => s.flags['bought_milk_d1'] === true || s.flags['got_tape_d2'] === true },
];

function init(): PlayerState {
  return { wallet: 15, piggyBank: 0, totalSpent: 0, totalEarned: 15, financialHealth: 100, currentTime: 0, currentLocation: 'home', flags: {}, streak: 0, bestStreak: 0, daySpending: 0, achievements: [] };
}

export default function GamePage() {
  const [screen, setScreen] = useState<'intro' | 'play' | 'summary' | 'complete'>('intro');
  const [state, setState] = useState(init());
  const [week] = useState(1);
  const [day, setDay] = useState(1);
  const [evtIdx, setEvtIdx] = useState(0);
  const [response, setResponse] = useState<string | null>(null);
  const [achPopup, setAchPopup] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [typedText, setTypedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [view, setView] = useState<'map' | 'interior'>('map');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const player = useRef({ x: 0.12, y: 0.58, tx: 0.12, ty: 0.58 }); // percentage positions
  const tickRef = useRef(0);
  const dimRef = useRef({ w: 800, h: 600 });

  const dayData = getDayData(week, day);
  const events = dayData?.events || [];
  const currentEvent = events[evtIdx];

  // Typewriter effect
  useEffect(() => {
    if (!currentEvent || screen !== 'play') return;
    const fullText = currentEvent.speaker
      ? `"${currentEvent.text}"`
      : currentEvent.text;

    if (response) return; // don't retype when showing response

    setTypedText('');
    setIsTyping(true);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setTypedText(fullText.slice(0, i));
      if (i >= fullText.length) {
        clearInterval(interval);
        setIsTyping(false);
      }
    }, 18);
    return () => clearInterval(interval);
  }, [evtIdx, screen, day]);

  // Skip typing on click
  function skipTyping() {
    if (!currentEvent) return;
    const fullText = currentEvent.speaker ? `"${currentEvent.text}"` : currentEvent.text;
    setTypedText(fullText);
    setIsTyping(false);
  }

  // Achievements
  useEffect(() => {
    if (screen !== 'play') return;
    for (const a of ACHVS) {
      if (!state.achievements.includes(a.id) && a.check(state)) {
        setState(p => ({ ...p, achievements: [...p.achievements, a.id] }));
        setAchPopup(`${a.emoji} ${a.title}`);
        setTimeout(() => setAchPopup(null), 2500);
        break;
      }
    }
  }, [state.piggyBank, state.flags, screen]);

  // ===== CANVAS RENDERING =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || screen !== 'play') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      dimRef.current = { w: canvas.width, h: canvas.height };
    }
    resize();
    window.addEventListener('resize', resize);

    let af = 0;

    function render() {
      if (!ctx || !canvas) return;
      const W = canvas.width, H = canvas.height;
      tickRef.current++;
      const t = tickRef.current;

      ctx.clearRect(0, 0, W, H);

      if (view === 'interior') {
        drawInterior(ctx, W, H, state.currentLocation, t, currentEvent?.speaker);
        af = requestAnimationFrame(render);
        return;
      }

      const GH = H ; // game area height (top 65%)

  // ...everything else you already have (GH, sky, grass, buildings, player, etc.) stays exactly as-is below this

      // Move player
      const p = player.current;
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.003) { const spd = 0.004; p.x += (dx / dist) * spd; p.y += (dy / dist) * spd; }

      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, GH * 0.35);
      sky.addColorStop(0, '#87CEEB');
      sky.addColorStop(1, '#a8d8a8');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, GH * 0.35);

      // Grass
      ctx.fillStyle = '#3a8a2a';
      ctx.fillRect(0, GH * 0.3, W, GH * 0.7);

      // Grass detail
      for (let i = 0; i < 150; i++) {
        const gx = (i * 137 + 50) % W;
        const gy = GH * 0.3 + (i * 97 + 30) % (GH * 0.65);
        ctx.fillStyle = i % 3 === 0 ? '#45a035' : '#2e7a1e';
        ctx.fillRect(gx, gy, 10 + (i % 4) * 4, 4 + (i % 3) * 2);
      }

      // Paths
      ctx.fillStyle = '#c4a87a';
      const pathY = GH * 0.62;
      ctx.fillRect(0, pathY, W, GH * 0.04);
      BUILDINGS.forEach(b => {
        const bx = b.xPct * W + (b.wPct * W) / 2;
        const by = b.yPct * GH + b.hPct * GH;
        ctx.fillRect(bx - 6, by, 12, pathY - by);
      });

      // Path texture
      ctx.fillStyle = '#b49a6a';
      for (let px = 0; px < W; px += 25) {
        ctx.fillRect(px + 5, pathY + 3, 6, 2);
      }

      // Trees
      const trees = [[0.03, 0.2], [0.92, 0.5], [0.15, 0.08], [0.5, 0.25], [0.85, 0.08], [0.45, 0.55], [0.95, 0.15]];
      trees.forEach(([tx, ty]) => {
        const x = tx * W, y = ty * GH;
        ctx.fillStyle = '#5c3a1e';
        ctx.fillRect(x - 3, y, 6, 16);
        ctx.fillStyle = '#2d7a1e';
        ctx.beginPath(); ctx.arc(x, y - 5, 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a8b28';
        ctx.beginPath(); ctx.arc(x - 4, y - 2, 11, 0, Math.PI * 2); ctx.fill();
      });

      // Flowers
      [[0.08, 0.28], [0.42, 0.55], [0.75, 0.48], [0.25, 0.5], [0.6, 0.3]].forEach(([fx, fy], i) => {
        ctx.fillStyle = ['#ff6b8a', '#ffaa44', '#ff44aa', '#44aaff', '#ffff44'][i];
        ctx.beginPath(); ctx.arc(fx * W, fy * GH, 3, 0, Math.PI * 2); ctx.fill();
      });

      // Sort and draw buildings + player by Y
      const objects: { type: string; y: number; b?: BDef }[] = [
        ...BUILDINGS.map(b => ({ type: 'b', y: (b.yPct + b.hPct) * GH, b })),
        { type: 'p', y: p.y * GH },
      ];
      objects.sort((a, b) => a.y - b.y);

      objects.forEach(obj => {
        if (obj.type === 'b' && obj.b) {
          const b = obj.b;
          const bx = b.xPct * W, by = b.yPct * GH, bw = b.wPct * W, bh = b.hPct * GH;
          const isH = hovered === b.id, isC = state.currentLocation === b.id;

          // Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.1)';
          ctx.fillRect(bx + 4, by + 4, bw, bh);
          // Wall
          ctx.fillStyle = b.wall;
          ctx.fillRect(bx, by, bw, bh);
          // Roof
          ctx.fillStyle = b.roof;
          ctx.beginPath();
          ctx.moveTo(bx - 8, by);
          ctx.lineTo(bx + bw / 2, by - bh * 0.25);
          ctx.lineTo(bx + bw + 8, by);
          ctx.closePath();
          ctx.fill();
          // Door
          ctx.fillStyle = b.door;
          ctx.fillRect(bx + bw / 2 - 8, by + bh - 24, 16, 24);
          ctx.fillStyle = '#f0c038';
          ctx.beginPath(); ctx.arc(bx + bw / 2 + 4, by + bh - 12, 2, 0, Math.PI * 2); ctx.fill();
          // Windows
          ctx.fillStyle = (isH || isC) ? '#ffee88' : '#aaddee';
          ctx.fillRect(bx + 10, by + bh * 0.2, bw * 0.2, bh * 0.2);
          ctx.fillRect(bx + bw - 10 - bw * 0.2, by + bh * 0.2, bw * 0.2, bh * 0.2);
          // Border
          if (isC) { ctx.strokeStyle = '#f0c038'; ctx.lineWidth = 3; ctx.strokeRect(bx - 3, by - bh * 0.27, bw + 6, bh + bh * 0.3); }
          else if (isH) { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(bx - 2, by - bh * 0.26, bw + 4, bh + bh * 0.28); }
          // Label
          ctx.font = `bold ${Math.max(11, W * 0.012)}px "Segoe UI", Arial`;
          ctx.textAlign = 'center';
          ctx.fillStyle = isC ? '#f0c038' : '#fff';
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.lineWidth = 3;
          const lx = bx + bw / 2, ly = by - bh * 0.3;
          ctx.strokeText(b.label, lx, ly);
          ctx.fillText(b.label, lx, ly);
        } else if (obj.type === 'p') {
          // Player
          const px = p.x * W, py = p.y * GH;
          const walking = dist > 0.003;
          const facing = p.tx >= p.x ? 1 : -1;
          const bob = walking ? Math.sin(t * 0.3) * 2 : 0;
          const s = Math.max(2, W * 0.003);

          // Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.beginPath(); ctx.ellipse(px, py + 8 * s, 5 * s, 2 * s, 0, 0, Math.PI * 2); ctx.fill();
          // Legs
          ctx.fillStyle = '#334466';
          if (walking) {
            const la = Math.sin(t * 0.4) * 3;
            ctx.fillRect(px - 3 * s, py + bob + 2, 2.5 * s, 5 * s + la);
            ctx.fillRect(px + 0.5 * s, py + bob + 2, 2.5 * s, 5 * s - la);
          } else {
            ctx.fillRect(px - 3 * s, py + 2, 2.5 * s, 5 * s);
            ctx.fillRect(px + 0.5 * s, py + 2, 2.5 * s, 5 * s);
          }
          // Body
          ctx.fillStyle = '#3366cc';
          ctx.fillRect(px - 4 * s, py - 9 * s + bob, 8 * s, 11 * s);
          // Head
          ctx.fillStyle = '#ffcc99';
          ctx.fillRect(px - 3 * s, py - 15 * s + bob, 6 * s, 6 * s);
          // Hair
          ctx.fillStyle = '#442211';
          ctx.fillRect(px - 3 * s, py - 16 * s + bob, 6 * s, 2.5 * s);
          // Eyes
          ctx.fillStyle = '#000';
          const ex = facing === 1 ? 0 : -2;
          ctx.fillRect(px + ex * s, py - 13.5 * s + bob, 1.2 * s, 1.2 * s);
          ctx.fillRect(px + (ex + 2.5) * s, py - 13.5 * s + bob, 1.2 * s, 1.2 * s);
          // Backpack
          ctx.fillStyle = '#cc3333';
          ctx.fillRect(px + (facing === 1 ? -5 : 3) * s, py - 7 * s + bob, 2 * s, 6 * s);
        }
      });

      // Weather
      if (dayData?.weather === 'cloudy') {
        ctx.fillStyle = 'rgba(60,70,90,0.1)';
        ctx.fillRect(0, 0, W, GH);
      }

      // Subtle darken behind the bottom dialogue area only
      const grad = ctx.createLinearGradient(0, H * 0.72, 0, H);
      grad.addColorStop(0, 'rgba(10,10,20,0)');
      grad.addColorStop(1, 'rgba(10,10,20,0.55)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, H * 0.72, W, H * 0.28);

      af = requestAnimationFrame(render);
    }

    af = requestAnimationFrame(render);

    // Click
    function onClick(e: MouseEvent) {
      if (view !== 'map') { if (canvas) canvas.style.cursor = 'default'; return; }
        const W = dimRef.current.w, GH = dimRef.current.h ;
        const rect = canvas!.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;

      for (const b of BUILDINGS) {
        const bx = b.xPct * W, by = b.yPct * GH, bw = b.wPct * W, bh = b.hPct * GH;
        if (mx >= bx - 10 && mx <= bx + bw + 10 && my >= by - bh * 0.3 && my <= by + bh + 10) {
          player.current.tx = b.xPct + b.wPct / 2;
          player.current.ty = b.yPct + b.hPct + 0.05;
          const d = Math.sqrt(Math.pow(player.current.x - player.current.tx, 2) + Math.pow(player.current.y - player.current.ty, 2));
          setTimeout(() => {
          setState(p => ({ ...p, currentLocation: b.id }));
          setView('interior');
          }, Math.max(200, (d / 0.004) * 16));          
          return;
        }
      }
    }

    function onMove(e: MouseEvent) {
      if (view !== 'map') { if (canvas) canvas.style.cursor = 'default'; return; }
        const W = dimRef.current.w, GH = dimRef.current.h;
        const rect = canvas!.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        let found = false;
      for (const b of BUILDINGS) {
        const bx = b.xPct * W, by = b.yPct * GH, bw = b.wPct * W, bh = b.hPct * GH;
        if (mx >= bx - 10 && mx <= bx + bw + 10 && my >= by - bh * 0.3 && my <= by + bh + 10) {
          setHovered(b.id); canvas!.style.cursor = 'pointer'; found = true; break;
        }
      }
      
      if (!found) { setHovered(null); canvas!.style.cursor = 'default'; }
    }

    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mousemove', onMove);

    return () => {
      cancelAnimationFrame(af);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('mousemove', onMove);
    };
  }, [screen, state.currentLocation, hovered, dayData?.weather, view, evtIdx]);

  // Move player to location
  useEffect(() => {
    const b = BUILDINGS.find(b => b.id === state.currentLocation);
    if (b) { player.current.tx = b.xPct + b.wPct / 2; player.current.ty = b.yPct + b.hPct + 0.05; }
  }, [state.currentLocation]);

  function handleChoice(c: TimeChoice) {
    const isSave = c.emoji === '🐷';
    const spend = (!isSave && c.walletChange < 0) ? Math.abs(c.walletChange) : 0;
    const earn = c.walletChange > 0 ? c.walletChange : 0;
    setState(p => ({
      ...p, wallet: +(p.wallet + c.walletChange).toFixed(2),
      piggyBank: isSave ? +(p.piggyBank + Math.abs(c.walletChange)).toFixed(2) : p.piggyBank,
      totalSpent: +(p.totalSpent + spend).toFixed(2),
      totalEarned: earn > 0 ? +(p.totalEarned + earn).toFixed(2) : p.totalEarned,
      financialHealth: Math.max(0, Math.min(100, p.financialHealth + c.healthChange)),
      currentTime: p.currentTime + c.timeCost,
      currentLocation: c.travelTo || p.currentLocation,
      daySpending: +(p.daySpending + spend).toFixed(2),
      flags: c.flag ? { ...p.flags, [c.flag]: true } : p.flags,
    }));
    setResponse(c.response);
  }

  function advance() {
    setResponse(null);
    let next = evtIdx + 1;
    while (next < events.length) {
      if (events[next].location === state.currentLocation || events[next].type === 'alert') break;
      next++;
    }
    if (next >= events.length) {
      const smart = state.daySpending <= 5;
      const ns = smart ? state.streak + 1 : 0;
      setState(p => ({ ...p, streak: ns, bestStreak: Math.max(p.bestStreak, ns), flags: state.daySpending === 0 ? { ...p.flags, no_spend_day: true } : p.flags }));
      setScreen('summary');
    } else setEvtIdx(next);
  }

  function nextDay() {
    if (day >= 4) { setScreen('complete'); return; }
    setDay(day + 1); setEvtIdx(0); setResponse(null);
    setState(p => ({ ...p, currentTime: 0, currentLocation: 'home', daySpending: 0 }));
    player.current = { x: 0.12, y: 0.58, tx: 0.12, ty: 0.58 };
    setView('interior');
    setScreen('play');
  }

  // Lock body scroll when playing
  useEffect(() => {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.height = '100vh';
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.body.style.height = '';
    };
  }, []);

  const font = "'Segoe UI', Helvetica, Arial, sans-serif";
  const pixelHeadFont = "'Press Start 2P', monospace";
  const pixelBodyFont = "'VT323', monospace";

  // ===== INTRO =====
  if (screen === 'intro') {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#1a1a2e', fontFamily: font }}>
        <style>{`@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }`}</style>
        <div className="text-center px-6 max-w-lg" style={{ color: '#eee' }}>
          <div className="text-6xl mb-4" style={{ animation: 'pulse 2s infinite' }}>⛺</div>
          <div className="text-xs tracking-[3px] uppercase mb-1" style={{ color: '#f0c038' }}>Level 1 — School Days</div>
          <h1 className="text-3xl font-bold mb-3">The Camp Trip</h1>
          <p className="text-sm leading-relaxed mb-6" style={{ color: '#8892a4' }}>
            School camp in Queenstown is 6 weeks away. You need <strong style={{ color: '#f0c038' }}>$50</strong> spending money.
            Mum gives you $15/week. Click buildings to explore. Every choice costs time or money.
          </p>
          <div className="grid grid-cols-3 gap-3 mb-6 text-[11px]" style={{ color: '#8892a4' }}>
            <div className="rounded-lg p-2.5" style={{ background: '#16213e' }}>😎 Jake<br /><span className="text-[10px]">Big spender</span></div>
            <div className="rounded-lg p-2.5" style={{ background: '#16213e' }}>🤓 Mia<br /><span className="text-[10px]">Smart saver</span></div>
            <div className="rounded-lg p-2.5" style={{ background: '#16213e' }}>😅 Liam<br /><span className="text-[10px]">Borrower</span></div>
          </div>
          <button onClick={() => { setScreen('play'); setState(init()); setDay(1); setEvtIdx(0); setView('interior'); }}
          className="px-10 py-4 rounded-full text-base font-bold cursor-pointer border-none hover:scale-105 transition-transform"
          style={{ background: '#f0c038', color: '#1a1a2e' }}>
          Start Week 1
          </button>
        </div>
      </div>
    );
  }

  // ===== SUMMARY =====
  if (screen === 'summary' && dayData) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', fontFamily: font }}>
        <div className="rounded-2xl p-6 text-center max-w-sm mx-4" style={{ background: '#16213e', color: '#eee' }}>
          <div className="text-xs tracking-[3px] uppercase mb-2" style={{ color: '#8892a4' }}>{dayData.dayName} Done</div>
          <div className="text-4xl mb-3">{state.daySpending <= 5 ? '⭐' : '📊'}</div>
          <div className="flex justify-around mb-4">
            {([['Spent', `$${state.daySpending.toFixed(0)}`, '#e94560'], ['Wallet', `$${state.wallet.toFixed(0)}`, '#4ecca3'], ['Saved', `$${state.piggyBank.toFixed(0)}`, '#f0c038']] as const).map(([l, v, c]) => (
              <div key={l}><div className="text-[10px] uppercase" style={{ color: '#8892a4' }}>{l}</div><div className="text-xl font-bold" style={{ color: c }}>{v}</div></div>
            ))}
          </div>
          <div className="h-2 rounded-full mb-3 overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (state.piggyBank / CAMP_GOAL) * 100)}%`, background: '#f0c038' }} />
          </div>
          <div className="text-xs mb-4" style={{ color: '#8892a4' }}>Camp fund: ${state.piggyBank.toFixed(0)} / $50</div>
          <button onClick={nextDay} className="px-8 py-2.5 rounded-full text-sm font-bold cursor-pointer border-none" style={{ background: '#f0c038', color: '#1a1a2e' }}>Next Day →</button>
        </div>
      </div>
    );
  }

  // ===== COMPLETE =====
  if (screen === 'complete') {
    const g = state.piggyBank >= 30 ? 'A' : state.piggyBank >= 20 ? 'B' : state.piggyBank >= 10 ? 'C' : 'D';
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#1a1a2e', fontFamily: font, color: '#eee' }}>
        <div className="text-center max-w-sm mx-4">
          <div className="text-5xl mb-3">🎓</div>
          <div className="text-5xl font-bold mb-2" style={{ color: g === 'A' ? '#4ecca3' : g === 'B' ? '#f0c038' : '#e94560' }}>{g}</div>
          <div className="flex justify-around my-4">
            {([['Earned', `$${state.totalEarned.toFixed(0)}`, '#8892a4'], ['Spent', `$${state.totalSpent.toFixed(0)}`, '#e94560'], ['Saved', `$${state.piggyBank.toFixed(0)}`, '#f0c038']] as const).map(([l, v, c]) => (
              <div key={l}><div className="text-[10px] uppercase" style={{ color: '#8892a4' }}>{l}</div><div className="text-xl font-bold" style={{ color: c }}>{v}</div></div>
            ))}
          </div>
          <div className="rounded-xl p-3 text-[12px]" style={{ background: 'rgba(240,192,56,0.1)', color: '#f0c038' }}>🔜 More days coming soon!</div>
        </div>
      </div>
    );
  }

  // ===== PLAY — FULL SCREEN =====
  if (!dayData || !currentEvent) return null;

  return (
    <div className="fixed inset-0" style={{ fontFamily: font, overflow: 'hidden' }}>
      <style>{`

        @keyframes fadeIn { 0% { opacity: 0; transform: translateY(6px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes achPop { 0% { transform: translateY(-20px) scale(0.8); opacity: 0; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

        .pixel-panel {
          background: #241b3a;
          border: 4px solid #000;
          border-radius: 0;
          box-shadow:
            inset 0 4px 0 0 rgba(255,255,255,0.12),
            inset 4px 0 0 0 rgba(255,255,255,0.06),
            inset -4px 0 0 0 rgba(0,0,0,0.4),
            inset 0 -4px 0 0 rgba(0,0,0,0.4),
            0 -4px 0 0 #000;
          clip-path: polygon(
            8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px),
            calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px
          );
        }

        .pixel-btn {
          background: #3a2d5c;
          border: 3px solid #000;
          border-radius: 0;
          box-shadow:
            inset 2px 2px 0 0 rgba(255,255,255,0.15),
            inset -2px -2px 0 0 rgba(0,0,0,0.4);
          image-rendering: pixelated;
        }
        .pixel-btn:active {
          box-shadow:
            inset -2px -2px 0 0 rgba(255,255,255,0.1),
            inset 2px 2px 0 0 rgba(0,0,0,0.4);
          transform: translateY(1px);
        }

        .pixel-font-head { font-family: ${pixelHeadFont}; letter-spacing: 0.5px; }
        .pixel-font-body { font-family: ${pixelBodyFont}; }
      `}</style>

      {/* FULL SCREEN CANVAS */}
      <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', imageRendering: 'pixelated' }} />

      {/* HUD — top bar, pixel style */}
      <div className="fixed top-0 left-0 right-0 flex items-center justify-between px-3 py-2 z-10 pixel-panel"
        style={{ borderTop: 'none', clipPath: 'none', borderBottom: '4px solid #000' }}>
        <div className="flex items-center gap-3">
          <span className="pixel-font-head text-[9px]" style={{ color: '#eee' }}>{dayData.dayName} WK{week}</span>
          <span className="pixel-font-head text-[9px] px-2 py-1" style={{ background: '#000', color: '#f0c038', border: '2px solid #f0c038' }}>
            {formatTime(state.currentTime)}
          </span>
        </div>
        <div className="flex items-center gap-3 pixel-font-head text-[9px]">
          <span style={{ color: '#4ecca3' }}>${state.wallet.toFixed(2)}</span>
          <span style={{ color: '#f0c038' }}>${state.piggyBank.toFixed(0)}</span>
          <span style={{ color: '#8892a4' }}>{state.piggyBank.toFixed(0)}/50</span>
          {state.streak >= 2 && <span style={{ color: '#e94560' }}>x{state.streak}</span>}
        </div>
      </div>

      {view === 'interior' && (
        <button onClick={() => setView('map')}
        className="pixel-btn fixed z-10 pixel-font-head text-[9px] px-3 py-2"
        style={{ top: 54, left: 12, color: '#f0c038' }}>
        ← MAP
      </button>
      )}

      {/* ACHIEVEMENT — pixel banner */}
      {achPopup && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 pixel-btn pixel-font-head text-[10px]"
          style={{ color: '#1a1a2e', background: '#f0c038', animation: 'achPop 0.3s steps(4)' }}>
          {achPopup}
        </div>
      )}

      {/* DIALOGUE — pixel textbox, part of the game frame */}
      <div className="fixed bottom-0 left-0 right-0 z-20 pointer-events-auto flex justify-center pb-3 px-3"
        onClick={isTyping ? skipTyping : undefined}>
        <div className="w-full max-w-2xl pixel-panel px-5 pt-4 pb-4">
          {currentEvent.speaker && (
            <div className="inline-flex items-center gap-2 -mt-8 mb-2 px-2 py-1 pixel-panel"
              style={{ background: '#1a1a2e' }}>
              <span className="text-base">{currentEvent.speakerEmoji || '💬'}</span>
              <span className="pixel-font-head text-[9px]" style={{ color: '#f0c038' }}>{currentEvent.speaker}</span>
            </div>
          )}

          <div className="pixel-font-body text-[20px] leading-snug mb-3" style={{ color: '#eee', minHeight: 40 }}>
            {typedText}
            {isTyping && <span style={{ animation: 'blink 0.5s steps(1) infinite' }}>▌</span>}
          </div>

          {response && (
            <div className="pixel-panel p-3 mb-3 pixel-font-body text-[17px]" style={{ background: '#1a1430', color: '#bbb', animation: 'fadeIn 0.2s steps(3)' }}>
              {response}
            </div>
          )}

          {currentEvent.choices && !response && !isTyping && (
            <div className="flex flex-col gap-2 mb-1" style={{ animation: 'fadeIn 0.2s steps(3)' }}>
              {currentEvent.choices.map((c, i) => (
                <button key={i} onClick={(e) => { e.stopPropagation(); handleChoice(c); }}
                  className="pixel-btn text-left px-3 py-2 pixel-font-body text-[17px] cursor-pointer"
                  style={{ color: '#eee' }}>
                  {c.emoji} {c.label}
                  {c.walletChange !== 0 && <span className="ml-1.5 text-[14px]" style={{ color: c.walletChange < 0 ? '#e94560' : '#4ecca3' }}>{c.walletChange < 0 ? `-$${Math.abs(c.walletChange)}` : `+$${c.walletChange}`}</span>}
                  {c.timeCost > 0 && <span className="ml-1 text-[13px]" style={{ color: '#888' }}> · {c.timeCost}min</span>}
                </button>
              ))}
            </div>
          )}

          {(!currentEvent.choices || response) && !isTyping && (
            <button onClick={(e) => { e.stopPropagation(); advance(); }}
              className="pixel-btn w-full py-2 pixel-font-body text-[17px] cursor-pointer"
              style={{ color: '#f0c038', animation: 'fadeIn 0.2s steps(3)' }}>
              ▶ CONTINUE
            </button>
          )}
        </div>
      </div>
    </div>
  );
}