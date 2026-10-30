import * as Phaser from "phaser";
import { Squish } from "./Squish";
import {
  catPath,
  GameBridge,
  initialState,
  radii,
  type GameState,
} from "./bridge";

type Cat = {
  sprite: Phaser.Physics.Matter.Image;
  tier: number;
  born: number;
  claimed: boolean;
  dangerSince: number;
  artwork: Phaser.GameObjects.Image;
  visual: Phaser.GameObjects.Container;
  squish: Squish;
};
// Phaser's bundled Matter has contactCount/normalImpulse, but its public
// collision event types omit these solver fields.
type ContactPair = Omit<MatterJS.ICollisionPair, "bodyA" | "bodyB" | "contacts"> & {
  bodyA: MatterJS.BodyType;
  bodyB: MatterJS.BodyType;
  contactCount: number;
  contacts: { normalImpulse: number }[];
};
const BASE_WIDTH = 480;
const BASE_HEIGHT = 600;
const BEST_KEY = "cat-merge.best.v1",
  SOUND_KEY = "cat-merge.muted.v1";

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Gameplay still works with storage blocked. */
  }
}

export default class CatScene extends Phaser.Scene {
  private bridge: GameBridge;
  private state: GameState = { ...initialState };
  private cats = new Map<number, Cat>();
  private current = 1;
  private aimX = 240;
  private preview!: Phaser.GameObjects.Image;
  private guide!: Phaser.GameObjects.Graphics;
  private danger!: Phaser.GameObjects.Graphics;
  private lastDrop = -1000;
  private audio?: AudioContext;
  private subscriptions: (() => void)[] = [];
  private pendingMerges: [Cat, Cat][] = [];
  private loadFailed = false;
  private paused = false;
  private pausedAt = 0;
  private width = BASE_WIDTH;
  private height = BASE_HEIGHT;
  private sx = 1;
  private sy = 1;
  private unit = 1;
  private container!: Phaser.GameObjects.Graphics;

  constructor(bridge: GameBridge) {
    super("CatMerge");
    this.bridge = bridge;
  }

  preload() {
    this.load.on("loaderror", () => {
      this.loadFailed = true;
    });
    for (let tier = 1; tier <= 10; tier++)
      this.load.image(`cat-${tier}`, catPath(tier));
  }

