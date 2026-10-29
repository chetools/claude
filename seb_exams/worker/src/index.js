// seb_exams Worker: teacher sign-in (/auth/*), teacher API (/api/*), student API (/s/*); every other path
// is the teacher app, bundled from ./public into the Worker (see static.js).
import { handleAuth } from "./auth.js";
import { handleApi } from "./teacher.js";
import { handleS } from "./student.js";
import { json } from "./util.js";
import { serveStatic } from "./static.js";

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (p.startsWith("/auth/")) return await handleAuth(req, env, ctx, url);
      if (p.startsWith("/api/")) return await handleApi(req, env, url);
      if (p.startsWith("/s/") || p === "/exam.seb") return await handleS(req, env, url);
    } catch (e) {
      console.error(e);
      return json({ error: "Server error." }, 500);
    }
    return serveStatic(req, url);
  },
};
