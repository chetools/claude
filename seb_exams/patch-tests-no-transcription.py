#!/usr/bin/env python3
"""Update the Worker test suite for the removal of server-side transcription
(2026-11-05): the mock model server keeps only the audit chat endpoint; audio
takes seal without a server transcript; the teacher transcribe route is gone;
critique uploads carry no transcription check."""
import pathlib

p = pathlib.Path("tests/transcript-test.mjs")
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

# 1. mock model server: audit only
rep("""    if (req.url.includes("audio/transcriptions")) {
      const text = body.includes("slide-1") ? "Words from audio one." : "Words from audio two.";
      res.end(JSON.stringify({ text }));
    } else {
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(auditFractions) } }] }));
    }""",
"""    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(auditFractions) } }] }));""")

# 2. model settings: no transcribe_model anywhere
rep('body: { provider: "mock", base_url: "http://127.0.0.1:8932", model: "mock-1", transcribe_model: "mock-whisper" } });\ncheck("model settings saved"',
    'body: { provider: "mock", base_url: "http://127.0.0.1:8932", model: "mock-1" } });\ncheck("model settings saved"')
rep('r.data.model === "mock-1" && r.data.transcribe_model === "mock-whisper" && r.data.audio_configured === true',
    'r.data.model === "mock-1" && !("transcribe_model" in r.data) && r.data.audio_configured === true')

# 3. dan: seal makes no server transcript; his Muse transcribes and grades
block("// ---- audio take: upload, seal, server transcription --------------------------------",
      "env.AUDIO = AUDIO;\n",
"""// ---- audio take: upload, seal; the student's Muse transcribes and grades ------------
const wav1 = new TextEncoder().encode("FAKE-WAV-ONE").buffer;
const wav2 = new TextEncoder().encode("FAKE-WAV-TWO").buffer;
const dan = await studentLogin("dan@example.edu");
const dSess = dan.verify.data.session;
await call("POST", "/t/session", { session: dSess, body: { examId } });
r = await call("POST", `/t/audio-segment?examId=${examId}&slide=1&title=${encodeURIComponent("Bernoulli Equation")}`, { raw: wav1 });
check("audio upload without sign-in refused", r.status === 403, r.status);
r = await call("POST", `/t/audio-segment?examId=${examId}&slide=1&title=${encodeURIComponent("Bernoulli Equation")}`, { session: dSess, raw: wav1 });
check("audio segment 1 stored", r.status === 200 && r.data.segmentFingerprint === sha("FAKE-WAV-ONE"), JSON.stringify(r.data));
r = await call("POST", `/t/audio-segment?examId=${examId}&slide=2&title=${encodeURIComponent("Energy balance")}`, { session: dSess, raw: wav2 });
check("audio segment 2 stored", r.status === 200 && r.data.segmentFingerprint === sha("FAKE-WAV-TWO"));
check("two objects in the bucket", AUDIO.map.size === 2, AUDIO.map.size);
r = await call("POST", "/t/seal", { session: dSess, body: { examId } });
check("audio seal makes no transcript on the server", r.status === 200 && r.data.sealedTranscript === null && r.data.transcriptFingerprint === null && !("transcriptionStatus" in r.data), JSON.stringify(r.data));
check("audio fingerprint covers both segments", r.data.audioFingerprint === sha("1:" + sha("FAKE-WAV-ONE") + "\\n2:" + sha("FAKE-WAV-TWO")), r.data.audioFingerprint);
const dCode = r.data.sessionCode;
r = await call("GET", "/t/packet?session=" + dCode);
check("packet for audio take carries no transcript, lists the audio", r.status === 200 && r.data.transcript === null && r.data.audio.length === 2 && r.data.audioFingerprint === sha("1:" + sha("FAKE-WAV-ONE") + "\\n2:" + sha("FAKE-WAV-TWO")));
r = await call("GET", `/api/t/exams/${examId}/results/${encodeURIComponent("dan@example.edu")}/audio/1`, { cookie });
check("teacher can download slide audio", r.status === 200 && r.text === "FAKE-WAV-ONE", r.status + " " + r.text);
env.AUDIO = undefined;
r = await call("POST", `/t/audio-segment?examId=${examId}&slide=3`, { session: dSess, raw: wav1 });
check("audio route fails closed with no bucket", r.status === 500, r.status);
env.AUDIO = AUDIO;
auditFractions = { ...honest };
r = await call("POST", "/t/critique", { body: { sessionCode: dCode, transcript: "1 (Bernoulli Equation): Words from audio one.\\n2 (Energy balance): Words from audio two.", critique: "Graded from my own transcription of the sealed audio.", grades: honest } });
check("student-Muse transcript graded, no server transcription check", r.status === 200 && r.data.status === "graded" && !("transcriptionCheck" in r.data), JSON.stringify(r.data));
""")

