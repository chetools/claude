// Pure converters: Markdown (as transcribed by the model) -> Gmail HTML, Discord markdown, plain text.
// Also the free-vision-model filter. No DOM access, so the same file runs in Node tests and in the page.
(function (root) {
  "use strict";

  // ---------- model output clean-up ----------
  function cleanModelOutput(s) {
    let t = String(s || "").replace(/\r\n?/g, "\n").trim();
    // Some models wrap the whole answer in ```markdown ... ```; unwrap it.
    const m = t.match(/^```(?:markdown|md)?[ \t]*\n([\s\S]*?)\n```$/i);
    if (m) t = m[1].trim();
    return t;
  }

  // ---------- free vision model selection ----------
  const EXCLUDE = /safety|guard|lyria/i;
  function pickFreeVisionModels(list) {
    return (list || [])
      .filter((m) => {
        const p = m.pricing || {}, a = m.architecture || {};
        return p.prompt === "0" && p.completion === "0" &&
          (a.input_modalities || []).includes("image") &&
          (a.output_modalities || ["text"]).includes("text") &&
          !EXCLUDE.test(m.id) && m.id !== "openrouter/free";
      })
      .sort((x, y) => (y.created || 0) - (x.created || 0) || (y.context_length || 0) - (x.context_length || 0))
      .map((m) => ({ id: m.id, name: m.name || m.id, created: m.created || 0 }));
  }

  // ---------- token tree ----------
  function toTree(tokens) {
    const rootNode = { type: "root", children: [] };
    const stack = [rootNode];
    for (const t of tokens) {
      const top = stack[stack.length - 1];
      if (t.nesting === 1) {
        const n = { type: t.type.replace(/_open$/, ""), tok: t, children: [] };
        top.children.push(n);
        stack.push(n);
      } else if (t.nesting === -1) {
        stack.pop();
      } else {
        top.children.push({ type: t.type, tok: t, children: [] });
      }
    }
    return rootNode;
  }

  // ---------- inline rendering ----------
  function escDiscord(s) {
    return s.replace(/([\\*_~`|])/g, "\\$1");
  }

  function renderInline(children, mode) {
    let out = "";
    let linkHref = null, linkText = "";
    const push = (s) => { if (linkHref !== null) linkText += s; else out += s; };
    for (const c of children || []) {
      switch (c.type) {
        case "text": push(mode === "discord" ? escDiscord(c.content) : c.content); break;
        case "code_inline": push(mode === "discord" ? "`" + c.content + "`" : c.content); break;
        case "softbreak": push("\n"); break;
        case "hardbreak": push("\n"); break;
        case "strong_open": case "strong_close": if (mode === "discord") push("**"); break;
        case "em_open": case "em_close": if (mode === "discord") push("*"); break;
        case "s_open": case "s_close": if (mode === "discord") push("~~"); break;
        case "link_open": linkHref = c.attrGet("href") || ""; linkText = ""; break;
        case "link_close": {
          const href = linkHref, text = linkText;
          linkHref = null;
          const plainText = text.replace(/\\(.)/g, "$1");
          if (!href || plainText === href || plainText === href.replace(/^mailto:/, "")) out += mode === "discord" ? href : plainText;
          else if (mode === "discord") out += "[" + text + "](" + href + ")";
          else out += text + " (" + href + ")";
          break;
        }
        case "image": push(c.content || (c.children ? renderInline(c.children, mode) : "")); break;
        case "html_inline": push(c.content); break;
        default: if (c.content) push(c.content);
      }
    }
    return out;
  }

  // ---------- block rendering (discord / plain) ----------
  const indentLines = (s, pad, first) =>
    s.split("\n").map((l, i) => (i === 0 ? (first !== undefined ? first : pad) : (l ? pad : "")) + l).join("\n");

  function tableRows(node, mode) {
    const rows = [];
    (function walk(n) {
      for (const c of n.children) {
        if (c.type === "tr") rows.push(c.children.map((cell) => renderInline((cell.children[0] || {}).tok?.children, "plain").trim()));
        else walk(c);
      }
    })(node);
    return rows;
  }

  function renderTable(node, mode) {
    const rows = tableRows(node, mode);
    if (!rows.length) return "";
    if (mode === "plain") return rows.map((r) => r.join(" | ")).join("\n");
    const ncol = Math.max(...rows.map((r) => r.length));
    const w = [];
    for (let j = 0; j < ncol; j++) w[j] = Math.max(...rows.map((r) => [...(r[j] || "")].length));
    const line = (r) => r.map((c, j) => (c || "") + " ".repeat(w[j] - [...(c || "")].length)).join(" | ").trimEnd();
    const out = [line(rows[0]), w.map((x) => "-".repeat(Math.max(x, 1))).join("-+-")];
    for (const r of rows.slice(1)) out.push(line(r));
    return "```\n" + out.join("\n") + "\n```";
  }

  function renderBlocks(children, mode, depth) {
    const parts = [];
    for (const n of children) {
      const s = renderBlock(n, mode, depth);
      if (s !== null && s !== "") parts.push(s);
    }
    return parts;
  }

  function renderList(n, mode, depth) {
    const ordered = n.type === "ordered_list";
    let num = ordered ? parseInt(n.tok.attrGet("start") || "1", 10) : 0;
    const tight = n.children.every((li) => li.children.every((c) => c.type !== "paragraph" || c.tok.hidden));
    const items = n.children.map((li) => {
      let marker;
      if (ordered) marker = num++ + ". ";
      else if (mode === "discord") marker = "- ";
      else marker = ["• ", "◦ ", "▪ "][depth % 3];
      const body = renderBlocks(li.children, mode, depth + 1).join(tight ? "\n" : "\n\n");
      return indentLines(body, " ".repeat(marker.length), marker);
    });
    return items.join(tight ? "\n" : "\n\n");
  }

  function renderBlock(n, mode, depth) {
    switch (n.type) {
      case "heading": {
        const lvl = parseInt(n.tok.tag.slice(1), 10);
        const text = renderInline(n.children[0].tok.children, mode);
        if (mode === "plain") return text;
        return lvl <= 3 ? "#".repeat(lvl) + " " + text : "**" + text + "**";
      }
      case "paragraph": {
        let text = renderInline(n.children[0].tok.children, mode);
        // A paragraph starting like block syntax would be re-read as a heading/list/quote in Discord.
        if (mode === "discord") text = text.replace(/^(#{1,3} |-# |> |[-+] )/gm, "\\$1").replace(/^(\d+)\. /gm, "$1\\. ");
        return text;
      }
      case "bullet_list": case "ordered_list": return renderList(n, mode, depth);
      case "blockquote": {
        const body = renderBlocks(n.children, mode, depth).join("\n\n");
        return body.split("\n").map((l) => (l ? "> " + l : ">")).join("\n");
      }
      case "fence": case "code_block": {
        const code = n.tok.content.replace(/\n$/, "");
        if (mode === "plain") return code;
        return "```" + (n.tok.info || "").trim().split(/\s/)[0] + "\n" + code + "\n```";
      }
      case "table": return renderTable(n, mode);
      case "hr": return "──────────";
      case "html_block": return n.tok.content.replace(/\n$/, "");
      case "inline": return renderInline(n.tok.children, mode);
      default: return renderBlocks(n.children, mode, depth).join("\n\n");
    }
  }

  // ---------- Gmail HTML ----------
  // Gmail drops <style> blocks, so every element carries inline styles.
  const STYLE = {
    h1: "font-size:1.6em;font-weight:bold;margin:0.6em 0 0.3em",
    h2: "font-size:1.35em;font-weight:bold;margin:0.6em 0 0.3em",
    h3: "font-size:1.15em;font-weight:bold;margin:0.6em 0 0.3em",
    h4: "font-size:1em;font-weight:bold;margin:0.6em 0 0.3em",
    h5: "font-size:0.95em;font-weight:bold;margin:0.6em 0 0.3em",
    h6: "font-size:0.9em;font-weight:bold;margin:0.6em 0 0.3em",
    p: "margin:0 0 0.8em",
    ul: "margin:0 0 0.8em;padding-left:1.6em",
    ol: "margin:0 0 0.8em;padding-left:1.6em",
    blockquote: "margin:0 0 0.8em;padding-left:0.8em;border-left:3px solid #ccc;color:#555",
    pre: "background:#f4f4f4;padding:8px 10px;border-radius:4px;font-family:Consolas,Menlo,monospace;font-size:0.9em;white-space:pre-wrap",
    code: "font-family:Consolas,Menlo,monospace;background:#f4f4f4;padding:0 3px;border-radius:3px",
    table: "border-collapse:collapse;margin:0 0 0.8em",
    th: "border:1px solid #bbb;padding:4px 8px;background:#f0f0f0;font-weight:bold;text-align:left",
    td: "border:1px solid #bbb;padding:4px 8px",
    hr: "border:none;border-top:1px solid #ccc;margin:1em 0",
  };

  function makeMd(markdownit) {
    // breaks: the model is told to put each paragraph on one line, so every newline left is a real line break.
    const md = markdownit({ html: false, linkify: true, breaks: true });
    md.core.ruler.push("inline_styles", (state) => {
      const style = (t) => {
        const s = STYLE[t.tag];
        if (s && t.nesting >= 0 && !(t.tag === "code" && t.type === "fence")) {
          const old = t.attrGet("style");
          t.attrSet("style", old ? old + ";" + s : s);
        }
      };
      for (const t of state.tokens) {
        style(t);
        if (t.children) t.children.forEach(style);
      }
    });
    // Fences: <pre style><code>…</code></pre> with the pre style only.
    md.renderer.rules.fence = (tokens, idx) =>
      '<pre style="' + STYLE.pre + '"><code>' + md.utils.escapeHtml(tokens[idx].content) + "</code></pre>\n";
    md.renderer.rules.code_block = md.renderer.rules.fence;
    return md;
  }

  function convertAll(markdownit, markdown) {
    const md = makeMd(markdownit);
    const src = cleanModelOutput(markdown);
    const tree = toTree(md.parse(src, {}));
    const tidy = (s) => s.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
    return {
      markdown: src,
      html: md.render(src),
      discord: tidy(renderBlocks(tree.children, "discord", 0).join("\n\n")),
      plain: tidy(renderBlocks(tree.children, "plain", 0).join("\n\n")),
    };
  }

  const api = { cleanModelOutput, pickFreeVisionModels, convertAll };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ImgText = api;
})(typeof window !== "undefined" ? window : globalThis);
