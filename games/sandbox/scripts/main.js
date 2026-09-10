import { createSandbox } from './sandbox.js';

const canvas = document.getElementById('canvas');
const boot = document.getElementById('boot');
const statusEl = document.getElementById('boot-status');
const fillEl = document.getElementById('boot-fill');
const hint = document.getElementById('hint');

const setBoot = (label, pct) => {
  if (statusEl) statusEl.textContent = label;
  if (fillEl) fillEl.style.width = `${Math.max(0, Math.min(100, pct))}%`;
};

const finishBoot = () => {
  boot?.classList.add('is-done');
  if (hint) hint.hidden = false;
};

setBoot('Starting engine…', 6);

createSandbox(canvas, { onBoot: setBoot })
  .then(() => {
    setBoot('Ready', 100);
    requestAnimationFrame(() => finishBoot());
  })
  .catch((err) => {
    console.error(err);
    setBoot(err?.message ? `Failed: ${err.message}` : 'Failed to start', 100);
  });