  create() {
    this.resize(this.scale.gameSize);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
    const storedBest = Number(read(BEST_KEY));
    this.state = {
      ...initialState,
      best: Number.isSafeInteger(storedBest) && storedBest > 0 ? storedBest : 0,
      muted: read(SOUND_KEY) === "true",
      status: this.loadFailed ? "error" : "playing",
    };
    if (this.loadFailed) {
      this.publish();
      return;
    }
    // Trim transparent padding in texture frames only; original files stay untouched.
    for (let tier = 1; tier <= 10; tier++)
      this.textures.get(`cat-${tier}`).add("trimmed", 0, 85, 70, 854, 884);
    this.matter.world.engine.positionIterations = 8;
    this.matter.world.engine.velocityIterations = 8;
    this.container = this.add.graphics();
    this.drawContainer();
    this.resize(this.scale.gameSize);
    this.guide = this.add.graphics().setDepth(1);
    this.danger = this.add.graphics().setDepth(10);
    this.preview = this.add
      .image(this.aimX, this.height * 0.095, "cat-1", "trimmed")
      .setDepth(20);
    this.state.next = this.randomTier();
    this.updatePreview();
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) =>
      this.aim(pointer.x),
    );
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.aim(pointer.x);
      this.unlockAudio();
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (
        pointer.downX >= 0 &&
        pointer.downX <= this.width &&
        pointer.downY >= 0 &&
        pointer.downY <= this.height
      ) {
        this.aim(pointer.x);
        this.drop();
      }
    });
    this.matter.world.on("collisionstart", this.collide, this);
    this.matter.world.on("collisionstart", this.squishOnImpact, this);
    this.matter.world.on("collisionactive", this.collide, this);
    this.matter.world.on("afterupdate", this.updateSquish, this);
    this.subscriptions = [
      this.bridge.on("restart", () => this.restart()),
      this.bridge.on("sound", () => {
        this.state.muted = !this.state.muted;
        save(SOUND_KEY, String(this.state.muted));
        this.unlockAudio();
        this.publish();
      }),
      this.bridge.on("aim", (step) => this.aim(this.aimX + step)),
      this.bridge.on("drop", () => {
        this.unlockAudio();
        this.drop();
      }),
      this.bridge.on("pause", (paused) => {
        if (paused === this.paused) return;
        if (paused) this.pausedAt = this.time.now;
        else {
          const elapsed = this.time.now - this.pausedAt;
          for (const cat of this.cats.values()) {
            cat.born += elapsed;
            if (cat.dangerSince) cat.dangerSince += elapsed;
          }
        }
        this.paused = paused;
        if (paused) this.matter.world.pause();
        else if (this.state.status === "playing") this.matter.world.resume();
      }),
    ];
    this.events.once("shutdown", () => {
      this.subscriptions.forEach((unsubscribe) => unsubscribe());
      this.matter.world.off("collisionstart", this.collide, this);
      this.matter.world.off("collisionstart", this.squishOnImpact, this);
      this.matter.world.off("collisionactive", this.collide, this);
      this.matter.world.off("afterupdate", this.updateSquish, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resize, this);
      void this.audio?.close();
    });
    this.publish();
  }

  private get left() { return 22 * this.sx; }
  private get right() { return this.width - 22 * this.sx; }
  private get floor() { return this.height - 24 * this.sy; }
  private get dangerY() { return this.height * (155 / BASE_HEIGHT); }
  private radius(tier: number) { return radii[tier - 1] * this.unit; }

  private resize(size: Phaser.Structs.Size) {
    const oldWidth = this.width;
    const oldHeight = this.height;
    this.width = size.width;
    this.height = size.height;
    this.sx = this.width / BASE_WIDTH;
    this.sy = this.height / BASE_HEIGHT;
    this.unit = this.sx;
    this.aimX = Phaser.Math.Clamp(this.aimX * (oldWidth ? this.width / oldWidth : 1), this.left + this.radius(this.current) + 2, this.right - this.radius(this.current) - 2);
    if (this.container) {
      this.matter.world.setBounds(this.left, -this.height * 0.42, this.right - this.left, this.floor + this.height * 0.42, 24 * this.unit, true, true, false, true);
      const resizedCats = new Map<number, Cat>();
      for (const cat of this.cats.values()) {
        const body = cat.sprite.body as MatterJS.BodyType;
        const velocity = { ...body.velocity };
        const angularVelocity = body.angularVelocity;
        cat.sprite.setPosition(cat.sprite.x * (this.width / (oldWidth || this.width)), cat.sprite.y * (this.height / (oldHeight || this.height)));
        this.sizeCat(cat.sprite, cat.tier);
        this.setCatBody(cat.sprite, cat.tier);
        cat.sprite.setVelocity(velocity.x * (this.width / oldWidth), velocity.y * (this.height / oldHeight));
        cat.sprite.setAngularVelocity(angularVelocity);
        cat.artwork.setDisplaySize(this.radius(cat.tier) * 2.15, this.radius(cat.tier) * 2.22);
        this.renderCat(cat);
        resizedCats.set((cat.sprite.body as MatterJS.BodyType).id, cat);
      }
      this.cats = resizedCats;
      this.drawContainer();
      if (this.guide) this.updatePreview();
      if (this.danger) this.drawDanger(false);
    }
  }

  private sizeCat(sprite: Phaser.Physics.Matter.Image, tier: number) {
    const radius = this.radius(tier);
    sprite.setDisplaySize(radius * 2.15, radius * 2.22);
  }

  private setCatBody(sprite: Phaser.Physics.Matter.Image, tier: number) {
    sprite.setCircle(this.radius(tier), {
      restitution: 0.22,
      friction: 0.45,
      frictionStatic: 0.8,
      frictionAir: 0.008,
    });
  }

  private drawDanger(active: boolean) {
    this.danger.clear().lineStyle(active ? 2.5 : 1.5, active ? 0xc66564 : 0xc4948d, active ? 0.9 : 0.6);
    for (let x = this.left + 8 * this.sx; x < this.right - 8 * this.sx; x += 17 * this.sx)
      this.danger.lineBetween(x, this.dangerY, Math.min(x + 9 * this.sx, this.right - 8 * this.sx), this.dangerY);
  }

  private drawContainer() {
    const ink = 0x292938;
    const g = this.container;
    const X = (v: number) => v * this.sx;
    const Y = (v: number) => v * this.sy;
    g.clear();
    g.fillStyle(0xfffdf4, 0.9).fillRect(this.left, Y(116), this.right - this.left, this.floor - Y(116));
    g.fillStyle(0xeae4d8)
      .fillRect(X(9), Y(116), X(13), this.floor - Y(116))
      .fillRect(this.right, Y(116), X(13), this.floor - Y(116))
      .fillRect(X(9), this.floor, this.width - X(18), Y(14));
    g.lineStyle(1, ink, 0.3);
    for (let y = Y(120); y < this.floor; y += Y(9)) {
      g.lineBetween(X(9), y + Y(10), this.left, y);
      g.lineBetween(this.right, y + Y(10), X(471), y);
    }
    for (let x = X(12); x < this.width - X(20); x += X(10)) g.lineBetween(x, this.floor + Y(13), x + X(12), this.floor);
    g.lineStyle(3.5 * this.unit, ink)
      .beginPath()
      .moveTo(this.left, Y(116))
      .lineTo(X(20), Y(351))
      .lineTo(X(23), this.floor)
      .lineTo(this.width / 2, this.floor + Y(2))
      .lineTo(this.right, this.floor)
      .lineTo(X(460), Y(352))
      .lineTo(this.right, Y(116))
      .strokePath();
    g.lineStyle(1.5 * this.unit, ink)
      .beginPath()
      .moveTo(X(9), Y(117))
      .lineTo(X(8), Y(354))
      .lineTo(X(10), this.floor + Y(14))
      .lineTo(this.width / 2, this.floor + Y(15))
      .lineTo(X(472), this.floor + Y(13))
      .lineTo(X(470), Y(115))
      .strokePath();
    g.lineBetween(X(9), Y(116), this.left, Y(117)).lineBetween(this.right, Y(116), X(470), Y(115));
  }

  private aim(x: number) {
    const radius = this.radius(this.current);
    this.aimX = Phaser.Math.Clamp(x, this.left + radius + 2 * this.sx, this.right - radius - 2 * this.sx);
    if (this.preview) this.updatePreview();
  }

  private updatePreview() {
    const radius = this.radius(this.current);
    this.preview
      .setTexture(`cat-${this.current}`, "trimmed")
      .setDisplaySize(radius * 2.15, radius * 2.22)
      .setPosition(this.aimX, this.height * 0.095);
    this.guide.clear().lineStyle(1.5, 0x666675, 0.35);
    for (let y = this.height * 0.163; y < this.floor - 10 * this.sy; y += 14 * this.sy)
      this.guide.lineBetween(this.aimX, y, this.aimX, y + 5 * this.sy);
  }

  private randomTier() {
    return Phaser.Math.Between(1, 4);
  }
  private publish() {
    this.bridge.emit("state", { ...this.state });
  }

  private spawn(tier: number, x: number, y: number) {
    const radius = this.radius(tier);
    const sprite = this.matter.add.image(
      Phaser.Math.Clamp(x, this.left + radius, this.right - radius),
      Math.min(y, this.floor - radius),
      `cat-${tier}`,
      "trimmed",
    );
    this.sizeCat(sprite, tier);
    this.setCatBody(sprite, tier);
    // Separate artwork from the Matter Image: public scale setters on a Matter
    // Image resize its body, so deformation belongs on ordinary Game Objects.
    sprite.setVisible(false);
    const artwork = this.add.image(0, 0, `cat-${tier}`, "trimmed")
      .setDisplaySize(radius * 2.15, radius * 2.22);
    const visual = this.add.container(sprite.x, sprite.y, [artwork]).setDepth(5);
    const cat: Cat = {
      sprite,
      tier,
      born: this.time.now,
      claimed: false,
      dangerSince: 0,
      artwork,
      visual,
      squish: new Squish(),
    };
    this.cats.set((sprite.body as MatterJS.BodyType).id, cat);
    return cat;
  }

  private drop() {
    if (
      this.paused ||
      this.state.status !== "playing" ||
      this.time.now - this.lastDrop < 420
    )
      return;
    this.lastDrop = this.time.now;
    this.spawn(this.current, this.aimX, this.height * 0.15);
    this.state.highest = Math.max(this.state.highest, this.current);
    this.current = this.state.next;
    this.state.next = this.randomTier();
    this.state.drops++;
    this.aim(this.aimX);
    this.tone(260, 0.07);
    this.publish();
  }

  private collide(event: Phaser.Physics.Matter.Events.CollisionStartEvent) {
    if (this.paused || this.state.status !== "playing") return;
    for (const pair of event.pairs) {
      const a = this.cats.get(pair.bodyA.id),
        b = this.cats.get(pair.bodyB.id);
      if (
        !a ||
        !b ||
        a.claimed ||
        b.claimed ||
        a.tier !== b.tier ||
        a.tier === 10
      )
        continue;
      // Reserve both bodies immediately, then mutate the world after the physics step.
      a.claimed = b.claimed = true;
      this.pendingMerges.push([a, b]);
    }
  }

  private squishOnImpact(event: Phaser.Physics.Matter.Events.CollisionStartEvent) {
    if (this.paused || this.state.status !== "playing") return;
    for (const pair of event.pairs) {
      const normal = pair.collision.normal;
      // collisionstart runs before Matter's velocity solver. Only closing speed
      // along the contact normal contributes; sliding is not another impact.
      const speed = Math.max(0, -(
        (pair.bodyA.velocity.x - pair.bodyB.velocity.x) * normal.x +
        (pair.bodyA.velocity.y - pair.bodyB.velocity.y) * normal.y
      )) / Math.sqrt(this.unit);
      for (const body of [pair.bodyA, pair.bodyB]) {
        const cat = this.cats.get(body.id);
        if (!cat || cat.claimed) continue;
        cat.squish.impact(normal.x, normal.y, speed);
      }
    }
  }

  private updateSquish(event: { delta: number }) {
    if (this.paused || this.state.status !== "playing") return;
    for (const cat of this.cats.values()) cat.squish.beginContacts();
    const engine = this.matter.world.engine;
    const pairs = engine.pairs.list as ContactPair[];
    // Compare support impulses to one cat's weight. This makes a cat under a
    // tall pile softer than a lone resting cat, independently of pixel density.
    const gravity = this.matter.world.localWorld.gravity;
    const gravityStep = Math.max(0.01, Math.abs(gravity.y * gravity.scale) * event.delta * event.delta);
    for (const pair of pairs) {
      if (!pair.isActive || pair.isSensor) continue;
      let impulse = 0;
      for (let i = 0; i < pair.contactCount; i++)
        impulse += Math.abs(pair.contacts[i].normalImpulse);
      const { normal, depth } = pair.collision;
      for (const body of [pair.bodyA, pair.bodyB]) {
        const cat = this.cats.get(body.id);
        if (!cat || cat.claimed) continue;
        const weight = body.mass * gravityStep;
        const load = Number.isFinite(weight) ? impulse / Math.max(weight, 0.001) : 0;
        const pressure = Math.min(0.13, 0.018 + load * 0.026 + Math.max(0, depth - pair.slop) / this.radius(cat.tier) * 0.15);
        const sign = body === pair.bodyA ? -1 : 1;
        cat.squish.contact(normal.x * sign, normal.y * sign, pressure);
      }
    }
    for (const cat of this.cats.values()) {
      cat.squish.step(event.delta / 1000);
      this.renderCat(cat);
    }
  }

  private renderCat(cat: Cat) {
    const { xx, xy, yy, anchorX, anchorY } = cat.squish;
    // Principal axes let diagonal contacts compress in their actual direction.
    // Counter-rotate the child so the artwork still follows the body's rotation.
    const angle = Math.atan2(2 * xy, xx - yy) / 2;
    const mean = (xx + yy) / 2;
    const spread = Math.hypot((xx - yy) / 2, xy);
    const scaleX = 1 + Phaser.Math.Clamp(mean + spread, -0.20, 0.14);
    const scaleY = 1 + Phaser.Math.Clamp(mean - spread, -0.20, 0.14);
    const radius = this.radius(cat.tier);
    const offsetX = Phaser.Math.Clamp(-(xx * anchorX + xy * anchorY) * 0.75, -0.10, 0.10) * radius;
    const offsetY = Phaser.Math.Clamp(-(xy * anchorX + yy * anchorY) * 0.75, -0.10, 0.10) * radius;
    cat.visual.setPosition(cat.sprite.x + offsetX, cat.sprite.y + offsetY)
      .setRotation(angle).setScale(scaleX, scaleY);
    cat.artwork.setRotation(cat.sprite.rotation - angle);
  }

  private merge(a: Cat, b: Cat) {
    const x = (a.sprite.x + b.sprite.x) / 2,
      y = (a.sprite.y + b.sprite.y) / 2;
    const tier = a.tier + 1;
    for (const cat of [a, b]) {
      this.cats.delete((cat.sprite.body as MatterJS.BodyType).id);
      cat.visual.destroy();
      cat.sprite.destroy();
    }
    const merged = this.spawn(tier, x, y);
    merged.sprite.setVelocity(0, -1.3);
    merged.squish.impact(0, 1, 8);
    const points = 2 ** tier;
    this.state.score += points;
    this.state.highest = Math.max(this.state.highest, tier);
    if (this.state.score > this.state.best) {
      this.state.best = this.state.score;
      save(BEST_KEY, String(this.state.best));
    }
    const label = this.add
      .text(x, y - 20, `+${points}`, {
        fontFamily: "Patrick Hand, cursive",
        fontSize: "27px",
        color: "#353447",
        stroke: "#fffdf4",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(25);
    this.tweens.add({
      targets: label,
      y: y - 68,
      alpha: 0,
      duration: 850,
      onComplete: () => label.destroy(),
    });
    const ring = this.add
      .circle(x, y, this.radius(tier), 0xa9e9b1, 0.3)
      .setStrokeStyle(2, 0x7db58b)
      .setDepth(4);
    this.tweens.add({
      targets: ring,
      scale: 1.5,
      alpha: 0,
      duration: 380,
      onComplete: () => ring.destroy(),
    });
    this.tone(420 + tier * 65, 0.17);
    this.publish();
  }

  update() {
    if (this.paused || this.state.status !== "playing") return;
    for (const [a, b] of this.pendingMerges.splice(0)) this.merge(a, b);
    let danger = false;
    for (const cat of this.cats.values()) {
      if (this.time.now - cat.born < 1600) continue;
      if (cat.sprite.y - this.radius(cat.tier) < this.dangerY) {
        danger = true;
        if (!cat.dangerSince) cat.dangerSince = this.time.now;
        if (this.time.now - cat.dangerSince > 1800) {
          this.state.status = "over";
          this.matter.world.pause();
          this.preview.setVisible(false);
          this.guide.clear();
          this.publish();
          break;
        }
      } else cat.dangerSince = 0;
    }
    this.drawDanger(danger);
  }

  private restart() {
    this.pendingMerges = [];
    for (const cat of this.cats.values()) {
      cat.visual.destroy();
      cat.sprite.destroy();
    }
    this.cats.clear();
    this.state = {
      ...this.state,
      score: 0,
      drops: 0,
      highest: 1,
      next: this.randomTier(),
      status: "playing",
    };
    this.current = 1;
    this.paused = false;
    this.lastDrop = -1000;
    this.matter.world.resume();
    this.preview.setVisible(true);
    this.aim(this.width / 2);
    this.publish();
  }

  private unlockAudio() {
    if (this.state.muted) return;
    try {
      this.audio ??= new AudioContext();
      if (this.audio.state === "suspended")
        void this.audio.resume().catch(() => {});
    } catch {
      /* Audio availability must never stop the game. */
    }
  }

  private tone(frequency: number, duration: number) {
    if (this.state.muted || !this.audio || this.audio.state !== "running")
      return;
    const oscillator = this.audio.createOscillator(),
      gain = this.audio.createGain(),
      now = this.audio.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      frequency * 0.6,
      now + duration,
    );
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.audio.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
}
