# image-to-text: project notes

- Build: `python3 build.py` (renders `web/probe.png` + `web/probe.json` with Playwright, then inlines everything into
  `dist/image-to-text-standalone.html`). Needs `.buildtools/` with `markdown-it@14.1.0` (and `tesseract.js@5.1.1` for
  experiments only; the page loads Tesseract from jsDelivr at run time).
- Tests: `node tests/convert.test.mjs`; with `python3 -m http.server 8765` running here,
  `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tests/e2e.mjs`. The e2e test forwards
  OpenRouter and jsDelivr traffic from Node via `context.route` (the container's Chromium has no direct network; the
  proxy injects the OpenRouter key, so a dummy key works here).
- "Newest free model" is not "best": measured 2026-10-26, the newest (Nemotron 3.5 Super VL) wrote bold as italic
  every time, Inkling models refuse non-agentic use, and a Nemotron reasoning model leaked its reasoning into the
  answer. Hence the daily test-card ranking. OpenRouter's API has no popularity or quality order (`?order=` is ignored).
- Free models answer non-deterministically and get rate-limited (429) often; e2e checks of formatting can flip
  between runs of the same model. Judge a model on several runs.
