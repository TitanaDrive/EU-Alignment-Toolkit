# Architecture

## Front-end stack

- Static HTML (`src/index.html`)
- Vanilla JavaScript (`src/app.js`)
- Plain CSS (`src/style.css`)

## Runtime model

The app uses a single animation loop (`requestAnimationFrame`) and a lightweight node state model.

Each node contains:

- `x`, `y`: position
- `vx`, `vy`: velocity
- `tx`, `ty`: target position

## Animation phases

1. **Drift**: nodes wander with smooth random jitter.
2. **Compress**: center attraction increases.
3. **Gate**: nodes are guided toward and through a V-shaped gate.
4. **Align**: nodes are eased into a fixed 3x9 grid.

The phase transitions are time-based and repeated in a loop.
