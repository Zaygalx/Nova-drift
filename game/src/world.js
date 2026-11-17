// The game's rules and state, with no drawing and no browser in it: the player's ship, its
// bullets, three enemy kinds plus the wave-10 Void Core, star shards, power-ups, particles,
// waves, the combo multiplier and the hull. step() advances one fixed step and returns what
// happened as bit flags, so the caller can react without the world knowing about screens or
// sound. Nothing here allocates after createWorld returns: every pool is filled at boot.
import {
  BULLET,
  COMBO,
  ENEMY,
  ENEMY_BULLET,
  FIELD,
  KIND_BOSS,
  KIND_DRIFTER,
  KIND_SPLITTER,
  KIND_SPINNER,
  PLAYER,
  POOL,
  POWERUP,
  POWER_MAGNET,
  POWER_RAPID,
  POWER_SHIELD,
  POWER_SPREAD,
  SHARD,
  WAVE,
} from './config.js';

export const EVENT_HIT = 1;
export const EVENT_PICKUP = 2;
export const EVENT_OVER = 4;
export const EVENT_WIN = 8;
export const EVENT_WAVE = 16;
export const EVENT_BOSS = 32;
export const EVENT_POWER = 64;

// The enemy kinds live in config.js; re-exported here so the renderer and the shot
// stager can read them from the world module alone.
export { KIND_BOSS, KIND_DRIFTER, KIND_SPLITTER, KIND_SPINNER };

function circleHit(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const reach = a.radius + b.radius;
  return dx * dx + dy * dy < reach * reach;
}

