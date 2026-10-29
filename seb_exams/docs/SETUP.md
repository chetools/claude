# Setting up the login email sender

Teachers sign in with a link sent by email. The emails are sent from your own Gmail account by a small Google
Apps Script. You do this once.

## 1. Create the Apps Script project

1. Sign in to the Gmail account that should send the emails. Open <https://script.google.com>.
2. Click **New project**. Click the title ("Untitled project") and rename it to `SEB Exams mail`.
3. In the editor, open `Code.gs`, select all the text, delete it, and paste the contents of
   `seb_exams/apps-script/Code.gs`. Click the **Save** (disk) icon.

## 2. Set the shared secret

1. Make a random secret. On a Mac or Linux computer, open a terminal and run:

   ```
   openssl rand -base64 32
   ```

   (Alternative: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.)
   Copy the result and keep it; you need it again in step 4.
2. In Apps Script click the **Project Settings** (gear) icon on the left.
3. Under **Script Properties** click **Add script property**. Property: `MAIL_SECRET`. Value: the secret. Click
   **Save script properties**.

## 3. Deploy as a web app

1. Click **Deploy** (top right) > **New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Description: `v1`. **Execute as: Me**. **Who has access: Anyone**.
4. Click **Deploy**. Click **Authorize access**, pick your account, and (if Google warns the app is unverified)
   click **Advanced** > **Go to SEB Exams mail (unsafe)** > **Allow**. This is your own script; it asks to send email
   as you.
5. Copy the **Web app URL**. It ends in `/exec`. This is `MAIL_URL`.

If you change the code later: **Deploy** > **Manage deployments** > pencil icon > **Version: New version** >
**Deploy**. The URL stays the same. (**Test deployments** give a `/dev` URL that only works for you; do not use it.)

## 4. Give the secrets to the Worker

In a terminal, in the `seb_exams/worker` folder, run each command and paste the value when asked:

```
npx wrangler secret put MAIL_URL       # the /exec URL from step 3
npx wrangler secret put MAIL_SECRET    # the same secret as in step 2
npx wrangler secret put ADMIN_EMAIL    # the address of the first administrator (can be the same Gmail)
```

(You must be logged in to Cloudflare: `npx wrangler login`.) Secrets take effect immediately; no redeploy is needed
unless wrangler says so.

## 5. Test

Open the teacher app, enter the admin address, and press the sign-in button. The email should arrive within a
minute (check spam the first time). The Apps Script **Executions** page (left menu) lists each send and any error.
Opening the `/exec` URL in a browser should show `{"ok":true,"service":"seb-exams mail sender"}`; it sends nothing.

## Limits and facts

Verified from Google's documentation (<https://developers.google.com/apps-script/guides/services/quotas>, read
2026-10-29):

- Email recipients per day (for example with MailApp): **100** for consumer accounts (gmail.com), **1,500** for
  Google Workspace accounts. Each sign-in email is one recipient. The script refuses to send when
  `MailApp.getRemainingDailyQuota()` is 0, and the Worker then cannot send login links until the quota resets.
- "Execute as" options for a web app: "Execute the app as me" (script always runs as the owner) or "as user
  accessing the web app"
  (<https://developers.google.com/apps-script/guides/web>). This setup needs **Me**.
- `doPost(e)` runs on HTTP POST and `e.postData.contents` is the body text (same page). `/dev` URLs work only for
  users with edit access to the script (same page).

Not verified from the documentation (the pages did not state it):

- The exact list of "Who has access" choices (the setup uses **Anyone**, the choice shown in the deployment dialog).
- That POSTs to `/exec` answer with a redirect (a 302 to `script.googleusercontent.com`) that the caller must
  follow. This is commonly reported behaviour and the Worker spec says to follow redirects, but it was not confirmed
  here. If a redirected request is retried as GET, the response is the `doGet` status text, not a send result.
- The footnote of the quota table (marked with an asterisk) was not available.
