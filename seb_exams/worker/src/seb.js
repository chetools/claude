// Safe Exam Browser: per-exam configuration file, Config Key and the check of what a student's browser sends.
import { sebJson, sebSettings } from "../public/shared/validate.js";
import { sha256hex, ctEqual, esc } from "./util.js";

export const STUDENT_PAGE = "https://chetools.github.io/claude/seb_exams/exam/";
export const DEV_STUDENT_PAGE = "http://localhost:8765/exam/";

export const studentUrl = (id) => STUDENT_PAGE + "?id=" + id;
export const sebFileUrl = (env, id) => env.APP_ORIGIN + "/s/seb/" + id + ".seb";
export const sebLink = (env, id) => "sebs://" + new URL(env.APP_ORIGIN).host + "/s/seb/" + id + ".seb";

export async function configKey(exam) {
  return sha256hex(sebJson(sebSettings(exam.id, exam.quit_password_sha256 || "")));
}

// Unencrypted SEB configuration: an XML property list with sorted keys (like Python's plistlib).
function plistValue(v, ind) {
  const pad = "\t".repeat(ind);
  if (typeof v === "boolean") return `${pad}<${v}/>\n`;
  if (typeof v === "number") return `${pad}<integer>${v}</integer>\n`;
  if (typeof v === "string") return `${pad}<string>${esc(v)}</string>\n`;
  if (Array.isArray(v)) return `${pad}<array>\n${v.map((x) => plistValue(x, ind + 1)).join("")}${pad}</array>\n`;
  const keys = Object.keys(v).sort();
  return `${pad}<dict>\n${keys.map((k) => `${pad}\t<key>${esc(k)}</key>\n${plistValue(v[k], ind + 1)}`).join("")}${pad}</dict>\n`;
}

export function sebPlist(exam) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0">\n' + plistValue(sebSettings(exam.id, exam.quit_password_sha256 || ""), 0) + "</plist>\n";
}

// SEB check. SafeExamBrowser.security.configKey (JS API) = SHA256(page URL without fragment + Config Key);
// SEB versions that use HTTP headers send the same hash of the requested URL in X-SafeExamBrowser-ConfigKeyHash.
// The page URL must be exactly the exam's student URL, so a key for another page cannot be replayed.
export async function checkSeb(env, exam, seb, req) {
  if (!exam.require_seb) return { ok: true, how: "not required" };
  const keys = [await configKey(exam), ...JSON.parse(exam.extra_config_keys || "[]")];
  const urls = [studentUrl(exam.id)];
  if (env.DEV === "1") urls.push(DEV_STUDENT_PAGE + "?id=" + exam.id);
  if (seb && typeof seb.ck === "string" && typeof seb.url === "string") {
    const url = seb.url.split("#")[0];
    if (urls.includes(url)) {
      const ck = seb.ck.toLowerCase();
      let hit = false;
      for (const k of keys) if (ctEqual(await sha256hex(url + k), ck)) hit = true;
      if (hit) return { ok: true, how: "js-api" };
    }
  }
  const hdr = req.headers.get("X-SafeExamBrowser-ConfigKeyHash");
  if (hdr) {
    const url = req.url.split("#")[0];
    let hit = false;
    for (const k of keys) if (ctEqual(await sha256hex(url + k), hdr.toLowerCase())) hit = true;
    if (hit) return { ok: true, how: "header" };
  }
  return { ok: false, error: seb || hdr
    ? "Safe Exam Browser is running with a different configuration than this exam expects. Open the exam with the exam's own SEB link."
    : "This exam must be taken in Safe Exam Browser." };
}
