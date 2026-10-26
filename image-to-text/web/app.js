(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const API = "https://openrouter.ai/api/v1";
  const MODEL_TTL_MS = 3600 * 1000;
  const MAX_SIDE = 2000;
  const PROMPT = [
    "Transcribe all text in this image exactly, as GitHub-flavoured Markdown that reproduces its formatting.",
    "Rules:",
    "- Output only the transcription: no preface, no comments, no surrounding code fence.",
    "- Keep wording, spelling, punctuation, numbers and order exactly as shown. Do not summarize, translate, correct or add anything.",
    "- Put each paragraph on one line: join lines that only wrap because of the width. Use a newline only where the text has a real line break (addresses, poems, chat messages, separate short lines).",
    "- Headings as #, ## or ###; bold as **text**; italic as *text*; strikethrough as ~~text~~.",
    "- Bulleted and numbered lists keep their numbering; indent nested items under the text of their parent item.",
    "- Tables as Markdown tables; code or monospaced text as fenced code blocks or `inline code`; quotations as > lines; links as [text](url) only when the URL is visible.",
    "- Escape the characters * _ ` when they appear literally in the text, with a backslash.",
    "- Keep all readable text; skip pure decoration such as icons.",
    "If the image has no readable text, output exactly: (no text found)",
  ].join("\n");

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } },
  };

  // Sent with the image: Tesseract's plain reading, as a draft for the exact characters.
  const hintPrompt = (ocr) => !ocr.trim() ? PROMPT : PROMPT +
    "\n\nA plain OCR engine (Tesseract) read this text from the same image. Use it as a draft for the exact characters, " +
    "but trust the image where they differ: Tesseract misses emoji and symbols, loses all formatting, and mangles tables. " +
    "Restore headings, bold, italic, strikethrough, lists, tables, code and emoji from the image.\n\n<ocr>\n" + ocr.trim() + "\n</ocr>";

  const TESSERACT_JS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  const SCORE_TTL_MS = 24 * 3600 * 1000;

  let imageDataUrl = null;
  let freeModels = [];
  // s: model id -> test-card score 0-100, or null if it gave no usable answer; busy: id -> time it was rate-limited
  let scores = { t: 0, s: {}, busy: {} };
  const BUSY_RETRY_MS = 3600 * 1000;
  const MIN_SCORE = 50;
  let outputs = { html: "", discord: "", plain: "" };
  let modelsReady = Promise.resolve();
  let tesseractWorker = null;
  let probeHint = null;
  let shared = {}; // shared ranking from other visitors: id -> { median, tests, refused, last }

  // A model's score: this browser's own test first, else the shared median. undefined = untested, null = failed.
  function scoreOf(id) {
    if (id in scores.s) return scores.s[id];
    const g = shared[id];
    if (g && g.tests) return g.median;
    if (g && g.refused) return null;
    return undefined;
  }

  function status(msg, kind) {
    const el = $("status");
    el.textContent = msg;
    el.className = "status" + (kind ? " " + kind : "");
  }

  // ---------- models ----------
  async function loadShared() {
    if (!ITT_PROBE.ranking) return;
    try {
      const r = await fetch(ITT_PROBE.ranking + "/ranking", { signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      shared = {};
      for (const m of (await r.json()).models) shared[m.model] = m;
    } catch (e) {
      console.warn("Shared ranking unavailable:", e);
    }
  }

  // Send this browser's test-card result to the shared ranking (the server scores the raw answer itself).
  function reportShared(model, text) {
    if (!ITT_PROBE.ranking) return;
    fetch(ITT_PROBE.ranking + "/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(text === null ? { model } : { model, text }),
    }).catch((e) => console.warn("Could not report to the shared ranking:", e));
  }

  async function loadModels(force) {
    const sharedReady = loadShared();
    try {
      const c = JSON.parse(store.get("itt.scores") || "null");
      if (c && Date.now() - c.t < SCORE_TTL_MS) scores = { busy: {}, ...c };
    } catch (e) { /* no scores */ }
    const cached = store.get("itt.models");
    if (!force && cached) {
      try {
        const c = JSON.parse(cached);
        if (Date.now() - c.t < MODEL_TTL_MS && c.models.length) { await sharedReady; setModels(c.models, c.t); return; }
      } catch (e) { /* refetch */ }
    }
    $("modelInfo").textContent = "Loading free models…";
    try {
      const r = await fetch(API + "/models");
      if (!r.ok) throw new Error("HTTP " + r.status);
      const models = ImgText.pickFreeVisionModels((await r.json()).data);
      const t = Date.now();
      store.set("itt.models", JSON.stringify({ t, models }));
      await sharedReady;
      setModels(models, t);
    } catch (e) {
      $("modelInfo").textContent = "Could not load the model list (" + e.message + "); OpenRouter's free router will be used.";
      setModels([], Date.now());
    }
  }

  // Best test-card score first; untested models next (newest first), models that failed the test last.
  function rankedModels() {
    const key = (m) => { const x = scoreOf(m.id); return x === undefined ? -1 : x === null ? -2 : x; };
    return freeModels.slice().sort((a, b) => key(b) - key(a) || b.created - a.created);
  }

  function setModels(models, t) {
    freeModels = models;
    const sel = $("model"), keep = store.get("itt.model") || "auto";
    const label = (m) => {
      const x = scoreOf(m.id), g = shared[m.id];
      if (x === null) return " (failed test)";
      if (x === undefined) return m.id in scores.busy ? " (busy when tested)" : "";
      return " (score " + Math.round(x) + (m.id in scores.s ? ", your test" : ", " + g.tests + " shared tests") + ")";
    };
    sel.length = 1;
    for (const m of rankedModels()) sel.add(new Option(m.name + label(m) + " — " + m.id, m.id));
    sel.add(new Option("OpenRouter free router — openrouter/free", "openrouter/free"));
    sel.value = [...sel.options].some((o) => o.value === keep) ? keep : "auto";
    const top = rankedModels()[0];
    $("modelInfo").textContent = !models.length
      ? "No free vision models listed; OpenRouter's free router will be used."
      : models.length + " free vision models (list from " + new Date(t).toLocaleTimeString() + "). " +
        (top && typeof scoreOf(top.id) === "number"
          ? "Auto picks " + top.id + ", test score " + Math.round(scoreOf(top.id)) + "/100 (" +
            (top.id in scores.s ? "your test, " + new Date(scores.t).toLocaleString() : "median of " + shared[top.id].tests + " tests by visitors, last 7 days") + ")."
          : "Not tested yet: they are tested on the first read (needs your key).");
  }

  function candidateBatches() {
    const sel = $("model").value;
    if (sel !== "auto") return [[sel], ["openrouter/free"]].filter((b, i) => i === 0 || sel !== "openrouter/free");
    const usable = (id) => { const x = scoreOf(id); return x === undefined || (x !== null && x >= MIN_SCORE); };
    const ids = rankedModels().map((m) => m.id).filter(usable);
    const batches = [];
    for (let i = 0; i < Math.min(ids.length, 9); i += 3) batches.push(ids.slice(i, i + 3));
    batches.push(["openrouter/free"]);
    return batches;
  }

  // ---------- Tesseract (draft text for the model) ----------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error("could not load " + src));
      document.head.appendChild(el);
    });
  }

  async function tesseractText(dataUrl) {
    try {
      if (!tesseractWorker) {
        tesseractWorker = (async () => {
          if (!window.Tesseract) await loadScript(TESSERACT_JS);
          return window.Tesseract.createWorker("eng");
        })();
      }
      const w = await tesseractWorker;
      return (await w.recognize(dataUrl)).data.text || "";
    } catch (e) {
      tesseractWorker = null;
      console.warn("Tesseract unavailable, sending the image alone:", e);
      return "";
    }
  }

  // ---------- OCR ----------
  async function callModels(batch, key, dataUrl, prompt) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 120000);
    try {
      const r = await fetch(API + "/chat/completions", {
        method: "POST",
        signal: ctl.signal,
        headers: {
          "Authorization": "Bearer " + key,
          "Content-Type": "application/json",
          "HTTP-Referer": location.origin.startsWith("http") ? location.origin : "https://chetools.github.io",
          "X-Title": "Image to Text",
        },
        body: JSON.stringify({
          model: batch[0],
          models: batch.length > 1 ? batch : undefined,
          temperature: 0,
          messages: [{ role: "user", content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ] }],
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || body.error) {
        const msg = (body.error && body.error.message) || "HTTP " + r.status;
        const code = (body.error && body.error.code) || r.status;
        // 401 = bad key: stop. A 403 can be model-specific (e.g. "only available on agentic harnesses"): try others.
        return { ok: false, fatal: code === 401, busy: code === 408 || code === 429 || code >= 500, msg: code + ": " + msg };
      }
      const text = body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
      if (!text || !String(text).trim()) return { ok: false, msg: "empty answer from " + (body.model || batch[0]) };
      return { ok: true, text: String(text), model: body.model || batch[0] };
    } catch (e) {
      return { ok: false, busy: true, msg: e.name === "AbortError" ? "timed out" : e.message };
    } finally {
      clearTimeout(timer);
    }
  }

  // Ranking: every untested free vision model reads the built-in test card at once; scores are kept for a day.
  async function testModels(key, all) {
    if (all || Date.now() - scores.t >= SCORE_TTL_MS) scores = { t: Date.now(), s: {}, busy: {} };
    // Skip models someone already tested in the last day (shared ranking), unless re-testing everything.
    const sharedFresh = (id) => !all && shared[id] && Date.now() - shared[id].last < SCORE_TTL_MS;
    const todo = freeModels.filter((m) => !(m.id in scores.s) && !sharedFresh(m.id) &&
      !(Date.now() - (scores.busy[m.id] || 0) < BUSY_RETRY_MS));
    if (!todo.length) return;
    status("Testing " + todo.length + " free models on a sample card to find the best one (once a day)…", "busy");
    if (probeHint === null) probeHint = await tesseractText(ITT_PROBE.png);
    const results = await Promise.all(todo.map(async (m) => {
      const res = await callModels([m.id], key, ITT_PROBE.png, hintPrompt(probeHint));
      if (res.fatal) return { id: m.id, fatal: res.msg };
      if (res.busy) return { id: m.id, busy: true };
      reportShared(m.id, res.ok ? res.text : null);
      return { id: m.id, score: res.ok ? ImgText.scoreTranscription(window.markdownit, res.text, ITT_PROBE.spec).total : null };
    }));
    const fatal = results.find((r) => r.fatal);
    if (fatal) throw new Error(fatal.fatal);
    // A rate-limited model stays untested and is tried again after an hour.
    for (const r of results) {
      if (r.busy) scores.busy[r.id] = Date.now();
      else { scores.s[r.id] = r.score; delete scores.busy[r.id]; }
    }
    store.set("itt.scores", JSON.stringify(scores));
    setModels(freeModels, JSON.parse(store.get("itt.models") || "{}").t || Date.now());
  }

  async function run() {
    const key = $("key").value.trim();
    if (!key) { status("Enter your OpenRouter API key in the sidebar first.", "err"); $("key").focus(); return; }
    if (!imageDataUrl) return;
    $("run").disabled = true;
    $("modelUsed").textContent = "";
    const errors = [];
    try {
      await modelsReady; // a click right after page load must not skip the free-model list
      const hint = tesseractText(imageDataUrl); // runs while the models are tested
      if ($("model").value === "auto") await testModels(key, false);
      status("Reading the text (Tesseract draft)…", "busy");
      const prompt = hintPrompt(await hint);
      for (const batch of candidateBatches()) {
        status("Reading with " + batch.join(", ") + " …", "busy");
        const res = await callModels(batch, key, imageDataUrl, prompt);
        if (res.ok) {
          $("md").value = ImgText.cleanModelOutput(res.text);
          update();
          $("modelUsed").textContent = "Read by " + res.model;
          status("Done. Check the transcription, then copy the version you need.", "ok");
          return;
        }
        errors.push(batch.join(", ") + " → " + res.msg);
        if (res.fatal) break;
      }
      status("Failed. " + errors.join(" · "), "err");
    } catch (e) {
      status("Failed. " + e.message, "err");
    } finally {
      $("run").disabled = !imageDataUrl;
    }
  }

  async function retest() {
    const key = $("key").value.trim();
    if (!key) { status("Enter your OpenRouter API key in the sidebar first.", "err"); $("key").focus(); return; }
    $("retest").disabled = true;
    try {
      await (modelsReady = loadModels(true));
      await testModels(key, true);
      status("Models re-tested.", "ok");
    } catch (e) {
      status("Test failed. " + e.message, "err");
    } finally {
      $("retest").disabled = false;
    }
  }

  // ---------- image input ----------
  function loadImage(file) {
    if (!file || !/^image\//.test(file.type)) { status("That is not an image.", "err"); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      const g = c.getContext("2d");
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      let data = c.toDataURL("image/png");
      if (data.length > 4e6) data = c.toDataURL("image/jpeg", 0.92);
      imageDataUrl = data;
      URL.revokeObjectURL(url);
      $("preview").src = data;
      $("preview").hidden = false;
      $("dropText").textContent = "Click, drop or paste to replace (" + c.width + " × " + c.height + " px)";
      $("run").disabled = false;
      status("Image ready. Press \"Read text\".");
    };
    img.onerror = () => { URL.revokeObjectURL(url); status("Could not open that image.", "err"); };
    img.src = url;
  }

  // ---------- outputs ----------
  function update() {
    const r = ImgText.convertAll(window.markdownit, $("md").value);
    outputs = r;
    $("out-gmail").innerHTML = r.html;
    $("out-discord").textContent = r.discord;
    $("out-imessage").textContent = r.plain;
  }

  async function copy(which, btn) {
    let ok = false;
    try {
      if (which === "gmail") {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([outputs.html], { type: "text/html" }),
          "text/plain": new Blob([outputs.plain], { type: "text/plain" }),
        })]);
      } else {
        await navigator.clipboard.writeText(which === "discord" ? outputs.discord : outputs.plain);
      }
      ok = true;
    } catch (e) {
      // Fallback: select the shown output and use the legacy copy command.
      const el = $("out-" + which), sel = getSelection(), range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
      sel.removeAllRanges();
    }
    const old = btn.textContent;
    btn.textContent = ok ? "Copied ✓" : "Copy failed";
    setTimeout(() => { btn.textContent = old; }, 1500);
  }

  // ---------- self-test (?selftest) ----------
  async function selftest() {
    const cases = [
      ["# T\n\n- **a**\n  - b\n\n| x | y |\n|---|---|\n| 1 | 22 |",
        "# T\n\n- **a**\n  - b\n\n```\nx | y\n--+---\n1 | 22\n```",
        "T\n\n• a\n  ◦ b\n\nx | y\n1 | 22"],
    ];
    const results = cases.map(([md, discord, plain]) => {
      const r = ImgText.convertAll(window.markdownit, md);
      return { md, discordOk: r.discord === discord, plainOk: r.plain === plain, htmlOk: /<table style=/.test(r.html) };
    });
    await (modelsReady = loadModels(true));
    const modelsOk = freeModels.length > 0;
    const pass = results.every((x) => x.discordOk && x.plainOk && x.htmlOk) && modelsOk;
    window.SELFTEST = { pass, results, models: freeModels.map((m) => m.id) };
    status("Self-test " + (pass ? "passed" : "FAILED") + ": converters " +
      (results.every((x) => x.discordOk && x.plainOk && x.htmlOk) ? "ok" : "fail") + ", free models listed: " + freeModels.length,
      pass ? "ok" : "err");
  }

  // ---------- wiring ----------
  $("key").value = store.get("itt.key") || "";
  $("saveKey").onclick = () => { store.set("itt.key", $("key").value.trim()); status("Key saved in this browser.", "ok"); };
  $("forgetKey").onclick = () => { store.del("itt.key"); $("key").value = ""; status("Key removed from this browser."); };
  $("model").onchange = () => store.set("itt.model", $("model").value);
  $("retest").onclick = retest;
  $("run").onclick = run;
  $("md").addEventListener("input", update);

  const drop = $("drop");
  drop.onclick = () => $("file").click();
  drop.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("file").click(); } };
  $("file").onchange = (e) => loadImage(e.target.files[0]);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); loadImage(e.dataTransfer.files[0]); };
  document.addEventListener("paste", (e) => {
    const item = [...(e.clipboardData || {}).items || []].find((i) => i.type.startsWith("image/"));
    if (item) { e.preventDefault(); loadImage(item.getAsFile()); }
  });

  document.querySelectorAll(".tab").forEach((b) => b.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.id !== "panel-" + b.dataset.tab; });
  });
  document.querySelectorAll(".copy").forEach((b) => b.onclick = () => copy(b.dataset.out, b));

  update();
  if (new URLSearchParams(location.search).has("selftest")) selftest();
  else modelsReady = loadModels(false);
})();
