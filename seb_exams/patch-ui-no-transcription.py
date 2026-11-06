#!/usr/bin/env python3
"""Remove server-transcription surfaces from the teacher app UI (2026-11-05):
the card becomes audit-only, the transcription-model field goes, the results
'Transcription:' line and the 'Transcribe audio' button go. Asserted edits."""
import pathlib

p = pathlib.Path("worker/public/js/transcript.js")
s = p.read_text()

def rep(old, new, n=1):
    global s
    c = s.count(old)
    assert c == n, f"expected {n} of {old[:70]!r}, found {c}"
    s = s.replace(old, new)

def block(start_anchor, end_anchor, new):
    global s
    i = s.find(start_anchor); assert i >= 0, f"start anchor missing: {start_anchor[:60]!r}"
    j = s.find(end_anchor, i); assert j >= 0, f"end anchor missing: {end_anchor[:60]!r}"
    j += len(end_anchor)
    assert s.find(start_anchor, i + 1) == -1, "start anchor not unique"
    s = s[:i] + new + s[j:]

# model card: drop the transcription-model input and its wiring
rep("  const tmod = h('input', { type: 'text', placeholder: 'e.g. whisper-1 or gpt-4o-mini-transcribe' });\n", "")
rep("prov.value = cfg.provider || ''; base.value = cfg.base_url || ''; mod.value = cfg.model || ''; tmod.value = cfg.transcribe_model || '';",
    "prov.value = cfg.provider || ''; base.value = cfg.base_url || ''; mod.value = cfg.model || '';")
rep("'Model connection (audit re-grade and audio transcription)'", "'Model connection (audit re-grade)'")
rep("The transcription model transcribes sealed audio takes through the same connection\\u2019s audio transcriptions service. ", "")
rep("    h('label', { class: 'field' }, 'Transcription model (audio takes)', tmod),\n", "")
rep("body: { provider: prov.value, base_url: base.value, model: mod.value, transcribe_model: tmod.value }",
    "body: { provider: prov.value, base_url: base.value, model: mod.value }")

# results detail: drop the Transcription status line (keep the audio fingerprint)
rep("""      audioKids.push(h('p', { class: 'hint' }, 'Transcription: ' + (r.transcription && r.transcription.status ? r.transcription.status : 'not run')
        + (r.transcription && r.transcription.model ? ' · ' + r.transcription.model : '')
        + (r.transcription && r.transcription.detail ? ' · ' + r.transcription.detail : '')
        + '. Audio fingerprint: ' + (r.audio_fingerprint || '—')));""",
"""      audioKids.push(h('p', { class: 'hint' }, 'Audio fingerprint: ' + (r.audio_fingerprint || '—')));""")

# results detail: drop the Transcribe audio button block
block("      audioKids.push(h('div', { class: 'row' }, h('button', { class: 'secondary', onclick: async () => {",
      "      } }, 'Transcribe audio'), tOut));\n", "")
rep("      const tOut = h('div', {});\n", "")

p.write_text(s)
print("patched OK; remaining 'transcrib' lines:")
for i, line in enumerate(s.split("\n"), 1):
    if "transcrib" in line.lower():
        print(f"  {i}: {line.strip()[:110]}")
