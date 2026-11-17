// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 playfield
// is scaled to fit the window and centred, the margin filled with the backdrop colour. Neon
// shapes with glow, canvas text for the HUD and the panels. Text that holds a number is rebuilt
// only when the number changes, so a frame allocates nothing.
import { COMBO, FIELD, FONT, PALETTE, PLAYER, POWER_MAGNET, POWER_RAPID, POWER_SHIELD, POWER_SPREAD } from './config.js';
import { KIND_BOSS, KIND_DRIFTER, KIND_SPLITTER, KIND_SPINNER } from './world.js';

// The combo meter only appears once a combo is worth showing.
const COMBO_MIN_SHOW = 4;

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

/** The panel's width; its height grows with its lines: room for the title, the lines and the prompt. */
const PANEL = { width: 640, top: 150, line: 32, bottom: 72 };

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function polygon(context, x, y, radius, sides, rotation) {
  context.beginPath();
  for (let index = 0; index < sides; index += 1) {
    const angle = rotation + (index / sides) * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, ratio: 1 };
  const scoreLabel = cachedLabel('SCORE ');
  const waveLabel = cachedLabel('WAVE ');
  const bestLabel = cachedLabel('BEST ');
  const finalLabel = cachedLabel('SCORE ');
  const comboLabel = cachedLabel('COMBO x');
  let background = null;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.ratio = ratio;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
    background = context.createLinearGradient(0, 0, 0, FIELD.height);
    background.addColorStop(0, PALETTE.skyTop);
    background.addColorStop(1, PALETTE.skyBottom);
  }

  /** Page CSS pixels (a pointer event) into playfield coordinates. */
  function toField(clientX, clientY) {
    return {
      x: (clientX * view.ratio - view.x) / view.scale,
      y: (clientY * view.ratio - view.y) / view.scale,
    };
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function glow(color, blur) {
    context.shadowColor = color;
    context.shadowBlur = blur;
  }

  function drawBackdrop(state) {
    context.fillStyle = background;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    for (const nebula of state.nebulae) {
      const gradient = context.createRadialGradient(nebula.x, nebula.y, 0, nebula.x, nebula.y, nebula.radius);
      gradient.addColorStop(0, `hsla(${nebula.hue}, 70%, 55%, 0.20)`);
      gradient.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
      context.fillStyle = gradient;
      context.fillRect(nebula.x - nebula.radius, nebula.y - nebula.radius, nebula.radius * 2, nebula.radius * 2);
    }
    for (const star of state.stars) {
      const alpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(state.time * star.speed + star.phase));
      context.globalAlpha = alpha;
      context.fillStyle = '#dfe9ff';
      context.beginPath();
      context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawShip(state) {
    const player = state.player;
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 10) % 2 === 0) return;
    const flame = 10 + Math.sin(state.time * 34) * 5;
    context.save();
    context.translate(player.x, player.y);
    context.rotate(player.angle);
    // Engine flame.
    context.fillStyle = '#ff9f43';
    glow('#ff9f43', 14);
    context.beginPath();
    context.moveTo(-player.radius * 0.7, -6);
    context.lineTo(-player.radius * 0.7 - flame, 0);
    context.lineTo(-player.radius * 0.7, 6);
    context.closePath();
    context.fill();
    // Hull: a swept dart.
    context.fillStyle = PALETTE.player;
    glow(PALETTE.player, 18);
    context.beginPath();
    context.moveTo(player.radius + 6, 0);
    context.lineTo(-player.radius * 0.8, player.radius * 0.85);
    context.lineTo(-player.radius * 0.35, 0);
    context.lineTo(-player.radius * 0.8, -player.radius * 0.85);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.playerCore;
    context.beginPath();
    context.arc(2, 0, 5, 0, Math.PI * 2);
    context.fill();
    context.restore();
    if (player.shield) {
      context.strokeStyle = PALETTE.shield;
      context.lineWidth = 2;
      glow(PALETTE.shield, 12);
      context.beginPath();
      context.arc(player.x, player.y, player.radius + 12 + Math.sin(state.time * 5) * 2, 0, Math.PI * 2);
      context.stroke();
    }
    context.shadowBlur = 0;
  }

  function drawEnemies(state) {
    for (const enemy of state.enemies) {
      if (!enemy.active) continue;
      context.save();
      context.translate(enemy.x, enemy.y);
      if (enemy.kind === KIND_DRIFTER) {
        context.rotate(enemy.phase * 0.8);
        context.fillStyle = PALETTE.enemyDrifter;
        glow(PALETTE.enemyDrifter, 14);
        polygon(context, 0, 0, enemy.radius, 3, 0);
        context.fill();
        context.fillStyle = '#ffd7de';
        polygon(context, 0, 0, enemy.radius * 0.4, 3, 0);
        context.fill();
      } else if (enemy.kind === KIND_SPINNER) {
        context.rotate(enemy.phase * 2.2);
        context.fillStyle = PALETTE.enemySpinner;
        glow(PALETTE.enemySpinner, 14);
        polygon(context, 0, 0, enemy.radius, 4, 0);
        context.fill();
        context.fillStyle = '#fff1d6';
        context.beginPath();
        context.arc(0, 0, 4, 0, Math.PI * 2);
        context.fill();
      } else if (enemy.kind === KIND_SPLITTER) {
        context.rotate(enemy.phase * 0.5);
        context.fillStyle = PALETTE.enemySplitter;
        glow(PALETTE.enemySplitter, 14);
        polygon(context, 0, 0, enemy.radius, 6, 0);
        context.fill();
        context.fillStyle = '#e6d6ff';
        polygon(context, 0, 0, enemy.radius * 0.45, 6, Math.PI / 6);
        context.fill();
      } else {
        // The Void Core: a ringed eye with a health arc.
        context.rotate(enemy.phase * 0.3);
        context.strokeStyle = PALETTE.enemyBoss;
        context.lineWidth = 6;
        glow(PALETTE.enemyBoss, 22);
        context.beginPath();
        context.arc(0, 0, enemy.radius, 0, Math.PI * 2);
        context.stroke();
        polygon(context, 0, 0, enemy.radius * 0.72, 8, 0);
        context.fillStyle = '#3d0a1e';
        context.fill();
        context.fillStyle = '#ff8fb0';
        context.beginPath();
        context.arc(0, 0, enemy.radius * 0.28 + Math.sin(state.time * 3) * 3, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
      context.shadowBlur = 0;
    }
  }

  function drawShots(state) {
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const bullet of state.bullets) {
      if (!bullet.active) continue;
      context.strokeStyle = PALETTE.bullet;
      context.lineWidth = 3;
      glow(PALETTE.bullet, 8);
      context.beginPath();
      context.moveTo(bullet.x - bullet.vx * 0.016, bullet.y - bullet.vy * 0.016);
      context.lineTo(bullet.x, bullet.y);
      context.stroke();
    }
    for (const bullet of state.enemyBullets) {
      if (!bullet.active) continue;
      context.fillStyle = PALETTE.enemyBullet;
      glow(PALETTE.enemyBullet, 10);
      context.beginPath();
      context.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    context.shadowBlur = 0;
  }

  function drawPickups(state) {
    for (const shard of state.shards) {
      if (!shard.active) continue;
      const pulse = 1 + Math.sin(shard.phase * 5) * 0.15;
      context.save();
      context.translate(shard.x, shard.y);
      context.rotate(shard.phase);
      context.fillStyle = PALETTE.shard;
      glow(PALETTE.shard, 10);
      polygon(context, 0, 0, shard.radius * pulse, 4, 0);
      context.fill();
      context.restore();
    }
    context.shadowBlur = 0;
    const names = ['SHIELD', 'SPREAD', 'RAPID', 'MAGNET'];
    const colors = [PALETTE.shield, PALETTE.spread, PALETTE.rapid, PALETTE.magnet];
    for (const powerup of state.powerups) {
      if (!powerup.active) continue;
      const bob = Math.sin(powerup.phase * 3) * 3;
      context.save();
      context.translate(powerup.x, powerup.y + bob);
      context.fillStyle = 'rgba(10, 16, 38, 0.9)';
      glow(colors[powerup.kind], 12);
      context.beginPath();
      context.arc(0, 0, powerup.radius + 4, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = colors[powerup.kind];
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = colors[powerup.kind];
      context.font = `bold 13px ${FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(names[powerup.kind][0], 0, 1);
      context.restore();
    }
    context.shadowBlur = 0;
  }

  function drawParticles(state) {
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const particle of state.particles) {
      if (!particle.active) continue;
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    context.globalAlpha = 1;
  }

  function drawHud(state, multiplier) {
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 28, PALETTE.text, 'left');
    text(waveLabel(state.wave), FIELD.width / 2, 18, 28, PALETTE.text, 'center');
    const heartSize = 18;
    const heartGap = 8;
    const firstHeart = FIELD.width - 24 - PLAYER.hull * (heartSize + heartGap) + heartGap;
    text('HULL', firstHeart - 14, 18, 28, PALETTE.text, 'right');
    for (let hull = 0; hull < PLAYER.hull; hull += 1) {
      const x = firstHeart + hull * (heartSize + heartGap);
      context.save();
      context.translate(x + heartSize / 2, 26 + heartSize / 2);
      context.fillStyle = hull < state.player.hull ? PALETTE.player : 'rgba(120, 130, 160, 0.35)';
      glow(hull < state.player.hull ? PALETTE.player : 'transparent', hull < state.player.hull ? 8 : 0);
      context.beginPath();
      context.moveTo(heartSize / 2, 0);
      context.lineTo(-heartSize / 2, heartSize / 2);
      context.lineTo(0, -heartSize / 2);
      context.closePath();
      context.fill();
      context.restore();
    }
    context.shadowBlur = 0;
    if (state.combo >= COMBO_MIN_SHOW) {
      text(comboLabel(multiplier), 24, 54, 22, PALETTE.shard, 'left');
      const barWidth = 150;
      context.fillStyle = 'rgba(120, 130, 160, 0.35)';
      context.fillRect(24, 84, barWidth, 6);
      context.fillStyle = PALETTE.shard;
      context.fillRect(24, 84, barWidth * Math.max(0, state.comboTimer / COMBO.window), 6);
    }
    const chips = [];
    if (state.player.shield) chips.push(['SHIELD', PALETTE.shield]);
    if (state.player.spread > 0) chips.push([`SPREAD ${Math.ceil(state.player.spread)}s`, PALETTE.spread]);
    if (state.player.rapid > 0) chips.push([`RAPID ${Math.ceil(state.player.rapid)}s`, PALETTE.rapid]);
    if (state.player.magnet > 0) chips.push([`MAGNET ${Math.ceil(state.player.magnet)}s`, PALETTE.magnet]);
    if (chips.length > 0) {
      context.font = `16px ${FONT}`;
      let chipX = FIELD.width / 2;
      const widths = chips.map(([label]) => context.measureText(label).width + 18);
      const total = widths.reduce((sum, width) => sum + width + 8, -8);
      chipX -= total / 2;
      for (let index = 0; index < chips.length; index += 1) {
        context.fillStyle = 'rgba(10, 16, 38, 0.85)';
        context.fillRect(chipX, 52, widths[index], 24);
        context.strokeStyle = chips[index][1];
        context.lineWidth = 1;
        context.strokeRect(chipX, 52, widths[index], 24);
        context.fillStyle = chips[index][1];
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(chips[index][0], chipX + widths[index] / 2, 65);
        chipX += widths[index] + 8;
      }
    }
    if (state.waveState === 'intro') {
      text(state.wave === 10 ? 'WAVE 10 — THE VOID CORE' : `WAVE ${state.wave}`, FIELD.width / 2, 120, 44, PALETTE.text, 'center');
    } else if (state.waveState === 'clear') {
      text('WAVE CLEAR', FIELD.width / 2, 120, 44, PALETTE.shard, 'center');
    }
    if (state.boss !== null && state.boss.active) {
      const barWidth = 420;
      const barX = (FIELD.width - barWidth) / 2;
      const barY = FIELD.height - 44;
      text('VOID CORE', FIELD.width / 2, barY - 26, 20, PALETTE.enemyBoss, 'center');
      context.fillStyle = 'rgba(120, 130, 160, 0.35)';
      context.fillRect(barX, barY, barWidth, 12);
      context.fillStyle = PALETTE.enemyBoss;
      context.fillRect(barX, barY, barWidth * Math.max(0, state.boss.hp / state.boss.maxHp), 12);
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 46, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 23, PALETTE.shard, 'center');
  }

  const TITLE_LINES = [
    'Pilot the last light of the Drift through 10 waves of the Void.',
    'Move with WASD or arrows. Aim with the mouse, fire with click or Space.',
    'Blast shards, splitters and spinners. Grab star shards to build a combo.',
    'Catch power-ups: shield, spread shot, rapid fire, magnet.',
    'Destroy the Void Core on wave 10 to win. Three hulls — make them count.',
    '',
  ];
  const PAUSED_LINES = ['The Void will wait for you.'];
  const OVER_LINES = ['', ''];
  const WIN_LINES = ['', 'The Void Core is dust. The Drift is yours.'];

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, multiplier) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (state.shake > 0) {
      context.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawBackdrop(state);
    drawPickups(state);
    drawEnemies(state);
    drawShots(state);
    drawParticles(state);
    drawShip(state);
    if (state.flash > 0) {
      context.fillStyle = `rgba(255, 40, 70, ${state.flash * 0.35})`;
      context.fillRect(-20, -20, FIELD.width + 40, FIELD.height + 40);
    }
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[5] = bestLabel(best);
      drawPanel('NOVA DRIFT', TITLE_LINES, 'Press Space or click to launch');
      return;
    }
    drawHud(state, multiplier);
    if (screen === SCREEN_PAUSED) drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = finalLabel(state.score);
      OVER_LINES[1] = bestLabel(best);
      drawPanel('DRIFT LOST', OVER_LINES, 'Press Space or click to fly again');
    } else if (screen === SCREEN_WIN) {
      WIN_LINES[0] = `${finalLabel(state.score)}   ${bestLabel(best)}`;
      drawPanel('THE DRIFT IS CLEAR', WIN_LINES, 'Press Space or click to fly again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toField };
}
