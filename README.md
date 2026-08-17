# Intelligent-Traffic-Flow-Optimization-for-Smart-Cities

An AI-powered smart traffic management prototype featuring a browser-based 6×6 city simulation with 36 signalized intersections, adaptive traffic signal control, network coordination, dynamic rerouting, emergency priority, and Fixed-Time vs Smart AI benchmarking. The architecture is prepared for future SUMO, TraCI, and Simulink integration.

The prototype runs entirely in the browser — no server, no external simulator and no installation beyond `npm install`.

## Current Prototype

- Browser-based standalone simulation (Demo Mode)
- 6×6 city network — 36 signalized intersections, 120 directed road links
- Adaptive signal control — green time follows live queue pressure per approach
- Enforced signal safety — exactly one green direction, clockwise N → E → S → W, always GREEN → YELLOW → ALL RED → NEXT GREEN
- Network coordination and green waves across three arterial corridors
- Congestion detection and network health / imbalance analysis
- Dynamic rerouting — congestion-aware shortest path around blocked or saturated links
- Accident and road closure handling
- Emergency vehicle priority with safe signal preemption
- Queue spillback protection
- Fixed-Time vs Smart AI benchmark and Before/After queue analysis
- Live event feed and per-intersection inspector
- 17 preset scenarios (normal, rush hour, incidents, faults, full stress test)

## Future Integration

These are planned integration targets. **They are not implemented in the current prototype.**

- SUMO — calibrated traffic microsimulation
- TraCI — live simulation control interface
- MATLAB Simulink / Stateflow — formal modelling and verification of the signal state machine
- Real sensor telemetry — live detector feeds in place of simulated demand
- Production deployment — backend service, persistence and operator tooling

## Tech Stack

React 18 · TypeScript 5 · Vite 5 · Tailwind CSS 3 · HTML5 Canvas · Vitest

The traffic simulation, signal control, safety validation, routing and benchmarking are implemented from scratch in TypeScript under `src/sim/`. Signal control is a deterministic, rule-based adaptive controller — it does not use a trained machine-learning model.

## Getting Started

```bash
npm install
npm run dev      # http://localhost:5173
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript check only |
| `npm run lint` | ESLint |
| `npm test` | Run the test suite |
| `npm run verify` | typecheck + lint + test + build |
