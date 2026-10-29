// Exam page logic. window.EXAM holds the public exam (no answers); grading happens in the Worker.
(function () {
  "use strict";
  const E = window.EXAM;
  const $ = (id) => document.getElementById(id);
  const STORE = "sebexam:" + E.id;
  let state = load() || {};
  let timerId = null, submitting = false;

  // ------------------------------------------------------------ storage (autosave)
  function load() { try { return JSON.parse(localStorage.getItem(STORE)); } catch (e) { return null; } }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); $("saved").textContent = "Saved " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
    catch (e) { $("saved").textContent = "Not saved on this computer"; }
  }

  function message(text, kind) {
    $("msg").innerHTML = text ? '<div class="msg ' + (kind || "err") + '"></div>' : "";
    if (text) $("msg").firstChild.textContent = text;
  }

  // ------------------------------------------------------------ Safe Exam Browser
  function sebPresent() { return !!(window.SafeExamBrowser && window.SafeExamBrowser.security); }

  // Config Key hashed with this page's URL, from the SEB JavaScript API (null outside SEB).
  function sebKeys() {
    return new Promise((resolve) => {
      if (!sebPresent()) return resolve(null);
      const s = window.SafeExamBrowser.security;
      const done = () => resolve({ ck: s.configKey || "", url: location.href.split("#")[0] });
      if (s.configKey) return done();
      if (typeof s.updateKeys === "function") { s.updateKeys(done); setTimeout(done, 3000); } else done();
    });
  }

  async function api(path, body) {
    const r = await fetch(E.api + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let data = {};
    try { data = await r.json(); } catch (e) { /* non-JSON error */ }
    return { status: r.status, data };
  }

  // ------------------------------------------------------------ deterministic shuffle per student
  function rng(seed) {
    let h = 2166136261;
    for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e9) / 1e9; };
  }
  function shuffle(a, r) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // ------------------------------------------------------------ rendering
  const SECTIONS = [["mc", "Multiple choice"], ["fill", "Fill in the blank"], ["open", "Open-ended"]];

  function render() {
    const r = rng(E.id + "|" + state.student_id);
    const box = $("questions");
    box.innerHTML = "";
    let n = 0;
    for (const [type, title] of SECTIONS) {
      const qs = shuffle(E.questions.filter((q) => q.type === type), r);
      if (!qs.length) continue;
      const h = document.createElement("div");
      h.className = "section-title";
      h.textContent = title;
      box.appendChild(h);
      for (const q of qs) box.appendChild(renderQ(q, ++n, r));
    }
    countAnswered();
  }

  function renderQ(q, n, r) {
    const card = document.createElement("div");
    card.className = "card q";
    card.dataset.q = q.id;
    card.innerHTML = '<h2><span>Question ' + n + '</span><span class="pts">' + q.points + (q.points === 1 ? " point" : " points") + "</span></h2>" + q.html;
    if (q.figure) {
      const f = document.createElement("div");
      f.className = "figure";
      f.innerHTML = q.figure;
      card.appendChild(f);
    }
    const ans = state.answers || (state.answers = {});
    if (q.type === "mc") {
      const opts = document.createElement("div");
      opts.className = "opts";
      opts.setAttribute("role", "radiogroup");
      for (const o of q.shuffle ? shuffle(q.options, r) : q.options) {
        const lab = document.createElement("label");
        lab.className = "opt";
        lab.innerHTML = '<input type="radio"><span class="lab"></span>';
        lab.querySelector(".lab").innerHTML = o.html;
        const inp = lab.querySelector("input");
        inp.name = "q-" + q.id;
        inp.value = o.id;
        inp.checked = ans[q.id] === o.id;
        lab.classList.toggle("sel", inp.checked);
        inp.addEventListener("change", () => {
          ans[q.id] = o.id;
          opts.querySelectorAll(".opt").forEach((l) => l.classList.toggle("sel", l.querySelector("input").checked));
          changed();
        });
        opts.appendChild(lab);
      }
      card.appendChild(opts);
    } else if (q.type === "fill") {
      const inp = card.querySelector("input.blank");
      inp.value = ans[q.id] || "";
      inp.addEventListener("input", () => { ans[q.id] = inp.value; changed(); });
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = "Hint: the second letter of the missing word is “" + q.hint + "”.";
      card.appendChild(hint);
    } else {
      const ta = document.createElement("textarea");
      ta.value = ans[q.id] || "";
      ta.setAttribute("aria-label", "Answer to question " + n);
      const cnt = document.createElement("div");
      cnt.className = "count";
      const words = () => { const w = ta.value.trim().split(/\s+/).filter(Boolean).length; cnt.textContent = w + (w === 1 ? " word" : " words"); };
      ta.addEventListener("input", () => { ans[q.id] = ta.value; words(); changed(); });
      words();
      card.appendChild(ta);
      card.appendChild(cnt);
    }
    return card;
  }

  let saveTimer = null;
  function changed() {
    countAnswered();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  function unanswered() { return E.questions.filter((q) => !String((state.answers || {})[q.id] || "").trim()).length; }
  function countAnswered() { $("answered").textContent = (E.questions.length - unanswered()) + " of " + E.questions.length + " answered"; }

  // ------------------------------------------------------------ timer
  function remaining() { return Date.parse(state.started_at) + E.duration_minutes * 60000 - Date.now(); }
  function tick() {
    const ms = Math.max(0, remaining());
    const s = Math.ceil(ms / 1000);
    $("timer").textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    $("timer").classList.toggle("low", ms < 5 * 60000);
    if (ms <= 0) { clearInterval(timerId); timeUp(); }
  }
  function timeUp() {
    document.querySelectorAll("#questions input, #questions textarea").forEach((el) => (el.disabled = true));
    message("Time is up. Your answers are being submitted.", "warn");
    submit();
  }

  // ------------------------------------------------------------ flow
  function show(which) {
    for (const id of ["start", "exam", "done"]) $(id).classList.toggle("hidden", id !== which);
    $("bar").classList.toggle("hidden", which !== "exam");
  }

  async function start(ev) {
    ev.preventDefault();
    const name = $("name").value.trim(), sid = $("sid").value.trim();
    if (!name || !sid) return;
    $("startbtn").disabled = true;
    message("");
    try {
      const { status, data } = await api("/check", { exam_id: E.id, seb: await sebKeys() });
      if (status !== 200) { message(data.error || "Could not start the exam (error " + status + ")."); return; }
    } catch (e) {
      message("Cannot reach the exam server. Check the network connection and try again.");
      return;
    } finally { $("startbtn").disabled = false; }
    state = { name, student_id: sid, started_at: new Date().toISOString(), answers: {} };
    save();
    begin();
  }

  function begin() {
    $("who").textContent = state.name + " · " + state.student_id;
    render();
    show("exam");
    tick();
    timerId = setInterval(tick, 1000);
    setInterval(() => { if (!state.receipt) save(); }, 10000);
  }

  function askSubmit() {
    const u = unanswered();
    $("confirmtext").textContent = (u ? u + (u === 1 ? " question is" : " questions are") + " not answered. " : "") +
      "You can submit only once. Submit your exam now?";
    $("confirm").showModal();
  }

  async function submit() {
    if (submitting || state.receipt) return;
    submitting = true;
    $("submitbtn").disabled = true;
    save();
    try {
      const { status, data } = await api("/submit", { exam_id: E.id, name: state.name, student_id: state.student_id,
        answers: state.answers, started_at: state.started_at, seb: await sebKeys() });
      if (status === 200) {
        state.receipt = data.receipt;
        save();
        finish();
      } else {
        message(data.error || "Submission failed (error " + status + ").");
        if (status !== 409) $("submitbtn").disabled = false;
      }
    } catch (e) {
      message("Cannot reach the exam server; your answers are saved on this computer. Check the connection and press Submit again.");
      $("submitbtn").disabled = false;
    } finally { submitting = false; }
  }

  function finish() {
    clearInterval(timerId);
    $("receipt").textContent = state.receipt;
    show("done");
    message("");
  }

  // ------------------------------------------------------------ init
  function init() {
    $("sub").textContent = E.questions.length + " questions · " + E.duration_minutes + " minutes";
    $("intro").innerHTML = E.intro;
    $("quit").href = E.quit_url;
    $("startform").addEventListener("submit", start);
    $("submitbtn").addEventListener("click", askSubmit);
    $("yes").addEventListener("click", () => { $("confirm").close(); submit(); });
    $("no").addEventListener("click", () => $("confirm").close());
    if (state.receipt) return finish();
    if (state.started_at) return begin();  // resume after a reload or an SEB restart
    show("start");
    if (E.require_seb && !sebPresent()) {
      $("sebgate").classList.remove("hidden");
      $("seblink").href = E.seb_link;
      $("sebfile").href = E.seb_file;
      $("startbtn").disabled = true;
    }
  }
  init();
})();
