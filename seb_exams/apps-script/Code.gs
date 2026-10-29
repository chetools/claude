/**
 * SEB Exams - login email sender (Google Apps Script web app).
 *
 * The Cloudflare Worker POSTs JSON {secret, to, subject, html, text} to this web app; the script checks the
 * shared secret and sends the email from the Gmail account that owns the script.
 *
 * Deploy steps (full click-by-click guide: docs/SETUP.md):
 *  1. Go to https://script.google.com, New project, paste this file into Code.gs, Save.
 *  2. Project Settings (gear) > Script Properties > Add script property:
 *       name MAIL_SECRET, value = a long random string (the same value is given to the Worker as secret MAIL_SECRET).
 *  3. Deploy > New deployment > type "Web app": Execute as "Me", Who has access "Anyone". Deploy, authorize.
 *  4. Copy the Web app URL (ends in /exec): that is the Worker secret MAIL_URL.
 *  After changing this code, use Deploy > Manage deployments > edit > New version, so the /exec URL stays the same.
 */

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var expected = PropertiesService.getScriptProperties().getProperty('MAIL_SECRET');
    if (!expected) return reply_({ ok: false, error: 'MAIL_SECRET is not set in Script Properties' });
    if (!safeEqual_(String(body.secret || ''), expected)) return reply_({ ok: false, error: 'unauthorized' });

    var to = String(body.to || '').trim();
    var subject = String(body.subject || '');
    var html = String(body.html || '');
    var text = String(body.text || '');
    if (!to || !subject || !html || !text) return reply_({ ok: false, error: 'missing field: to, subject, html and text are required' });
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(to)) return reply_({ ok: false, error: 'invalid recipient address' });

    if (MailApp.getRemainingDailyQuota() < 1) return reply_({ ok: false, error: 'daily email quota used up' });

    MailApp.sendEmail({ to: to, subject: subject, body: text, htmlBody: html, name: 'SEB Exams' });
    return reply_({ ok: true });
  } catch (err) {
    return reply_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

// A GET (for example opening the URL in a browser) only says the service is alive; it sends nothing.
function doGet() {
  return reply_({ ok: true, service: 'seb-exams mail sender' });
}

// Compare without returning at the first difference (the length is not secret enough to matter here).
function safeEqual_(a, b) {
  var diff = a.length ^ b.length;
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
