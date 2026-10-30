// A world-space, symmetric strain tensor. This is visual only: Matter owns
// positions and collisions, and no deformation is written back to a body.
const STIFFNESS = 220;
const DAMPING = 18;
const BULGE = 0.7;
const clamp = (value: number, limit: number) =>
  Math.max(-limit, Math.min(limit, value));

export class Squish {
  xx = 0;
  xy = 0;
  yy = 0;
  private vx = 0;
  private vxy = 0;
  private vy = 0;
  private targetX = 0;
  private targetXY = 0;
  private targetY = 0;
  private contactX = 0;
  private contactY = 0;
  private load = 0;
  anchorX = 0;
  anchorY = 0;

  beginContacts() {
    this.targetX = this.targetXY = this.targetY = 0;
    this.contactX = this.contactY = this.load = 0;
  }

  // n points from the cat toward its contact. Opposing contacts reinforce
  // compression but cancel the offset; diagonal contacts also contribute shear.
  contact(nx: number, ny: number, pressure: number) {
    this.targetX += pressure * (BULGE * ny * ny - nx * nx);
    this.targetY += pressure * (BULGE * nx * nx - ny * ny);
    this.targetXY -= pressure * (1 + BULGE) * nx * ny;
    this.contactX += nx * pressure;
    this.contactY += ny * pressure;
    this.load += pressure;
  }

  impact(nx: number, ny: number, speed: number) {
    // A normal-speed impulse excites the same spring as sustained pressure.
    // Tangential sliding and resting contacts do not repeatedly kick the spring.
    const kick = Math.min(4.5, Math.max(0, speed - 0.8) * 0.45);
    this.vx = clamp(this.vx + kick * (BULGE * ny * ny - nx * nx), 4.5);
    this.vy = clamp(this.vy + kick * (BULGE * nx * nx - ny * ny), 4.5);
    this.vxy = clamp(this.vxy - kick * (1 + BULGE) * nx * ny, 4.5);
  }

  step(seconds: number) {
    const dt = Math.min(Math.max(seconds, 0), 0.05);
    // Small substeps keep the spring stable on slow frames without a new timer.
    const steps = Math.max(1, Math.ceil(dt * 120));
    const h = dt / steps;
    const limit = Math.min(1, 0.25 / Math.max(this.load, 0.001));
    const tx = this.targetX * limit;
    const ty = this.targetY * limit;
    const txy = this.targetXY * limit;
    for (let i = 0; i < steps; i++) {
      this.vx += ((tx - this.xx) * STIFFNESS - this.vx * DAMPING) * h;
      this.vy += ((ty - this.yy) * STIFFNESS - this.vy * DAMPING) * h;
      this.vxy += ((txy - this.xy) * STIFFNESS - this.vxy * DAMPING) * h;
      this.xx += this.vx * h;
      this.yy += this.vy * h;
      this.xy += this.vxy * h;
    }
    if (Math.abs(this.xx - tx) + Math.abs(this.vx) < 0.0001) {
      this.xx = tx;
      this.vx = 0;
    }
    if (Math.abs(this.yy - ty) + Math.abs(this.vy) < 0.0001) {
      this.yy = ty;
      this.vy = 0;
    }
    if (Math.abs(this.xy - txy) + Math.abs(this.vxy) < 0.0001) {
      this.xy = txy;
      this.vxy = 0;
    }
    const blend = 1 - Math.exp(-16 * dt);
    this.anchorX += (this.contactX / Math.max(this.load, 0.001) - this.anchorX) * blend;
    this.anchorY += (this.contactY / Math.max(this.load, 0.001) - this.anchorY) * blend;
  }
}