function pickKind(random, wave) {
  if (wave >= 5) {
    const roll = random();
    if (roll < 0.55) return KIND_DRIFTER;
    if (roll < 0.8) return KIND_SPINNER;
    return KIND_SPLITTER;
  }
  if (wave >= 3) return random() < 0.7 ? KIND_DRIFTER : KIND_SPINNER;
  return KIND_DRIFTER;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    radius: PLAYER.radius,
    angle: -Math.PI / 2,
    hull: PLAYER.hull,
    invulnerable: 0,
    fireTimer: 0,
    spread: 0,
    rapid: 0,
    magnet: 0,
    shield: false,
  };

  const bullets = [];
  for (let index = 0; index < POOL.bullets; index += 1) {
    bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, radius: BULLET.radius });
  }
  const enemies = [];
  for (let index = 0; index < POOL.enemies; index += 1) {
    enemies.push({
      active: false, kind: KIND_DRIFTER, x: 0, y: 0, vx: 0, vy: 0, radius: 16,
      hp: 1, maxHp: 1, speed: 0, phase: 0, shootTimer: 0, burstTimer: 0, aimTimer: 0,
    });
  }
  const enemyBullets = [];
  for (let index = 0; index < POOL.enemyBullets; index += 1) {
    enemyBullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, radius: ENEMY_BULLET.radius });
  }
  const shards = [];
  for (let index = 0; index < POOL.shards; index += 1) {
    shards.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, radius: SHARD.radius, phase: 0 });
  }
  const powerups = [];
  for (let index = 0; index < POOL.powerups; index += 1) {
    powerups.push({ active: false, kind: POWER_SHIELD, x: 0, y: 0, radius: POWERUP.radius, phase: 0 });
  }
  const particles = [];
  for (let index = 0; index < POOL.particles; index += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff' });
  }

  // The backdrop never changes during a run: the stars and nebula blobs are fixed at boot.
  const stars = [];
  for (let index = 0; index < 130; index += 1) {
    stars.push({
      x: random() * FIELD.width,
      y: random() * FIELD.height,
      radius: 0.6 + random() * 1.6,
      phase: random() * Math.PI * 2,
      speed: 0.6 + random() * 1.8,
    });
  }
  const nebulae = [];
  const nebulaHues = [262, 190, 322, 210, 280];
  for (let index = 0; index < 5; index += 1) {
    nebulae.push({
      x: random() * FIELD.width,
      y: random() * FIELD.height,
      radius: 180 + random() * 220,
      hue: nebulaHues[index],
    });
  }

  const state = {
    player,
    bullets,
    enemies,
    enemyBullets,
    shards,
    powerups,
    particles,
    stars,
    nebulae,
    time: 0,
    wave: 1,
    waveState: 'intro',
    waveTimer: WAVE.introSeconds,
    spawnQueue: 0,
    spawnTimer: 0,
    score: 0,
    combo: 0,
    comboTimer: 0,
    kills: 0,
    shake: 0,
    flash: 0,
    boss: null,
  };

  function multiplier() {
    return Math.min(COMBO.maxMultiplier, 1 + Math.floor(state.combo / COMBO.perStep));
  }

  function free(pool) {
    for (let index = 0; index < pool.length; index += 1) if (!pool[index].active) return pool[index];
    return null;
  }

  function burst(x, y, count, color, speed) {
    for (let index = 0; index < count; index += 1) {
      const particle = free(particles);
      if (particle === null) return;
      const angle = random() * Math.PI * 2;
      const power = speed * (0.3 + random() * 0.7);
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * power;
      particle.vy = Math.sin(angle) * power;
      particle.maxLife = 0.4 + random() * 0.5;
      particle.life = particle.maxLife;
      particle.size = 1.5 + random() * 3;
      particle.color = color;
    }
  }

  function spawnEnemy(kind, x, y) {
    const enemy = free(enemies);
    if (enemy === null) return null;
    const spec = ENEMY[kind];
    const speedScale = 1 + WAVE.speedPerWave * (state.wave - 1);
    enemy.active = true;
    enemy.kind = kind;
    enemy.x = x;
    enemy.y = y;
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.radius = spec.radius;
    enemy.hp = spec.hp;
    enemy.maxHp = spec.hp;
    enemy.speed = spec.speed * speedScale;
    enemy.phase = random() * Math.PI * 2;
    enemy.shootTimer = 2 + random() * 1.5;
    enemy.burstTimer = 2.2;
    enemy.aimTimer = 3.5;
    return enemy;
  }

  function spawnFromEdge(kind) {
    const side = Math.floor(random() * 4);
    const margin = 30;
    if (side === 0) return spawnEnemy(kind, margin + random() * (FIELD.width - margin * 2), -margin);
    if (side === 1) return spawnEnemy(kind, margin + random() * (FIELD.width - margin * 2), FIELD.height + margin);
    if (side === 2) return spawnEnemy(kind, -margin, margin + random() * (FIELD.height - margin * 2));
    return spawnEnemy(kind, FIELD.width + margin, margin + random() * (FIELD.height - margin * 2));
  }

  function dropShard(x, y) {
    const shard = free(shards);
    if (shard === null) return;
    shard.active = true;
    shard.x = x;
    shard.y = y;
    shard.vx = (random() - 0.5) * 90;
    shard.vy = (random() - 0.5) * 90;
    shard.phase = random() * Math.PI * 2;
  }

  function dropPowerup(x, y) {
    const powerup = free(powerups);
    if (powerup === null) return;
    powerup.active = true;
    powerup.kind = Math.floor(random() * 4);
    powerup.x = x;
    powerup.y = y;
    powerup.phase = random() * Math.PI * 2;
  }

  function startWave(wave) {
    state.wave = wave;
    state.waveState = 'intro';
    state.waveTimer = WAVE.introSeconds;
    state.boss = null;
    if (wave === WAVE.count) {
      const boss = spawnEnemy(KIND_BOSS, FIELD.width / 2, 90);
      state.boss = boss;
      state.spawnQueue = 6;
    } else {
      state.spawnQueue = WAVE.baseCount + WAVE.perWave * wave;
    }
    state.spawnTimer = 0.4;
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.angle = -Math.PI / 2;
    player.hull = PLAYER.hull;
    player.invulnerable = 0;
    player.fireTimer = 0;
    player.spread = 0;
    player.rapid = 0;
    player.magnet = 0;
    player.shield = false;
    for (const pool of [bullets, enemies, enemyBullets, shards, powerups, particles]) {
      for (const item of pool) item.active = false;
    }
    state.time = 0;
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.kills = 0;
    state.shake = 0;
    state.flash = 0;
    startWave(1);
  }

  function fireBullet(angle) {
    const bullet = free(bullets);
    if (bullet === null) return;
    bullet.active = true;
    bullet.x = player.x + Math.cos(angle) * (player.radius + 6);
    bullet.y = player.y + Math.sin(angle) * (player.radius + 6);
    bullet.vx = Math.cos(angle) * BULLET.speed;
    bullet.vy = Math.sin(angle) * BULLET.speed;
    bullet.life = BULLET.life;
  }

  function fireEnemyBullet(x, y, angle) {
    const bullet = free(enemyBullets);
    if (bullet === null) return;
    bullet.active = true;
    bullet.x = x;
    bullet.y = y;
    bullet.vx = Math.cos(angle) * ENEMY_BULLET.speed;
    bullet.vy = Math.sin(angle) * ENEMY_BULLET.speed;
    bullet.life = ENEMY_BULLET.life;
  }

  function killEnemy(enemy, events) {
    enemy.active = false;
    state.kills += 1;
    state.combo += 1;
    state.comboTimer = COMBO.window;
    state.score += ENEMY[enemy.kind].score * multiplier();
    const color = enemy.kind === KIND_DRIFTER ? '#ff4d6d' : enemy.kind === KIND_SPINNER ? '#ff9f43' : '#b26bff';
    burst(enemy.x, enemy.y, enemy.kind === KIND_BOSS ? 60 : 16, color, enemy.kind === KIND_BOSS ? 320 : 200);
    dropShard(enemy.x, enemy.y);
    if (random() < 0.35) dropShard(enemy.x + 14, enemy.y - 10);
    if (random() < POWERUP.dropChance) dropPowerup(enemy.x, enemy.y);
    if (enemy.kind === KIND_SPLITTER) {
      spawnEnemy(KIND_DRIFTER, enemy.x - 18, enemy.y);
      spawnEnemy(KIND_DRIFTER, enemy.x + 18, enemy.y);
    }
    if (enemy.kind === KIND_BOSS) {
      state.boss = null;
      state.shake = 22;
      state.flash = 0.6;
      burst(enemy.x, enemy.y, 80, '#ffd166', 380);
      return events | EVENT_WIN;
    }
    state.shake = Math.max(state.shake, 4);
    return events;
  }

  function hitPlayer(events) {
    if (player.invulnerable > 0) return events;
    if (player.shield) {
      player.shield = false;
      player.invulnerable = 0.8;
      burst(player.x, player.y, 18, '#7ce7ff', 220);
      state.shake = Math.max(state.shake, 8);
      return events | EVENT_HIT;
    }
    player.hull -= 1;
    player.invulnerable = PLAYER.invulnerable;
    player.combo = 0;
    player.spread = 0;
    player.rapid = 0;
    player.magnet = 0;
    state.shake = 14;
    state.flash = 0.5;
    burst(player.x, player.y, 26, '#4de3ff', 260);
    if (player.hull <= 0) return events | EVENT_HIT | EVENT_OVER;
    return events | EVENT_HIT;
  }

  function updatePlayer(dt, input) {
    const length = Math.hypot(input.mx, input.my);
    if (length > 0) {
      player.x += (input.mx / length) * PLAYER.speed * dt;
      player.y += (input.my / length) * PLAYER.speed * dt;
    }
    player.x = Math.min(FIELD.width - 24, Math.max(24, player.x));
    player.y = Math.min(FIELD.height - 24, Math.max(24, player.y));
    const aimDx = input.aimX - player.x;
    const aimDy = input.aimY - player.y;
    if (aimDx !== 0 || aimDy !== 0) player.angle = Math.atan2(aimDy, aimDx);
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);
    if (player.spread > 0) player.spread = Math.max(0, player.spread - dt);
    if (player.rapid > 0) player.rapid = Math.max(0, player.rapid - dt);
    if (player.magnet > 0) player.magnet = Math.max(0, player.magnet - dt);
    player.fireTimer -= dt;
    if (input.firing && player.fireTimer <= 0) {
      player.fireTimer = player.rapid > 0 ? PLAYER.rapidCooldown : PLAYER.fireCooldown;
      if (player.spread > 0) {
        fireBullet(player.angle - 0.14);
        fireBullet(player.angle);
        fireBullet(player.angle + 0.14);
      } else {
        fireBullet(player.angle);
      }
    }
  }

  function updateEnemies(dt, events) {
    for (let index = 0; index < enemies.length; index += 1) {
      const enemy = enemies[index];
      if (!enemy.active) continue;
      enemy.phase += dt;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (enemy.kind === KIND_DRIFTER) {
        enemy.vx = (dx / distance) * enemy.speed;
        enemy.vy = (dy / distance) * enemy.speed;
      } else if (enemy.kind === KIND_SPINNER) {
        const toward = 0.7;
        const side = Math.sin(enemy.phase * 2.4);
        const nx = dx / distance;
        const ny = dy / distance;
        enemy.vx = (nx * toward - ny * side * 0.7) * enemy.speed;
        enemy.vy = (ny * toward + nx * side * 0.7) * enemy.speed;
        enemy.shootTimer -= dt;
        if (enemy.shootTimer <= 0 && state.wave >= 4) {
          enemy.shootTimer = 3.5;
          fireEnemyBullet(enemy.x, enemy.y, Math.atan2(dy, dx));
        }
      } else if (enemy.kind === KIND_SPLITTER) {
        enemy.vx = (dx / distance) * enemy.speed;
        enemy.vy = (dy / distance) * enemy.speed;
      } else {
        // The Void Core hovers near the top, swaying, and fires in rings and aimed spreads.
        const targetX = FIELD.width / 2 + Math.sin(enemy.phase * 0.5) * 260;
        enemy.vx = (targetX - enemy.x) * 0.6;
        enemy.vy = (96 - enemy.y) * 0.6;
        enemy.burstTimer -= dt;
        if (enemy.burstTimer <= 0) {
          enemy.burstTimer = 2.4;
          for (let shot = 0; shot < 12; shot += 1) {
            fireEnemyBullet(enemy.x, enemy.y, (shot / 12) * Math.PI * 2 + enemy.phase);
          }
        }
        enemy.aimTimer -= dt;
        if (enemy.aimTimer <= 0) {
          enemy.aimTimer = 3.8;
          const base = Math.atan2(dy, dx);
          fireEnemyBullet(enemy.x, enemy.y, base - 0.18);
          fireEnemyBullet(enemy.x, enemy.y, base);
          fireEnemyBullet(enemy.x, enemy.y, base + 0.18);
        }
      }
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
    }
    return events;
  }

  /**
   * One fixed step. `input` is {mx, my, aimX, aimY, firing}. With `harmless` set (the title
   * screen's backdrop) drifters wander and nothing touches the player and nothing scores.
   */
  function step(dt, input, harmless) {
    let events = 0;
    state.time += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 1.8);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }

    if (harmless) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        state.spawnTimer = 1.1;
        let alive = 0;
        for (const enemy of enemies) if (enemy.active) alive += 1;
        if (alive < 6) spawnFromEdge(KIND_DRIFTER);
      }
      for (const enemy of enemies) {
        if (!enemy.active) continue;
        enemy.phase += dt;
        enemy.y += 46 * dt;
        enemy.x += Math.sin(enemy.phase * 1.4) * 22 * dt;
        if (enemy.y > FIELD.height + 40) enemy.active = false;
      }
      player.x = FIELD.width / 2 + Math.sin(state.time * 0.5) * 30;
      player.y = FIELD.height / 2 + Math.cos(state.time * 0.7) * 16;
      player.angle = -Math.PI / 2 + Math.sin(state.time * 0.5) * 0.2;
      return events;
    }

    if (state.waveState === 'intro') {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) {
        state.waveState = 'fight';
        if (state.wave === WAVE.count) events |= EVENT_BOSS;
      }
    } else if (state.waveState === 'fight') {
      if (state.spawnQueue > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          state.spawnTimer = Math.max(
            WAVE.minSpawnInterval,
            WAVE.spawnInterval * WAVE.spawnScale ** (state.wave - 1),
          );
          spawnFromEdge(pickKind(random, state.wave));
          state.spawnQueue -= 1;
        }
      }
    } else {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) startWave(state.wave + 1);
    }

    updatePlayer(dt, input);
    events = updateEnemies(dt, events);

    for (const bullet of bullets) {
      if (!bullet.active) continue;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.life <= 0 || bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20) {
        bullet.active = false;
      }
    }

    for (const bullet of enemyBullets) {
      if (!bullet.active) continue;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.life <= 0 || bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20) {
        bullet.active = false;
      }
    }

    // Bullets against enemies.
    for (const bullet of bullets) {
      if (!bullet.active) continue;
      for (const enemy of enemies) {
        if (!enemy.active || !circleHit(bullet, enemy)) continue;
        bullet.active = false;
        enemy.hp -= 1;
        burst(bullet.x, bullet.y, 5, '#bff3ff', 140);
        if (enemy.hp <= 0) {
          events = killEnemy(enemy, events);
          if (events & EVENT_WIN) return events;
        }
        break;
      }
    }

    // Enemies and their bullets against the ship.
    for (const enemy of enemies) {
      if (!enemy.active || !circleHit(enemy, player)) continue;
      if (enemy.kind !== KIND_BOSS) {
        enemy.hp -= 1;
        if (enemy.hp <= 0) {
          events = killEnemy(enemy, events);
          if (events & EVENT_WIN) return events;
        } else {
          enemy.x -= (player.x - enemy.x) * 0.4;
          enemy.y -= (player.y - enemy.y) * 0.4;
        }
      }
      events = hitPlayer(events);
      if (events & EVENT_OVER) return events;
    }
    for (const bullet of enemyBullets) {
      if (!bullet.active || !circleHit(bullet, player)) continue;
      bullet.active = false;
      events = hitPlayer(events);
      if (events & EVENT_OVER) return events;
    }

    // Shards: pulled in by the magnet, collected on touch.
    for (const shard of shards) {
      if (!shard.active) continue;
      shard.phase += dt;
      const dx = player.x - shard.x;
      const dy = player.y - shard.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (player.magnet > 0 && distance < SHARD.magnetRadius) {
        shard.vx = (dx / distance) * 420;
        shard.vy = (dy / distance) * 420;
      } else {
        shard.vx *= 0.98;
        shard.vy *= 0.98;
      }
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      if (distance < SHARD.collectRadius) {
        shard.active = false;
        state.combo += 1;
        state.comboTimer = COMBO.window;
        state.score += SHARD.value * multiplier();
        events |= EVENT_PICKUP;
      }
    }

    // Power-ups drift down and apply on touch.
    for (const powerup of powerups) {
      if (!powerup.active) continue;
      powerup.phase += dt;
      powerup.y += POWERUP.fallSpeed * dt;
      if (powerup.y > FIELD.height + 20) {
        powerup.active = false;
        continue;
      }
      if (!circleHit(powerup, player)) continue;
      powerup.active = false;
      if (powerup.kind === POWER_SHIELD) player.shield = true;
      else if (powerup.kind === POWER_SPREAD) player.spread = POWERUP.duration;
      else if (powerup.kind === POWER_RAPID) player.rapid = POWERUP.duration;
      else player.magnet = POWERUP.duration;
      burst(powerup.x, powerup.y, 14, '#8dff9e', 180);
      events |= EVENT_POWER;
    }

    for (const particle of particles) {
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.985;
      particle.vy *= 0.985;
    }

    // Wave cleared: the queue is empty and nothing hostile is left standing.
    if (state.waveState === 'fight' && state.spawnQueue === 0) {
      let alive = false;
      for (const enemy of enemies) if (enemy.active) alive = true;
      if (!alive) {
        state.score += WAVE.clearBonus * state.wave;
        state.waveState = 'clear';
        state.waveTimer = WAVE.clearSeconds;
        events |= EVENT_WAVE;
      }
    }
    return events;
  }

  reset();
  return { state, reset, step, multiplier };
}
