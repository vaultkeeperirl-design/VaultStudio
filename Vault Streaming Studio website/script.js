const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const verificationSection = new URLSearchParams(window.location.search).get('section');

if (verificationSection) {
  window.addEventListener('load', () => {
    document.getElementById(verificationSection)?.scrollIntoView({ block: 'start' });
  });
}

const header = document.querySelector('.site-header');
const updateHeader = () => {
  header?.classList.toggle('is-scrolled', window.scrollY > 16);
};
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) entry.target.classList.add('is-visible');
    }
  },
  { threshold: 0.16 }
);
document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

const stage = document.getElementById('hero-stage');
const studioWindow = stage?.querySelector('.studio-window');
if (stage && studioWindow && !prefersReducedMotion) {
  stage.addEventListener('pointermove', (event) => {
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    studioWindow.style.setProperty('--tilt-y', `${-10 + x * 8}deg`);
    studioWindow.style.setProperty('--tilt-x', `${7 - y * 7}deg`);
  });

  stage.addEventListener('pointerleave', () => {
    studioWindow.style.setProperty('--tilt-y', '-10deg');
    studioWindow.style.setProperty('--tilt-x', '7deg');
  });
}

const canvas = document.getElementById('signal-canvas');
const ctx = canvas?.getContext('2d');
const points = [];

function resizeCanvas() {
  if (!canvas || !ctx) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function seedPoints() {
  points.length = 0;
  const count = Math.max(24, Math.floor(window.innerWidth / 58));
  for (let i = 0; i < count; i += 1) {
    points.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      c: i % 5 === 0 ? '#d6a23a' : i % 7 === 0 ? '#ff0033' : '#27a8ff',
    });
  }
}

function drawSignals() {
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  for (const p of points) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < -20) p.x = window.innerWidth + 20;
    if (p.x > window.innerWidth + 20) p.x = -20;
    if (p.y < -20) p.y = window.innerHeight + 20;
    if (p.y > window.innerHeight + 20) p.y = -20;
  }

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i];
      const b = points[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 185) {
        ctx.globalAlpha = (1 - distance / 185) * 0.22;
        ctx.strokeStyle = a.c;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  for (const p of points) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = p.c;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (!prefersReducedMotion) requestAnimationFrame(drawSignals);
}

if (canvas && ctx) {
  resizeCanvas();
  seedPoints();
  drawSignals();
  window.addEventListener(
    'resize',
    () => {
      resizeCanvas();
      seedPoints();
    },
    { passive: true }
  );
}
