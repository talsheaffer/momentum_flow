// High-Level Electric Circuit Analogy Renderer (Point 7)
//
// Compares:
//   - Direct Lift (`mode === 'direct'`): Liftoff requires opening the tire branch,
//     forcing 100% of `I = Mg` in SERIES through the human.
//   - Class-1 Lever (`mode === 'lever'`): Fulcrum provides the high-current parallel
//     ground channel (`v = 0, P = 0`), while the human sits on the low-current branch
//     supplying 100% of the mechanical energy.

export function renderCircuitDiagram(canvas, circuitData, fluidMode, theme, time) {
  if (!canvas || !circuitData) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth || 300;
  const cssH = canvas.clientHeight || 176;
  const targetW = Math.round(cssW * dpr);
  const targetH = Math.round(cssH * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to acquire 2D context for circuitCanvas');
  }
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  const isDark = theme === 'dark';
  const ink = isDark ? 'rgba(239, 232, 218, 0.92)' : 'rgba(42, 45, 56, 0.92)';
  const inkSoft = isDark ? 'rgba(185, 176, 160, 0.78)' : 'rgba(95, 90, 80, 0.78)';
  const wireIdle = isDark ? 'rgba(255, 245, 225, 0.16)' : 'rgba(50, 45, 35, 0.16)';
  const cyan = isDark ? '#38dcf7' : '#087898';
  const amber = isDark ? '#f7b93e' : '#c4760a';
  const red = isDark ? '#f06565' : '#c23b3b';

  const activeColor = fluidMode === 'energy' ? amber : cyan;

  function drawWire(pts, currentFrac, color, dashed = false) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = currentFrac > 0.01 ? color : wireIdle;
    ctx.globalAlpha = dashed ? 0.45 : Math.max(0.22, Math.min(0.95, 0.25 + currentFrac * 0.85));
    ctx.lineWidth = dashed ? 1.5 : 1.75 + currentFrac * 4.0;
    if (dashed) ctx.setLineDash([4, 4]);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    if (currentFrac > 0.015 && !dashed) {
      let totalLen = 0;
      const segs = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const dx = pts[i + 1][0] - pts[i][0];
        const dy = pts[i + 1][1] - pts[i][1];
        const len = Math.hypot(dx, dy);
        segs.push({ x0: pts[i][0], y0: pts[i][1], dx, dy, len, start: totalLen });
        totalLen += len;
      }
      const spacing = 18;
      const count = Math.max(2, Math.floor(totalLen / spacing));
      // Fast propagation speed along circuit wires too!
      const speed = (95 + currentFrac * 85) * time;

      ctx.save();
      ctx.fillStyle = color;
      for (let k = 0; k < count; k++) {
        const d = ((k * (totalLen / count) + speed) % totalLen + totalLen) % totalLen;
        for (let s = 0; s < segs.length; s++) {
          const seg = segs[s];
          if (d >= seg.start && d <= seg.start + seg.len) {
            const u = (d - seg.start) / Math.max(1e-4, seg.len);
            ctx.beginPath();
            ctx.arc(seg.x0 + seg.dx * u, seg.y0 + seg.dy * u, 2.0 + currentFrac * 1.4, 0, Math.PI * 2);
            ctx.fill();
            break;
          }
        }
      }
      ctx.restore();
    }
  }

  function drawNodeBox(cx, cy, w, h, title, sub, borderCol) {
    ctx.save();
    ctx.fillStyle = isDark ? 'rgba(26, 24, 22, 0.92)' : 'rgba(250, 246, 238, 0.95)';
    ctx.strokeStyle = borderCol || inkSoft;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = ink;
    ctx.font = '600 11px Inter, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, cx, sub ? cy - 2 : cy + 4);

    if (sub) {
      ctx.fillStyle = inkSoft;
      ctx.font = '500 10px Inter, -apple-system, sans-serif';
      ctx.fillText(sub, cx, cy + 11);
    }
    ctx.restore();
  }

  const loadKN = (circuitData.loadCurrent / 1000).toFixed(1);
  const humanKN = (circuitData.humanCurrent / 1000).toFixed(2);
  const xGnd = 32;
  const xMid = cssW * 0.45;
  const xCar = cssW - 56;
  const yTop = 46;
  const yBot = 118;
  const yCenter = 82;

  if (circuitData.mode === 'direct') {
    const humanFrac = Math.min(1, circuitData.humanCurrent / circuitData.loadCurrent);
    const tireFrac = Math.min(1, circuitData.tireCurrent / circuitData.loadCurrent);
    const overloaded = circuitData.humanCurrent > circuitData.humanMaxCurrent * 0.92;

    if (fluidMode === 'z') {
      drawWire(
        [
          [xGnd, yCenter],
          [xGnd, yTop],
          [xCar, yTop],
          [xCar, yCenter - 18],
        ],
        Math.max(0.08, humanFrac * 1.9),
        overloaded ? red : activeColor
      );
      drawWire(
        [
          [xGnd, yCenter],
          [xGnd, yBot],
          [xCar, yBot],
          [xCar, yCenter + 18],
        ],
        tireFrac,
        activeColor
      );
    } else {
      drawWire([[xMid, yTop], [xCar, yTop], [xCar, yCenter - 18]], 0, amber, true);
      drawWire([[xGnd, yCenter], [xGnd, yBot], [xCar, yBot], [xCar, yCenter + 18]], 0, amber, true);
    }

    ctx.strokeStyle = inkSoft;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(xGnd - 10, yCenter);
    ctx.lineTo(xGnd + 10, yCenter);
    ctx.stroke();
    ctx.fillStyle = inkSoft;
    ctx.font = '600 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Earth', xGnd, yCenter + 15);

    drawNodeBox(
      xMid,
      yTop,
      108,
      34,
      `Human (${humanKN} kN)`,
      overloaded ? `MAX (${(circuitData.humanMaxCurrent / 1000).toFixed(1)} kN)` : 'Series Lift Path',
      overloaded ? red : activeColor
    );

    const tireKN = (circuitData.tireCurrent / 1000).toFixed(1);
    drawNodeBox(xMid, yBot, 108, 34, `Tires (${tireKN} kN)`, 'Must hit 0 for liftoff', inkSoft);
    drawNodeBox(xCar, yCenter, 78, 38, 'Car Load', `${loadKN} kN drain`, activeColor);

    ctx.fillStyle = inkSoft;
    ctx.font = 'italic 10.5px Lora, Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `Liftoff opens the tire branch—putting all ${loadKN} kN in series.`,
      cssW / 2,
      cssH - 10
    );
  } else {
    const fulcFrac = Math.min(1, circuitData.fulcrumCurrent / circuitData.loadCurrent);
    const humanFrac = Math.min(1, circuitData.humanCurrent / circuitData.loadCurrent);
    const fulcKN = (circuitData.fulcrumCurrent / 1000).toFixed(1);

    if (fluidMode === 'z') {
      drawWire(
        [
          [xGnd, yCenter],
          [xGnd, yTop],
          [xCar, yTop],
          [xCar, yCenter - 18],
        ],
        fulcFrac,
        activeColor
      );
      drawWire(
        [
          [xMid + 54, yTop],
          [xMid + 54, yBot],
          [xMid - 54, yBot],
        ],
        Math.max(0.08, humanFrac * 2.2),
        activeColor
      );
    } else {
      drawWire([[xGnd, yCenter], [xGnd, yTop], [xCar, yTop], [xCar, yCenter - 18]], 0, amber, true);
      drawWire(
        [
          [xMid + 54, yBot],
          [xCar, yBot],
          [xCar, yCenter + 18],
        ],
        circuitData.liftedOff ? 0.65 : 0.15,
        amber
      );
    }

    ctx.strokeStyle = inkSoft;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(xGnd - 10, yCenter);
    ctx.lineTo(xGnd + 10, yCenter);
    ctx.stroke();
    ctx.fillStyle = inkSoft;
    ctx.font = '600 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Earth', xGnd, yCenter + 15);

    drawNodeBox(
      xMid,
      yTop,
      114,
      34,
      `Fulcrum (${fulcKN} kN)`,
      fluidMode === 'energy' ? '0 W (v = 0, passive)' : 'Parallel Heavy Channel',
      fluidMode === 'energy' ? inkSoft : activeColor
    );

    drawNodeBox(
      xMid,
      yBot,
      114,
      34,
      `Human (${humanKN} kN)`,
      fluidMode === 'energy' ? '100% of Energy!' : 'Low-Force Control',
      activeColor
    );

    drawNodeBox(xCar, yCenter, 78, 38, 'Car Load', `${loadKN} kN drain`, activeColor);

    ctx.fillStyle = inkSoft;
    ctx.font = 'italic 10.5px Lora, Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Fulcrum carries the heavy current; you supply the energy.',
      cssW / 2,
      cssH - 10
    );
  }

  ctx.restore();
}
