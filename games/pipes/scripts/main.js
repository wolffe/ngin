import { createPipesGame } from './game.js';

const canvas = document.getElementById('canvas');
const boot = document.getElementById('boot');
const status = document.getElementById('boot-status');
const fill = document.getElementById('boot-fill');

createPipesGame(canvas)
    .then(() => {
        status.textContent = 'Ready';
        fill.style.width = '100%';
        requestAnimationFrame(() => boot.classList.add('is-done'));
    })
    .catch(error => {
        console.error(error);
        status.textContent = `Failed: ${error.message}`;
    });
