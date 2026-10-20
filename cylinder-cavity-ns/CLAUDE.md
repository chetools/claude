# cylinder-cavity-ns: lessons

These lessons come from the `CLAUDE.md` on the old `claude/dazzling-euler-f9ftbv` branch. They apply to this directory; the repo-wide rules are in the root `CLAUDE.md`.

- Use three implementations with the same names: a numpy reference (pytest), a float64 JS port (CPU fallback) and
  the WGSL kernels. A page **Validation** tab and a `?selftest` URL option (which sets `window.SELFTEST`) compare
  them against numpy values embedded at build time.
- URL options worth repeating on GPU pages:
  - `?blit` (offscreen render for headless tests; also used by Save PNG);
  - `?cpu` (force the fallback);
  - `?preset=…&N=…`.
- WebGPU details:
  - keep a reference to the adapter;
  - check `getCompilationInfo()`;
  - use explicit bind-group layouts per kernel;
  - avoid WGSL reserved words such as `active`.
- AB2 with `dt = min(dt_cfl, dt_diff)` blew up where the two limits cross. Adding the reciprocals,
  `dt = 1/(1/dt_cfl + 1/dt_diff)`, fixed it.
- `Plotly.react` with arrays mutated in place needs a changing `datarevision`. Keep metric-card sub-labels short,
  with `white-space: nowrap`.
