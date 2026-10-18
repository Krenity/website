(() => {
  const canvas = document.getElementById("energy-stack");
  const ctx = canvas.getContext("2d");
  if (!ctx || !window.Matter) return;
  const {
    Engine,
    Bodies,
    Body,
    Composite,
    Constraint,
    Query,
    Sleeping,
    Vector,
    Events,
  } = Matter;
  const engine = Engine.create({
    enableSleeping: true,
    positionIterations: 8,
    velocityIterations: 8,
  });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const brands = ["MONSTER", "TIGER", "BLACK", "DZIK"];
  let cans = [],
    width = 0,
    height = 0,
    canWidth = 62,
    canHeight = 96;
  let frame = 0,
    last = 0,
    idle = 0,
    visible = true,
    drag = null,
    pointerId = null;
  let motion = [];

  let drops = [],
    lids = [],
    stains = [],
    settling = false;
  const impactVelocities = new Map();
  const sprites = new Map();
  function sprite(brand) {
    if (sprites.has(brand)) return sprites.get(brand);
    const data = window.CAN_ASCII[brand];
    const scale = 4,
      w = canWidth * scale,
      h = canHeight * scale;
    const image = document.createElement("canvas");
    image.width = Math.ceil(w);
    image.height = Math.ceil(h);
    const ink = image.getContext("2d");
    const cellW = w / data.columns,
      cellH = h / data.rows;
    ink.font = `${cellW / 0.61}px "JetBrains Mono", monospace`;
    ink.textAlign = "center";
    ink.textBaseline = "middle";
    const glyphs = ".:-=+*#%@";
    data.pixels.forEach((value, i) => {
      if (value < 0) return;
      const x = i % data.columns,
        y = Math.floor(i / data.columns);
      ink.fillStyle = "#151515";
      ink.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
    });
    data.pixels.forEach((value, i) => {
      if (value < 0) return;
      const x = i % data.columns,
        y = Math.floor(i / data.columns);
      ink.fillStyle = `rgba(244,243,239,${0.22 + (value / 255) * 0.78})`;
      ink.fillText(
        glyphs[Math.min(8, Math.floor((value / 256) * 9))],
        (x + 0.5) * cellW,
        (y + 0.5) * cellH,
      );
    });
    sprites.set(brand, image);
    return image;
  }
  function dentedSprite(brand, amount) {
    const level = Math.min(12, Math.ceil(amount * 12));
    const key = `${brand}-dent-${level}`;
    if (sprites.has(key)) return sprites.get(key);
    const source = sprite(brand);
    const image = document.createElement("canvas");
    image.width = source.width;
    image.height = source.height;
    const ink = image.getContext("2d"),
      strength = level / 12;
    for (let y = 0; y < source.height; y += 2) {
      const t = y / source.height;
      const shoulder = Math.exp(-Math.pow((t - 0.29) / 0.14, 2));
      const lower = Math.exp(-Math.pow((t - 0.67) / 0.16, 2));
      const pinch = 1 - strength * (0.42 * shoulder + 0.19 * lower);
      const crease =
        Math.sin(t * 48) * strength * shoulder * source.width * 0.035;
      const w = source.width * pinch;
      const offset =
        strength *
        source.width *
        0.09 *
        Math.sin(t * 9) *
        Math.sin(Math.PI * t);
      ink.drawImage(
        source,
        0,
        y,
        source.width,
        2,
        (source.width - w) / 2 + offset + crease,
        y,
        w,
        2,
      );
    }
    sprites.set(key, image);
    return image;
  }
  function render() {
    ctx.clearRect(0, 0, width, height);
    ctx.font = '700 16px "JetBrains Mono", monospace';
    ctx.textAlign = "center";
    ctx.fillStyle = "#2a2a27";
    ctx.fillText(
      "I like energy drinks",
      width / 2,
      height - canHeight * 0.4 - 5,
    );
    ctx.font = 'italic 700 12px "JetBrains Mono", monospace';
    ctx.fillText("shhh,", width / 2.519, height - canHeight * 0.65);
    ctx.font = '700 16px "JetBrains Mono", monospace';
    for (const can of cans) {
      ctx.save();
      ctx.translate(can.position.x, can.position.y);
      ctx.rotate(can.angle);
      const dent = can.plugin.dent || 0;
      const shrink = can.plugin.crushed ? 0.9 : 1;
      ctx.drawImage(
        dent > 0
          ? dentedSprite(can.plugin.brand, dent)
          : sprite(can.plugin.brand),
        (-canWidth * shrink) / 2,
        (-canHeight * shrink) / 2,
        canWidth * shrink,
        canHeight * shrink,
      );
      ctx.restore();
    }
    for (const lid of lids) {
      ctx.save();
      ctx.translate(lid.position.x, lid.position.y);
      ctx.rotate(lid.angle);
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = "center";
      ctx.fillStyle = "#c8c8c1";
      ctx.fillText("=~==~=", 0, 0);
      ctx.restore();
    }
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = "center";
    for (const stain of stains) {
      ctx.fillStyle = `rgba(244,243,239,${Math.min(0.45, stain.life / 3000)})`;
      ctx.fillText("~", stain.x, height - 2);
    }
    for (const drop of drops) {
      ctx.fillStyle = `rgba(244,243,239,${Math.min(0.95, drop.life / 250)})`;
      ctx.fillText(drop.glyph, drop.x, drop.y);
    }
  }
  function wake() {
    cans.forEach((can) => Sleeping.set(can, false));
    idle = 0;
    start();
  }
  function tick(time) {
    frame = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min(33, Math.max(1, time - (last || time - 16.67)));
    last = time;
    Engine.update(engine, dt / 2);
    Engine.update(engine, dt / 2);
    updateLiquid(dt);
    render();
    idle =
      drops.length === 0 &&
      stains.length === 0 &&
      !cans.some((c) => c.plugin.sprayTime > 0) &&
      !drag &&
      cans.every(
        (c) =>
          c.isSleeping ||
          (c.speed < 0.04 && Math.abs(c.angularVelocity) < 0.002),
      )
        ? idle + 1
        : 0;
    if (idle < 45) frame = requestAnimationFrame(tick);
  }
  function start() {
    if (!frame && visible && !document.hidden) {
      last = 0;
      frame = requestAnimationFrame(tick);
    }
  }
  function release(event) {
    if (!drag || (event && event.pointerId !== pointerId)) return;
    const body = drag.bodyB;
    Composite.remove(engine.world, drag);
    drag = null;
    if (event && event.type === "pointerup" && motion.length > 1) {
      const now = performance.now();
      const recent = motion.filter((sample) => now - sample.time <= 100);
      if (recent.length > 1) {
        const latest = recent[recent.length - 1];
        const earlier = recent[0];
        const dt = Math.max(1, latest.time - earlier.time);
        const vx = ((latest.x - earlier.x) / dt) * 16.67;
        const vy = ((latest.y - earlier.y) / dt) * 16.67;
        const speed = Math.hypot(vx, vy);
        const capped = Math.min(1, 40 / Math.max(1, speed));
        Body.setVelocity(body, { x: vx * capped, y: vy * capped });
      }
    }
    motion = [];
    canvas.classList.remove("dragging");
    if (canvas.hasPointerCapture(pointerId))
      canvas.releasePointerCapture(pointerId);
    pointerId = null;
    wake();
  }
  function reset() {
    release();
    drops = [];
    stains = [];
    lids = [];
    impactVelocities.clear();
    settling = true;
    Composite.clear(engine.world, false);
    Engine.clear(engine);
    canWidth = Math.min(46, Math.max(36, width / 9));
    canHeight = canWidth * 2.3;
    sprites.clear();
    const floor = height - 0.5;
    Composite.add(engine.world, [
      Bodies.rectangle(width / 2, floor + 15, width + 100, 30, {
        isStatic: true,
        friction: 0.7,
      }),
      Bodies.rectangle(-15, height / 2 - 150, 30, height + 600, {
        isStatic: true,
      }),
      Bodies.rectangle(width + 15, height / 2 - 150, 30, height + 600, {
        isStatic: true,
      }),
      Bodies.rectangle(width / 2, -180, width + 100, 30, { isStatic: true }),
    ]);
    cans = [];
    let index = 0;
    for (let row = 0; row < 4; row++) {
      const count = 4 - row;
      for (let col = 0; col < count; col++) {
        const can = Bodies.rectangle(
          width / 2 + (col - (count - 1) / 2) * (canWidth + 2),
          floor - canHeight / 2 - row * (canHeight + 0.5),
          canWidth,
          canHeight,
          {
            friction: 0.6,
            frictionStatic: 1,
            restitution: 0.14,
            frictionAir: 0.006,
            density: 0.001,
            sleepThreshold: 75,
            chamfer: { radius: 3 },
          },
        );
        can.plugin.brand = brands[index % 4];
        cans.push(can);
        index++;
      }
    }
    Composite.add(engine.world, cans);
    for (let i = 0; i < 80; i++) Engine.update(engine, 1000 / 120);
    canvas.dataset.ruptures = "0";
    settling = false;
    render();
    idle = 0;
    if (!reduced.matches) start();
    canvas.dataset.ready = "true";
  }
  function addDrop(can, burst = false) {
    if (drops.length >= 420) return;
    const local = { x: 0, y: -canHeight * 0.42 };
    const vent = Vector.add(can.position, Vector.rotate(local, can.angle));
    const direction =
      can.angle - Math.PI / 2 + (Math.random() - 0.5) * (burst ? 2.2 : 0.7);
    const speed = burst ? 3 + Math.random() * 9 : 2 + Math.random() * 5;
    drops.push({
      x: vent.x,
      y: vent.y,
      vx: Math.cos(direction) * speed + can.velocity.x * 0.5,
      vy: Math.sin(direction) * speed + can.velocity.y * 0.5,
      life: 900 + Math.random() * 1000,
      glyph: Math.random() < 0.3 ? ":" : ".",
    });
  }
  function rupture(can) {
    if (can.plugin.ruptured || settling) return;
    can.plugin.ruptured = true;
    can.plugin.sprayTime = 2200;
    can.plugin.dent = 1;
    can.plugin.crushed = true;
    Body.scale(can, 0.9, 0.9);
    Sleeping.set(can, false);
    for (let i = 0; i < (reduced.matches ? 24 : 60); i++) addDrop(can, true);
    const pos = Vector.add(
      can.position,
      Vector.rotate({ x: 0, y: -canHeight * 0.33 }, can.angle),
    );
    const lid = Bodies.rectangle(pos.x, pos.y, canWidth * 0.65, 4, {
      friction: 0.4,
      restitution: 0.3,
      density: 0.0004,
    });
    Body.setVelocity(lid, {
      x: can.velocity.x + (Math.random() - 0.5) * 7,
      y: -7,
    });
    Body.setAngularVelocity(lid, 0.16);
    lids.push(lid);
    Composite.add(engine.world, lid);
    idle = 0;
    canvas.dataset.ruptures = String(
      cans.filter((c) => c.plugin.ruptured).length,
    );
  }
  Events.on(engine, "beforeSolve", () => {
    impactVelocities.clear();
    for (const can of cans)
      impactVelocities.set(can.id, { x: can.velocity.x, y: can.velocity.y });
  });
  Events.on(engine, "collisionStart", (event) => {
    if (settling) return;
    for (const pair of event.pairs) {
      const a = pair.bodyA,
        b = pair.bodyB;
      const va = impactVelocities.get(a.id) || a.velocity,
        vb = impactVelocities.get(b.id) || b.velocity;
      const normal = pair.collision.normal;
      const force = Math.abs(
        (va.x - vb.x) * normal.x + (va.y - vb.y) * normal.y,
      );
      if (force < 4) continue;
      if (a.plugin.brand) rupture(a);
      if (b.plugin.brand) rupture(b);
    }
  });
  function updateLiquid(dt) {
    const step = dt / 16.67;
    for (const can of cans) {
      if (can.plugin.sprayTime > 0) {
        can.plugin.sprayTime = Math.max(0, can.plugin.sprayTime - dt);
        for (let i = 0; i < (reduced.matches ? 1 : 3); i++) addDrop(can);
      }
    }
    for (const drop of drops) {
      drop.life -= dt;
      drop.vy += 0.19 * step;
      drop.x += drop.vx * step;
      drop.y += drop.vy * step;
      drop.vx *= 0.993;
      if (drop.x < 1 || drop.x > width - 1) {
        drop.vx *= -0.35;
        drop.x = Math.max(1, Math.min(width - 1, drop.x));
      }
      if (drop.y >= height - 3) {
        if (stains.length < 90)
          stains.push({ x: drop.x, life: 2000 + Math.random() * 1400 });
        drop.life = 0;
      }
    }
    drops = drops.filter((d) => d.life > 0);
    for (const stain of stains) stain.life -= dt;
    stains = stains.filter((s) => s.life > 0);
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (Math.abs(rect.width - width) < 1 && Math.abs(rect.height - height) < 1)
      return;
    width = rect.width;
    height = rect.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    reset();
  }
  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * width) / rect.width,
      y: ((event.clientY - rect.top) * height) / rect.height,
    };
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || drag) return;
    const p = point(event);
    const body = Query.point(cans, p).at(-1);
    if (!body) return;
    event.preventDefault();
    wake();
    pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId);
    canvas.classList.add("dragging");
    const offset = Vector.rotate(Vector.sub(p, body.position), -body.angle);
    drag = Constraint.create({
      pointA: p,
      bodyB: body,
      pointB: offset,
      stiffness: 0.12,
      damping: 0.06,
      length: 0,
    });
    Composite.add(engine.world, drag);
    motion = [{ ...p, time: performance.now() }];
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== pointerId) return;
    const p = point(event),
      now = performance.now();
    motion.push({ ...p, time: now });
    motion = motion.filter((sample) => now - sample.time <= 100);
    drag.pointA = p;
    wake();
  });
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("lostpointercapture", release);
  document.getElementById("reset-stack").addEventListener("click", reset);
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (!visible) {
      cancelAnimationFrame(frame);
      frame = 0;
      release();
    } else if (!reduced.matches) start();
  }).observe(canvas);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !reduced.matches) start();
  });
  document.fonts.ready.then(() => {
    sprites.clear();
    resize();
    render();
  });
})();
