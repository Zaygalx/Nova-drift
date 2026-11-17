// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules forward from
// a fresh world for a fixed number of steps, steered by a simple autopilot, so the frame is what
// a short game really looks like and the same seed always gives the same frame. The play scene's
// pilot flies well: it keeps clear of enemies and their bullets, chases shards and shoots the
// nearest enemy. The end scene's pilot stands its ground and shoots, as a hurried player does,
// so the Void catches it and the frame is a real game over.
import { FIELD, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const END_LIMIT_SECONDS = 600;

/** The nearest active enemy to the ship, or null when the field is clear. */
function nearestEnemy(state) {
  let best = null;
  let bestDistance = Infinity;
  for (const enemy of state.enemies) {
    if (!enemy.active) continue;
    const distance = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = enemy;
    }
  }
  return best;
}

/** The nearest star shard, or null when none is on the field. */
function nearestShard(state) {
  let best = null;
  let bestDistance = Infinity;
  for (const shard of state.shards) {
    if (!shard.active) continue;
    const distance = Math.hypot(shard.x - state.player.x, shard.y - state.player.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = shard;
    }
  }
  return best;
}

/** The nearest enemy bullet, or null when none is flying. */
function nearestBullet(state) {
  let best = null;
  let bestDistance = Infinity;
  for (const bullet of state.enemyBullets) {
    if (!bullet.active) continue;
    const distance = Math.hypot(bullet.x - state.player.x, bullet.y - state.player.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = bullet;
    }
  }
  return best;
}

/**
 * The play pilot's steering: away from the nearest enemy or bullet when one is close, toward
 * the nearest shard otherwise, and toward the middle of the field when there is nothing to do.
 */
function playSteering(state) {
  const player = state.player;
  const threat = nearestEnemy(state);
  const bullet = nearestBullet(state);
  let tx = FIELD.width / 2;
  let ty = FIELD.height / 2;
  if (bullet !== null && Math.hypot(bullet.x - player.x, bullet.y - player.y) < 120) {
    tx = player.x + (player.x - bullet.x);
    ty = player.y + (player.y - bullet.y);
  } else if (threat !== null && Math.hypot(threat.x - player.x, threat.y - player.y) < 170) {
    tx = player.x + (player.x - threat.x);
    ty = player.y + (player.y - threat.y);
  } else {
    const shard = nearestShard(state);
    if (shard !== null) {
      tx = shard.x;
      ty = shard.y;
    }
  }
  const dx = tx - player.x;
  const dy = ty - player.y;
  const length = Math.hypot(dx, dy);
  if (length < 12) return { mx: 0, my: 0 };
  return { mx: dx / length, my: dy / length };
}

/** The pilot's input for one step: where to steer, where to aim and whether to fire. */
function pilot(state, skilled) {
  const enemy = nearestEnemy(state);
  const aimX = enemy === null ? state.player.x : enemy.x;
  const aimY = enemy === null ? state.player.y - 100 : enemy.y;
  if (!skilled) return { mx: 0, my: 0, aimX, aimY, firing: enemy !== null };
  const steering = playSteering(state);
  return { mx: steering.mx, my: steering.my, aimX, aimY, firing: enemy !== null };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, { mx: 0, my: 0, aimX: FIELD.width / 2, aimY: FIELD.height / 2, firing: false }, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const limit = name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
  const skilled = name === 'play';
  let events = 0;
  for (let index = 0; index < limit / STEP; index += 1) {
    events = world.step(STEP, pilot(world.state, skilled), false);
    if (events & (EVENT_OVER | EVENT_WIN)) break;
  }
  if (skilled && !(events & (EVENT_OVER | EVENT_WIN))) {
    // The frame must show a fight, not the quiet gap between waves: keep playing until the
    // wave is running and at least three enemies are on the field (or 30 s pass).
    let extra = 0;
    while (extra < 30 / STEP) {
      let alive = 0;
      for (const enemy of world.state.enemies) if (enemy.active) alive += 1;
      if (world.state.waveState === 'fight' && alive >= 3) break;
      events = world.step(STEP, pilot(world.state, skilled), false);
      if (events & (EVENT_OVER | EVENT_WIN)) break;
      extra += 1;
    }
  }
  if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: world.state.score };
  if (world.state.player.hull === 0) return { screen: SCREEN_OVER, best: world.state.score };
  return { screen: SCREEN_PLAY, best: world.state.score };
}
