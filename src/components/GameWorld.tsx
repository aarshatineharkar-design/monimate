'use client';

import { useEffect, useRef, useState } from 'react';

interface GameWorldProps {
  currentLocation: string;
  onLocationChange: (location: string) => void;
  weather: string;
  timeOfDay: string;
}

interface BuildingZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  icon: string;
  color: number;
}

const BUILDINGS: BuildingZone[] = [
  { id: 'home', x: 80, y: 320, width: 90, height: 70, label: 'Home', icon: '🏠', color: 0x4a7a5a },
  { id: 'school', x: 350, y: 80, width: 120, height: 80, label: 'School', icon: '🏫', color: 0x8b6914 },
  { id: 'dairy', x: 580, y: 250, width: 80, height: 60, label: 'Dairy', icon: '🏪', color: 0x6b8cae },
  { id: 'mall', x: 420, y: 380, width: 100, height: 70, label: 'Mall', icon: '🛍️', color: 0x9b6b8c },
  { id: 'library', x: 200, y: 180, width: 80, height: 60, label: 'Library', icon: '📚', color: 0x7a6b5a },
  { id: 'cafe', x: 550, y: 100, width: 70, height: 55, label: 'Café', icon: '☕', color: 0x8b5e3c },
];

export default function GameWorld({ currentLocation, onLocationChange, weather, timeOfDay }: GameWorldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const playerRef = useRef({ x: 80, y: 360, targetX: 80, targetY: 360 });
  const [hoveredBuilding, setHoveredBuilding] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 700;
    const H = 480;
    canvas.width = W;
    canvas.height = H;

    // Load background image
    const bgImg = new Image();
    bgImg.src = '/tiles/urban-sample.png';

    // Character sprite frames (simple pixel art drawn on canvas)
    let frame = 0;
    let frameTimer = 0;

    function drawPixelCharacter(cx: number, cy: number, facing: string) {
      if (!ctx) return;
      const s = 3; // pixel scale
      // Body
      ctx.fillStyle = '#3366cc';
      ctx.fillRect(cx - 4*s, cy - 8*s, 8*s, 10*s);
      // Head
      ctx.fillStyle = '#ffcc99';
      ctx.fillRect(cx - 3*s, cy - 14*s, 6*s, 6*s);
      // Hair
      ctx.fillStyle = '#553322';
      ctx.fillRect(cx - 3*s, cy - 15*s, 6*s, 3*s);
      // Eyes
      ctx.fillStyle = '#000';
      if (facing === 'right') {
        ctx.fillRect(cx, cy - 12*s, 1*s, 1*s);
        ctx.fillRect(cx + 2*s, cy - 12*s, 1*s, 1*s);
      } else {
        ctx.fillRect(cx - 3*s, cy - 12*s, 1*s, 1*s);
        ctx.fillRect(cx - 1*s, cy - 12*s, 1*s, 1*s);
      }
      // Legs (animated)
      ctx.fillStyle = '#224488';
      if (Math.abs(playerRef.current.x - playerRef.current.targetX) > 2 ||
          Math.abs(playerRef.current.y - playerRef.current.targetY) > 2) {
        // Walking animation
        if (frame % 2 === 0) {
          ctx.fillRect(cx - 3*s, cy + 2*s, 3*s, 4*s);
          ctx.fillRect(cx + 1*s, cy + 4*s, 3*s, 2*s);
        } else {
          ctx.fillRect(cx - 3*s, cy + 4*s, 3*s, 2*s);
          ctx.fillRect(cx + 1*s, cy + 2*s, 3*s, 4*s);
        }
      } else {
        ctx.fillRect(cx - 3*s, cy + 2*s, 3*s, 4*s);
        ctx.fillRect(cx + 1*s, cy + 2*s, 3*s, 4*s);
      }
      // Backpack
      ctx.fillStyle = '#cc4444';
      if (facing === 'right') {
        ctx.fillRect(cx - 5*s, cy - 6*s, 2*s, 6*s);
      } else {
        ctx.fillRect(cx + 3*s, cy - 6*s, 2*s, 6*s);
      }
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 7*s, 5*s, 2*s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawBuilding(b: BuildingZone, isHovered: boolean, isCurrent: boolean) {
      if (!ctx) return;
      // Building shadow
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(b.x + 4, b.y + 4, b.width, b.height);

      // Building body
      const r = (b.color >> 16) & 0xff;
      const g = (b.color >> 8) & 0xff;
      const bl = b.color & 0xff;
      ctx.fillStyle = `rgb(${r},${g},${bl})`;
      ctx.fillRect(b.x, b.y, b.width, b.height);

      // Roof
      ctx.fillStyle = `rgb(${Math.max(0,r-40)},${Math.max(0,g-40)},${Math.max(0,bl-40)})`;
      ctx.fillRect(b.x - 5, b.y - 12, b.width + 10, 16);

      // Door
      ctx.fillStyle = `rgb(${Math.max(0,r-60)},${Math.max(0,g-60)},${Math.max(0,bl-60)})`;
      ctx.fillRect(b.x + b.width/2 - 8, b.y + b.height - 22, 16, 22);

      // Windows
      ctx.fillStyle = isHovered || isCurrent ? '#ffee88' : '#aaccee';
      const winY = b.y + 12;
      ctx.fillRect(b.x + 10, winY, 12, 10);
      ctx.fillRect(b.x + b.width - 22, winY, 12, 10);

      // Window frames
      ctx.strokeStyle = `rgb(${Math.max(0,r-30)},${Math.max(0,g-30)},${Math.max(0,bl-30)})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x + 10, winY, 12, 10);
      ctx.strokeRect(b.x + b.width - 22, winY, 12, 10);

      // Highlight border if current
      if (isCurrent) {
        ctx.strokeStyle = '#f0c038';
        ctx.lineWidth = 3;
        ctx.strokeRect(b.x - 2, b.y - 14, b.width + 4, b.height + 16);
      } else if (isHovered) {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x - 1, b.y - 13, b.width + 2, b.height + 14);
      }

      // Label
      ctx.font = 'bold 11px "Segoe UI", Arial';
      ctx.textAlign = 'center';
      ctx.fillStyle = isCurrent ? '#f0c038' : isHovered ? '#fff' : '#ddd';
      ctx.fillText(`${b.icon} ${b.label}`, b.x + b.width/2, b.y - 18);
    }

    function drawGround() {
      if (!ctx) return;
      // Grass base
      ctx.fillStyle = '#2d5a1e';
      ctx.fillRect(0, 0, W, H);

      // Grass variation patches
      for (let i = 0; i < 80; i++) {
        const gx = (i * 137 + 50) % W;
        const gy = (i * 97 + 30) % H;
        ctx.fillStyle = i % 3 === 0 ? '#3a6b28' : '#256118';
        ctx.fillRect(gx, gy, 12 + (i % 5) * 4, 8 + (i % 3) * 3);
      }

      // Paths (lighter ground connecting buildings)
      ctx.fillStyle = '#8b7d6b';
      // Main horizontal path
      ctx.fillRect(0, 300, W, 20);
      // Path to school
      ctx.fillRect(350, 160, 20, 140);
      // Path to dairy
      ctx.fillRect(560, 260, 20, 40);
      // Path to mall
      ctx.fillRect(420, 320, 20, 60);
      // Path from home
      ctx.fillRect(120, 310, 230, 10);

      // Path texture
      ctx.fillStyle = '#7a6e5e';
      for (let px = 0; px < W; px += 30) {
        ctx.fillRect(px + 5, 303, 8, 3);
        ctx.fillRect(px + 18, 312, 6, 3);
      }

      // Trees
      const trees = [[30, 100], [620, 400], [150, 60], [500, 180], [300, 420], [650, 50], [50, 450], [280, 280]];
      trees.forEach(([tx, ty]) => {
        // Trunk
        ctx.fillStyle = '#5c3a1e';
        ctx.fillRect(tx - 3, ty, 6, 14);
        // Leaves
        ctx.fillStyle = '#2d7a1e';
        ctx.beginPath();
        ctx.arc(tx, ty - 4, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3a8b28';
        ctx.beginPath();
        ctx.arc(tx - 4, ty - 2, 10, 0, Math.PI * 2);
        ctx.fill();
      });

      // Flowers
      const flowers = [[100, 150], [450, 450], [580, 350], [200, 400], [400, 200]];
      const flowerColors = ['#ff6b8a', '#ffaa44', '#ff44aa', '#44aaff', '#ffff44'];
      flowers.forEach(([fx, fy], i) => {
        ctx.fillStyle = flowerColors[i % flowerColors.length];
        ctx.beginPath();
        ctx.arc(fx, fy, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2d7a1e';
        ctx.fillRect(fx - 1, fy + 3, 2, 5);
      });
    }

    function drawWeather() {
      if (!ctx) return;
      if (weather === 'rainy') {
        ctx.strokeStyle = 'rgba(150,200,255,0.3)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 50; i++) {
          const rx = (i * 73 + frame * 7) % W;
          const ry = (i * 47 + frame * 11) % H;
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 2, ry + 8);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(40,50,70,0.2)';
        ctx.fillRect(0, 0, W, H);
      }
      if (weather === 'cloudy') {
        ctx.fillStyle = 'rgba(50,60,80,0.15)';
        ctx.fillRect(0, 0, W, H);
      }
    }

    function drawHUD() {
      if (!ctx) return;
      // Mini walking indicator
      const p = playerRef.current;
      const isWalking = Math.abs(p.x - p.targetX) > 2 || Math.abs(p.y - p.targetY) > 2;
      if (isWalking) {
        ctx.font = '12px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.textAlign = 'center';
        ctx.fillText('🚶 Walking...', p.x, p.y - 55);
      }
    }

    function gameLoop() {
      if (!ctx) return;

      frameTimer++;
      if (frameTimer >= 10) {
        frame++;
        frameTimer = 0;
      }

      // Move player toward target
      const p = playerRef.current;
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 3) {
        const speed = 3;
        p.x += (dx / dist) * speed;
        p.y += (dy / dist) * speed;
      } else if (dist > 0) {
        p.x = p.targetX;
        p.y = p.targetY;
      }

      // Clear
      ctx.clearRect(0, 0, W, H);

      // Draw layers
      drawGround();

      // Sort buildings and player by Y position for depth
      const allObjects: { type: string; y: number; data?: BuildingZone }[] = [
        ...BUILDINGS.map(b => ({ type: 'building' as string, y: b.y + b.height, data: b })),
        { type: 'player', y: p.y },
      ];
      allObjects.sort((a, b) => a.y - b.y);

      allObjects.forEach(obj => {
        if (obj.type === 'building' && obj.data) {
          drawBuilding(obj.data, hoveredBuilding === obj.data.id, currentLocation === obj.data.id);
        } else if (obj.type === 'player') {
          const facing = p.targetX >= p.x ? 'right' : 'left';
          drawPixelCharacter(p.x, p.y, facing);
        }
      });

      drawWeather();
      drawHUD();

      animRef.current = requestAnimationFrame(gameLoop);
    }

    // Start loop
    animRef.current = requestAnimationFrame(gameLoop);

    // Click handler
    function handleClick(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;

      for (const b of BUILDINGS) {
        if (mx >= b.x - 5 && mx <= b.x + b.width + 5 &&
            my >= b.y - 15 && my <= b.y + b.height + 5) {
          // Move player to building entrance
          playerRef.current.targetX = b.x + b.width / 2;
          playerRef.current.targetY = b.y + b.height + 20;

          // Trigger location change after walking
          const walkDist = Math.sqrt(
            Math.pow(playerRef.current.x - playerRef.current.targetX, 2) +
            Math.pow(playerRef.current.y - playerRef.current.targetY, 2)
          );
          const walkTime = Math.max(300, (walkDist / 3) * 16);
          setTimeout(() => onLocationChange(b.id), walkTime);
          return;
        }
      }
    }

    // Hover handler
    function handleMove(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;

      let found = false;
      for (const b of BUILDINGS) {
        if (mx >= b.x - 5 && mx <= b.x + b.width + 5 &&
            my >= b.y - 15 && my <= b.y + b.height + 5) {
          setHoveredBuilding(b.id);
          canvas.style.cursor = 'pointer';
          found = true;
          break;
        }
      }
      if (!found) {
        setHoveredBuilding(null);
        canvas.style.cursor = 'default';
      }
    }

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mousemove', handleMove);

    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('mousemove', handleMove);
    };
  }, [currentLocation, weather, hoveredBuilding]);

  // Update player position when location changes externally
  useEffect(() => {
    const building = BUILDINGS.find(b => b.id === currentLocation);
    if (building) {
      playerRef.current.targetX = building.x + building.width / 2;
      playerRef.current.targetY = building.y + building.height + 20;
    }
  }, [currentLocation]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-xl"
      style={{
        imageRendering: 'pixelated',
        maxHeight: '45vh',
        aspectRatio: '700 / 480',
      }}
    />
  );
}
