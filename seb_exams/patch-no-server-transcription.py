#!/usr/bin/env python3
"""Remove server-side transcription from the seb_exams Worker (2026-11-05, user's
direction: all transcription is done in the student's or teacher's Muse; the
server never transcribes). Removes runTranscription, the seal-time transcription
branch, the upload cross-check and its flag, the teacher transcribe route, and
the transcribe_model setting. Keeps the audit re-grade and the validation
transcript comparison (two Muse transcripts compared, no server transcription).
Every replacement is asserted; any mismatch aborts without writing."""
import pathlib, sys

p = pathlib.Path("worker/src/transcript.js")
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

# 1. audio-takes header comment
rep("""// the server stores the segments in the AUDIO R2 bucket, seals a fingerprint of the audio,
// and transcribes the segments itself through the configured model connection's
// transcription model (an OpenAI-style /audio/transcriptions endpoint). The resulting
// transcript is the canonical sealed text, exactly as a text seal is. Without a bucket
// the audio routes fail closed; without a transcription model or key the take stays in
// status 'audio_sealed' (audio held and fingerprinted, no transcript invented) until a
// teacher runs transcription from the results view.""",
"""// the server stores the segments in the AUDIO R2 bucket and seals a fingerprint of the
// audio. The server never transcribes: the take stays in status 'audio_sealed' (audio
// held and fingerprinted, no transcript invented) until the student's Muse downloads
// the segments under the session code, transcribes them, and uploads its transcript
// with its critique and grades. Without a bucket the audio routes fail closed.""")

# 2. transcriptionOf helper
rep('const transcriptionOf = (sub) => { try { return JSON.parse(sub.transcription_json || "{}"); } catch { return {}; } };\n', "")

# 3. runTranscription: delete the whole function (comment head to its closing brace,
#    which is followed by the seal comment)
block("// Transcribe every stored audio segment, in slide order, and assemble the canonical",
      '  return { status: "done", segments, model: cfg.transcribe_model, at: nowIso() };\n}\n', "")

# 4. seal comment
rep("""// Seal (or re-seal after transcription) an audio take: computes the transcript when
// transcription succeeds, stamps transcript fingerprint + receipt, and records the
// transcription status either way. Shared by /t/seal and the teacher transcribe route.""",
"""// Seal an audio take: stamps the audio fingerprint and the receipt over the stored
// segments (the submission picture and scene-change captures are covered when
// present). The take is held as 'audio_sealed'; its transcript is made later by the
// student's Muse from the sealed audio. Called by /t/seal.""")

# 5. finaliseAudioSeal body: from the runTranscription call to the end of the function
block("  const audioFp = await sha256hex(fpText);\n  const tr = await runTranscription(env, exam, sub);",
      '    sealedTranscript: null, transcriptionStatus: tr.status };\n}',
"""  const audioFp = await sha256hex(fpText);
  const receipt = await receiptCode(env, [sub.session_code, sub.email, audioFp, "", sub.variation || "", sub.opened_at, sealedAt]);
  await env.DB.prepare(
    "UPDATE t_submissions SET status = 'audio_sealed', audio_fingerprint = ?, photo_fingerprint = ?, receipt = ?, sealed_at = ?, prompt_version = ?, transcription_json = '{}' WHERE exam_id = ? AND email = ?")
    .bind(audioFp, photo ? photo.sha256 : null, receipt, sealedAt, exam.prompt_version, exam.id, sub.email).run();
  return { audioFingerprint: audioFp, transcriptFingerprint: null, receipt, sealedAt,
    photoFingerprint: photo ? photo.sha256 : null, sealedTranscript: null };
}""")

# 6. uploadCritique: drop the check variable, replace the audio branch, drop the flag,
#    the stored-check merge and the response field
rep("  let transcriptionCheck = null;\n", "")
block("    // Audio-sealed take with no server transcript yet: the student's Muse transcribed",
      "      .bind(studentTranscript, sFp, sub.exam_id, sub.email).run();\n    }",
"""    // Audio-sealed take: the student's Muse transcribed the sealed audio itself.
    // Its transcript is stored as the student's transcript (the seal itself is the
    // audio fingerprint; nothing here overwrites it), and the audit, when configured,
    // grades that transcript.
    const studentTranscript = String(body.transcript || "").replace(/\\s+$/g, "").replace(/^\\s+/g, "");
    if (!studentTranscript) throw new HttpError(400, "For an audio-sealed take, the upload must include the transcript made from the sealed audio.");
    attemptTranscript = studentTranscript;
    gradedText = studentTranscript;
    const sFp = await sha256hex(studentTranscript);
    await env.DB.prepare("UPDATE t_submissions SET student_transcript = ?, student_fingerprint = ? WHERE exam_id = ? AND email = ?")
      .bind(studentTranscript, sFp, sub.exam_id, sub.email).run();""")
rep("""  if (transcriptionCheck && transcriptionCheck.similarity !== null && transcriptionCheck.similarity < 0.6) {
    flags.push({ element: "Transcription match", student: transcriptionCheck.similarity, audit: 1 });
  }
""", "")
rep("  const auditStored = transcriptionCheck ? { ...audit, transcription_check: transcriptionCheck } : audit;\n", "")
rep("JSON.stringify(auditStored)", "JSON.stringify(audit)")
rep("return json({ ok: true, status, flags, auditStatus: audit.status, transcriptionCheck, final: isFinal });",
    "return json({ ok: true, status, flags, auditStatus: audit.status, final: isFinal });")

# 7. results route: drop the transcription field
rep("      transcription: transcriptionOf(r),\n", "")

# 8. model settings: drop transcribe_model from GET and PUT
rep(''',\n      transcribe_model: cfg.transcribe_model || "", audio_configured:''', ''',\n      audio_configured:''')
rep(''', transcribe_model: String(b.transcribe_model || "").slice(0, 120) };''', ''' };''')

# 9. teacher transcribe route: delete the whole block
block('  const mTranscribe = p.match(/^\\/api\\/t\\/exams\\/([a-z0-9-]{1,40})\\/results\\/([^/]+)\\/transcribe$/);',
      "    return json({ ok: true, ...out });\n  }\n", "")

p.write_text(s)
print("patched OK; remaining 'transcrib' lines:")
for i, line in enumerate(s.split("\n"), 1):
    if "transcrib" in line.lower():
        print(f"  {i}: {line.strip()[:110]}")
