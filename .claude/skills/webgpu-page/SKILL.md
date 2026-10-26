---
name: webgpu-page
description: Build or test a browser page with WebGPU compute or rendering, GPU-driven fluid/particle visualisations, or animated tracers and trails (learned on cylinder-cavity-3d). Covers headless WebGPU testing in this container, host-code and WGSL pitfalls, and tracer/trail design.
---

# WebGPU pages: lessons

Repo-wide rules stay in the root `CLAUDE.md`; this file holds the WebGPU-specific lessons.

## WebGPU
- **Headless testing in this container.**
  - Use `/opt/pw-browsers/chromium` with `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader`, on an
    `http://localhost` page.
  - Compute works but a WebGPU canvas cannot be presented: the device is lost with "valid external Instance
    reference". Provide an offscreen-texture render path (`?blit`) for tests; it doubles as PNG export.
  - Also provide `?cpu` (force the CPU fallback) and `?preset=…&N=…` URL options.
- **Host code.**
  - Keep a reference to the adapter.
  - Check `getCompilationInfo()`.
  - Use explicit bind-group layouts per kernel.
- **WGSL.**
  - Avoid reserved words such as `active`.
  - f32 `tanh`/`exp` overflow to NaN for large arguments, so clamp them.

## Tracers and trails (learned on cylinder-cavity-3d)
- Define anything animated in **simulated time, not frames.** A fast GPU covers more time per frame, so a
  frame-counted trail was several times longer there. Split each move exactly at the sample times.
- Store trails as point histories, not a fading ink image, so they stay correct when a 3D camera turns.
- Don't draw trails over a coloured field: switch the field colouring off and colour the trails by one quantity
  (speed), with its own colour bar.
- When panels are compared side by side, show the **same density** in each (the 2D panel had all particles near
  every slice, the 3D one only a slab), and lower opacity where trails would overlap.
- Hide what a moving body now covers, and put a turning pattern (alternating sectors) on a spinning body.
