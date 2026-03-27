const canvas = document.getElementById("viz");
const ctx = canvas.getContext("2d");

const controls = {
  drift: document.getElementById("drift"),
  coupling: document.getElementById("coupling"),
  gatePull: document.getElementById("gatePull"),
  gateSpike: document.getElementById("gateSpike"),
  postLock: document.getElementById("postLock"),
  reset: document.getElementById("reset"),
  playPause: document.getElementById("playPause"),
};

const metricEls = {
  coherence: document.getElementById("mCoherence"),
  distance: document.getElementById("mDistance"),
  aligned: document.getElementById("mAligned"),
  status: document.getElementById("mStatus"),
};

const NODE_COUNT = 27;
const COLS = 9;
const ROWS = 3;

const nodes = [];

const gate = {
  x: 0,
  y: 0,
  halfWidth: 0,
  halfHeight: 0,
};

const params = {
  drift: 0.018,
  coupling: 0.022,
  gatePull: 0.008,
  gateSpike: 1,
  postLock: 1,
};

const field = {
  centerAttraction: 0.0018,
  gateBoost: 0.03,
  damping: 0.93,
};

let globalPhase = 0;
let isPaused = false;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function gridTarget(index, w, h) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);

  const stepX = Math.min(55, w * 0.06);
  const stepY = Math.min(54, h * 0.11);
  const centerX = gate.x + Math.min(260, w * 0.24);
  const startX = centerX - ((COLS - 1) * stepX) / 2;
  const startY = h * 0.5 - ((ROWS - 1) * stepY) / 2;

  return {
    x: startX + col * stepX,
    y: startY + row * stepY,
  };
}

function initNodes(w, h) {
  nodes.length = 0;

  for (let i = 0; i < NODE_COUNT; i += 1) {
    const g = gridTarget(i, w, h);

    nodes.push({
      x: Math.random() * (w * 0.28),
      y: Math.random() * h,
      vx: 0,
      vy: 0,
      repX: 0,
      repY: 0,
      radius: 3.1,
      phase: Math.random() * Math.PI * 2,
      aligned: false,
      targetX: g.x,
      targetY: g.y,
      brightness: 0.5,
      pulse: 0,
    });
  }

  globalPhase = 0;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();

  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  gate.x = rect.width * 0.5;
  gate.y = rect.height * 0.5;
  gate.halfWidth = Math.min(128, rect.width * 0.115);
  gate.halfHeight = Math.min(170, rect.height * 0.3);

  if (nodes.length === 0) {
    initNodes(rect.width, rect.height);
  }
}

function updateTargets(w, h) {
  for (let i = 0; i < nodes.length; i += 1) {
    const g = gridTarget(i, w, h);
    nodes[i].targetX = g.x;
    nodes[i].targetY = g.y;
  }
}

function updateCoupling(time, w) {
  const couplingRadius = 74;
  const repulsionRadius = 16;
  const repulsionGain = 0.06;

  for (const n of nodes) {
    n.repX = 0;
    n.repY = 0;
  }

  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    const driftToCompression = smoothstep(gate.x - w * 0.22, gate.x - w * 0.03, a.x);

    let localSin = 0;
    let localCos = 0;
    let count = 0;

    for (let j = 0; j < nodes.length; j += 1) {
      if (i === j) continue;

      const b = nodes[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < repulsionRadius * repulsionRadius && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const push = (1 - dist / repulsionRadius) * repulsionGain;
        a.repX += (dx / dist) * push;
        a.repY += (dy / dist) * push;
      }

      if (distSq > couplingRadius * couplingRadius) continue;

      localSin += Math.sin(b.phase);
      localCos += Math.cos(b.phase);
      count += 1;
    }

    if (count > 0) {
      const neighborPhase = Math.atan2(localSin / count, localCos / count);
      const delta = Math.atan2(Math.sin(neighborPhase - a.phase), Math.cos(neighborPhase - a.phase));
      const couplingFactor = 0.25 + driftToCompression * 0.75;
      a.phase += delta * params.coupling * couplingFactor;
    }

    if (!a.aligned && a.x < gate.x + gate.halfWidth) {
      const toGlobal = Math.atan2(Math.sin(globalPhase - a.phase), Math.cos(globalPhase - a.phase));
      a.phase += toGlobal * (0.003 + driftToCompression * 0.011);
    }

    a.pulse = Math.sin(time * 0.002 + a.phase);
  }
}

