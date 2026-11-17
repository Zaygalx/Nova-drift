// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical area;
// the renderer scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 15,
  speed: 360,
  fireCooldown: 0.17,
  rapidCooldown: 0.09,
  invulnerable: 1.6,
  hull: 3,
};

export const BULLET = {
  radius: 4,
  speed: 760,
  life: 1.1,
};

/** Enemy bullets: slow orbs the boss and spinners throw at the ship. */
export const ENEMY_BULLET = {
  radius: 5,
  speed: 210,
  life: 6,
};

/** Enemy kinds, by the number the world stores in each enemy's `kind`. */
export const KIND_DRIFTER = 0;
export const KIND_SPINNER = 1;
export const KIND_SPLITTER = 2;
export const KIND_BOSS = 3;

export const ENEMY = {
  [KIND_DRIFTER]: { radius: 16, speed: 78, hp: 1, score: 50 },
  [KIND_SPINNER]: { radius: 14, speed: 118, hp: 1, score: 80 },
  [KIND_SPLITTER]: { radius: 23, speed: 52, hp: 2, score: 100 },
  [KIND_BOSS]: { radius: 62, speed: 34, hp: 70, score: 2000 },
};

/** Pickups dropped by destroyed enemies: star shards score, power-ups change the ship. */
export const SHARD = { radius: 9, value: 25, magnetRadius: 230, collectRadius: 30 };
export const POWERUP = { radius: 14, dropChance: 0.1, duration: 12, fallSpeed: 70 };
export const POWER_SHIELD = 0;
export const POWER_SPREAD = 1;
export const POWER_RAPID = 2;
export const POWER_MAGNET = 3;

/** Combo: each kill adds one; 4 s without a kill resets it. Multiplier is 1 + combo/4, capped. */
export const COMBO = { window: 4, perStep: 4, maxMultiplier: 8 };

/** Waves: 1 to 10. Wave 10 is the Void Core; destroying it wins the game. */
export const WAVE = {
  count: 10,
  introSeconds: 1.6,
  clearSeconds: 2.2,
  baseCount: 5,
  perWave: 2,
  spawnInterval: 1.05,
  spawnScale: 0.93,
  minSpawnInterval: 0.34,
  speedPerWave: 0.06,
  clearBonus: 100,
};

/** How many of each thing can exist at once; the pools are allocated once, at boot. */
export const POOL = { bullets: 128, enemies: 48, enemyBullets: 160, shards: 64, powerups: 8, particles: 256 };

export const PALETTE = {
  backdrop: '#05070f',
  skyTop: '#0a1030',
  skyBottom: '#05070f',
  nebulaA: 'rgba(88, 60, 180, 0.20)',
  nebulaB: 'rgba(20, 140, 160, 0.16)',
  nebulaC: 'rgba(180, 60, 120, 0.12)',
  player: '#4de3ff',
  playerCore: '#eafcff',
  bullet: '#bff3ff',
  enemyDrifter: '#ff4d6d',
  enemySpinner: '#ff9f43',
  enemySplitter: '#b26bff',
  enemyBoss: '#ff2e63',
  enemyBullet: '#ff5c8a',
  shard: '#ffd166',
  shield: '#7ce7ff',
  spread: '#8dff9e',
  rapid: '#ffb84d',
  magnet: '#ff7ad9',
  panel: 'rgba(10, 16, 38, 0.92)',
  panelEdge: '#2b3a6e',
  text: '#eef1f5',
  muted: '#9aa7c7',
  danger: '#ff5c6c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'nova-drift.best';