# 4. eve: held as audio_sealed; the teacher transcribe route is gone
block("// ---- audio take with no transcription model: held as audio_sealed, teacher retries ----",
      'check("teacher-triggered transcription completes the seal", r.status === 200 && r.data.transcriptionStatus === "done" && r.data.sealedTranscript === "1 (Bernoulli Equation): Words from audio one.", JSON.stringify(r.data));\n',
"""// ---- a sealed audio take waits for the student's Muse; no teacher transcribe route --
const eve = await studentLogin("eve@example.edu");
const eSess = eve.verify.data.session;
await call("POST", "/t/session", { session: eSess, body: { examId } });
await call("POST", `/t/audio-segment?examId=${examId}&slide=1&title=${encodeURIComponent("Bernoulli Equation")}`, { session: eSess, raw: wav1 });
r = await call("POST", "/t/seal", { session: eSess, body: { examId } });
check("the take is held as audio_sealed", r.status === 200 && r.data.sealedTranscript === null, JSON.stringify(r.data));
const eCode = r.data.sessionCode;
r = await call("GET", "/t/packet?session=" + eCode);
check("packet serves the audio take for student-Muse grading", r.status === 200 && r.data.transcript === null && r.data.audio.length === 1, r.status);
r = await call("POST", `/api/t/exams/${examId}/results/${encodeURIComponent("eve@example.edu")}/transcribe`, { cookie, body: {} });
check("the teacher transcribe route no longer exists", r.status === 404, r.status);
""")

# 5. frank + grace: drop the remaining settings PUTs that carried transcribe_model
rep('r = await call("PUT", "/api/t/settings/model", { cookie, body: { provider: "mock", base_url: "http://127.0.0.1:8932", model: "mock-1", transcribe_model: "" } });\n', "", n=2)
rep('check("frank\'s take is audio_sealed", r.status === 200 && r.data.transcriptionStatus === "not_configured", JSON.stringify(r.data));',
    'check("frank\'s take is audio_sealed", r.status === 200 && r.data.sealedTranscript === null, JSON.stringify(r.data));')
rep('check("student Muse transcript + critique accepted", r.status === 200 && r.data.status === "graded" && r.data.transcriptionCheck.status === "not_configured", JSON.stringify(r.data));',
    'check("student Muse transcript + critique accepted", r.status === 200 && r.data.status === "graded" && !("transcriptionCheck" in r.data), JSON.stringify(r.data));')
block('r = await call("PUT", "/api/t/settings/model", { cookie, body: { provider: "mock", base_url: "http://127.0.0.1:8932", model: "mock-1", transcribe_model: "mock-whisper" } });\nr = await call("POST", "/t/critique", { body: { sessionCode: fCode, transcript: "1 (Bernoulli Equation): Completely invented words about nothing.", critique: "Graded from an invented transcript.", grades: honest } });',
      'check("invented transcript flagged against the server transcription", r.status === 200 && r.data.status === "flagged" && r.data.transcriptionCheck.similarity < 0.6 && r.data.flags.some((f) => f.element === "Transcription match"), JSON.stringify(r.data));\n',
"""r = await call("POST", "/t/critique", { body: { sessionCode: fCode, transcript: "1 (Bernoulli Equation): Completely different words.", critique: "A replacement transcript.", grades: honest } });
check("a replacement transcript is accepted (no server transcription cross-check)", r.status === 200 && r.data.status === "graded", JSON.stringify(r.data));
""")

p.write_text(s)
# the only remaining mentions are the negative assertions that the fields are gone
assert "transcriptionCheck.status" not in s and "transcriptionStatus ===" not in s and "transcribe_model:" not in s
print("transcript-test.mjs patched OK")

for f in ("tests/skill-audio-test.mjs", "tests/skill-photo-test.mjs"):
    q = pathlib.Path(f)
    t = q.read_text()
    old = 'sealed.data.transcriptionStatus === "not_configured"'
    assert t.count(old) == 1, f
    q.write_text(t.replace(old, "sealed.data.sealedTranscript === null"))
    print(f, "patched OK")