function updateNode(node, i, w, h, time, alignedRatio) {
  const coherence = smoothstep(0.7, 1, alignedRatio);

  if (node.aligned) {
    const amp = params.postLock;
    const offsetY = Math.sin(globalPhase + i * 0.015) * (1.2 + coherence * 1.8) * amp;
    const offsetX = Math.cos(globalPhase + i * 0.02) * (0.5 + coherence * 0.7) * amp;
    node.x += (node.targetX + offsetX - node.x) * 0.16;
    node.y += (node.targetY + offsetY - node.y) * 0.16;
    return;
  }

  const dx = gate.x - node.x;
  const dy = gate.y - node.y;

  const driftToCompression = smoothstep(gate.x - w * 0.24, gate.x - w * 0.03, node.x);
  const compressionBand = smoothstep(gate.x - w * 0.15, gate.x - w * 0.02, node.x);
  const proximity = smoothstep(gate.x - w * 0.34, gate.x + w * 0.02, node.x);

  // reduced early attraction, stronger only near gate
  node.vx += dx * field.centerAttraction * (0.22 + driftToCompression * 0.78);
  node.vy += dy * field.centerAttraction * (0.2 + driftToCompression * 0.8);

  // keep drift zone distributed and smooth
  node.vy += node.pulse * params.drift * 0.6;
  node.vx += Math.cos(time * 0.0013 + node.phase) * params.drift * 0.12;

  const leftZone = node.x < gate.x - w * 0.24;
  if (leftZone) {
    node.vx += 0.0018;
    node.vy += Math.sin(time * 0.001 + i * 0.32) * 0.0025;
  }

  // compression focused near gate, not across entire field
  const funnelCenterY = gate.y + node.pulse * 7;
  node.vy += (funnelCenterY - node.y) * (0.005 + compressionBand * 0.03);

  const gateApproach = smoothstep(gate.x - gate.halfWidth * 2, gate.x + gate.halfWidth * 0.1, node.x);
  const preCrossBoost = smoothstep(gate.x - gate.halfWidth * 1.2, gate.x + gate.halfWidth * 0.04, node.x);
  node.vx += params.gatePull * (0.4 + driftToCompression * 0.6);
  node.vx += gateApproach * field.gateBoost + preCrossBoost * (0.06 * params.gateSpike);
  node.vx += proximity * 0.013;

  // mild local separation keeps pre-gate swarm from collapsing into one blob
  node.vx += node.repX;
  node.vy += node.repY;

  node.vx *= field.damping;
  node.vy *= field.damping;

  node.x += node.vx;
  node.y += node.vy;

  node.x = clamp(node.x, 4, w - 4);
  node.y = clamp(node.y, 4, h - 4);

  if (node.x > gate.x + gate.halfWidth + 16) {
    node.aligned = true;
    node.vx = 0;
    node.vy = 0;
  }

  const spike = smoothstep(gate.x - gate.halfWidth * 1.1, gate.x + gate.halfWidth * 0.3, node.x);
  node.brightness = 0.45 + spike * 0.55 * params.gateSpike;
}

function computeMetrics() {
  let alignedCount = 0;
  let totalDistance = 0;
  let sinSum = 0;
  let cosSum = 0;

  for (const node of nodes) {
    if (node.aligned) alignedCount += 1;
    totalDistance += Math.hypot(gate.x - node.x, gate.y - node.y);
    sinSum += Math.sin(node.phase);
    cosSum += Math.cos(node.phase);
  }

  const alignedRatio = alignedCount / nodes.length;
  const avgDistance = totalDistance / nodes.length;
  const phaseCoherence = Math.hypot(sinSum / nodes.length, cosSum / nodes.length);

  let status = "Drift";
  if (alignedRatio >= 0.98) {
    status = "Lock";
  } else if (alignedRatio >= 0.8) {
    status = "Alignment";
  } else if (avgDistance < gate.halfWidth * 1.75) {
    status = "Gate";
  } else if (avgDistance < canvas.getBoundingClientRect().width * 0.35) {
    status = "Compression";
  }

  return {
    alignedRatio,
    avgDistance,
    phaseCoherence,
    status,
  };
}

