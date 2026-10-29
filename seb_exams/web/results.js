// Teacher results page: lists submissions from the Worker and exports them as CSV.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let pw = "", data = null;
  try { pw = sessionStorage.getItem("sebexam:pw") || ""; } catch (e) { /* storage blocked */ }

  function message(text, kind) {
    $("msg").innerHTML = text ? '<div class="msg ' + (kind || "err") + '"></div>' : "";
    if (text) $("msg").firstChild.textContent = text;
  }

  async function get(path) {
    const r = await fetch(window.API + path, { headers: { Authorization: "Bearer " + pw } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Error " + r.status);
    return d;
  }

  async function signIn(ev) {
    if (ev) ev.preventDefault();
    if (ev) pw = $("pw").value;
    try {
      const exams = await get("/exams");
      try { sessionStorage.setItem("sebexam:pw", pw); } catch (e) { /* ignore */ }
      $("exam").innerHTML = "";
      for (const e of exams) {
        const o = document.createElement("option");
        o.value = e.id;
        o.textContent = e.title + " (" + e.id + ")";
        $("exam").appendChild(o);
      }
      const want = new URLSearchParams(location.search).get("exam");
      if (want) $("exam").value = want;
      $("login").classList.add("hidden");
      $("pick").classList.remove("hidden");
      message("");
      if (exams.length) await loadExam(); else message("No exams in the database yet.", "warn");
    } catch (e) {
      message(e.message);
      $("login").classList.remove("hidden");
    }
  }

  const optLetter = (q, id) => { const i = q.options.findIndex((o) => o.id === id); return i < 0 ? "" : String.fromCharCode(65 + i); };

  function cell(q, s) {
    const a = s.answers[q.id] || "";
    const d = s.detail[q.id];
    if (q.type === "mc") return { text: optLetter(q, a), cls: d && d.ok ? "ok" : "bad" };
    if (q.type === "fill") return { text: a, cls: d && d.ok ? "ok" : "bad" };
    return { text: a, cls: "", open: true };
  }

  function columns() {
    return ["Name", "Student ID", "Submitted (UTC)", "Minutes used", "Auto score"].concat(
      data.questions.map((q) => q.id + " [" + q.type + ", " + q.points + "]"), ["Receipt", "SEB check"]);
  }

  function rowValues(s) {
    const used = s.started_at ? ((Date.parse(s.submitted_at) - Date.parse(s.started_at)) / 60000).toFixed(1) : "";
    return [s.name, s.student_id, s.submitted_at.replace("T", " ").slice(0, 19), used,
      s.auto_score + " / " + s.auto_max + (s.manual_max ? " (+" + s.manual_max + " manual)" : "")]
      .concat(data.questions.map((q) => cell(q, s)), [s.receipt, s.seb_check]);
  }

  function renderKey() {
    const box = $("key");
    box.innerHTML = "";
    for (const q of data.questions) {
      const h = document.createElement("h3");
      h.textContent = q.id + " (" + q.type + ", " + q.points + " points)";
      const p = document.createElement("pre");
      if (q.type === "mc") p.textContent = q.options.map((o, i) => String.fromCharCode(65 + i) + (o.id === q.correct ? " ✓ " : "   ") + o.text).join("\n");
      else if (q.type === "fill") p.textContent = "Accepted: " + q.answers.join(", ");
      else p.textContent = q.model_answer || "(no model answer)";
      box.append(h, p);
    }
    $("keybox").classList.remove("hidden");
  }

  async function loadExam() {
    try {
      data = await get("/results?exam=" + encodeURIComponent($("exam").value));
    } catch (e) { return message(e.message); }
    renderKey();
    const t = $("table");
    t.innerHTML = "";
    const head = t.createTHead().insertRow();
    for (const c of columns()) { const th = document.createElement("th"); th.textContent = c; head.appendChild(th); }
    const body = t.createTBody();
    for (const s of data.submissions) {
      const tr = body.insertRow();
      for (const v of rowValues(s)) {
        const td = tr.insertCell();
        const val = typeof v === "object" && v !== null ? v : { text: v };
        if (val.cls) td.className = val.cls;
        if (val.open) {
          const div = document.createElement("div");
          div.className = "open";
          div.title = "Click to expand";
          div.textContent = val.text;
          div.addEventListener("click", () => div.classList.toggle("full"));
          td.appendChild(div);
        } else td.textContent = val.text;
      }
    }
    $("count").textContent = data.submissions.length + (data.submissions.length === 1 ? " submission" : " submissions");
    $("tablewrap").classList.remove("hidden");
  }

  function csv() {
    if (!data) return;
    const esc = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const cols = columns().concat(data.questions.filter((q) => q.type !== "open").map((q) => q.id + " points"));
    const lines = [cols.map(esc).join(",")];
    for (const s of data.submissions) {
      const vals = rowValues(s).map((v) => (typeof v === "object" && v !== null ? v.text : v))
        .concat(data.questions.filter((q) => q.type !== "open").map((q) => (s.detail[q.id] || {}).points ?? ""));
      lines.push(vals.map(esc).join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = data.exam.id + "-results.csv";
    a.click();
  }

  $("login").addEventListener("submit", signIn);
  $("exam").addEventListener("change", loadExam);
  $("reload").addEventListener("click", loadExam);
  $("csv").addEventListener("click", csv);
  if (pw) signIn();
})();