function renderMetrics(metrics) {
  metricEls.coherence.textContent = metrics.phaseCoherence.toFixed(2);
  metricEls.distance.textContent = Math.round(metrics.avgDistance).toString();
  metricEls.aligned.textContent = `${Math.round(metrics.alignedRatio * 100)}%`;
  metricEls.status.textContent = metrics.status;
}

function drawGate() {
  ctx.save();
  ctx.strokeStyle = "rgba(111, 151, 191, 0.92)";
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";

  const topY = gate.y - gate.halfHeight;
  const apexY = gate.y + gate.halfHeight * 0.82;

  ctx.beginPath();
  ctx.moveTo(gate.x - gate.halfWidth, topY);
  ctx.lineTo(gate.x, apexY);
  ctx.lineTo(gate.x + gate.halfWidth, topY);
  ctx.stroke();

  ctx.restore();
}

function drawAnnotations(w, h) {
  ctx.save();
  ctx.fillStyle = "rgba(142, 162, 189, 0.75)";
  ctx.font = "12px Inter, system-ui, sans-serif";

  ctx.fillText("Drift", Math.max(14, gate.x - w * 0.42), gate.y - gate.halfHeight - 10);
  ctx.fillText("Gate", gate.x - 12, gate.y - gate.halfHeight - 10);
  ctx.fillText("3x9 lock", gate.x + Math.min(220, w * 0.2), gate.y - gate.halfHeight - 10);

  ctx.restore();
}

function drawNodes() {
  for (const node of nodes) {
    const pulseScale = 1 + node.brightness * 0.1;
    const glowRadius = node.radius + 4 + node.brightness * 2.6;

    const c = Math.floor(170 + node.brightness * 55);
    const core = `rgb(${Math.floor(c * 0.65)}, ${Math.floor(c * 0.9)}, ${c})`;
    const glow = `rgba(140, 211, 255, ${0.12 + node.brightness * 0.18})`;

    ctx.beginPath();
    ctx.fillStyle = glow;
    ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = core;
    ctx.arc(node.x, node.y, node.radius * pulseScale, 0, Math.PI * 2);
    ctx.fill();
  }
}

function resetSimulation() {
  const { width, height } = canvas.getBoundingClientRect();
  initNodes(width, height);
}

function bindControls() {
  controls.drift.addEventListener("input", (e) => {
    params.drift = Number(e.target.value);
  });

  controls.coupling.addEventListener("input", (e) => {
    params.coupling = Number(e.target.value);
  });

  controls.gatePull.addEventListener("input", (e) => {
    params.gatePull = Number(e.target.value);
  });

  controls.gateSpike.addEventListener("input", (e) => {
    params.gateSpike = Number(e.target.value);
  });

  controls.postLock.addEventListener("input", (e) => {
    params.postLock = Number(e.target.value);
  });

  controls.reset.addEventListener("click", resetSimulation);

  controls.playPause.addEventListener("click", () => {
    isPaused = !isPaused;
    controls.playPause.textContent = isPaused ? "Play" : "Pause";
  });
}

function draw(time) {
  const { width: w, height: h } = canvas.getBoundingClientRect();

  updateTargets(w, h);

  if (!isPaused) {
    globalPhase += 0.012;
    updateCoupling(time, w);
  }

  const metrics = computeMetrics();
  renderMetrics(metrics);

  ctx.clearRect(0, 0, w, h);
  drawGate();
  drawAnnotations(w, h);

  for (let i = 0; i < nodes.length; i += 1) {
    if (!isPaused) {
      updateNode(nodes[i], i, w, h, time, metrics.alignedRatio);
    }
  }

  drawNodes();
  requestAnimationFrame(draw);
}

window.addEventListener("resize", resize);
bindControls();
resize();
requestAnimationFrame(draw);
