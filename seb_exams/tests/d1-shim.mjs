// Minimal D1 adapter over node:sqlite, for local tests only.
// Implements the subset the Worker uses: prepare/bind/run/first/all/batch.
import { DatabaseSync } from "node:sqlite";

class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.params = []; }
  bind(...params) { this.params = params; return this; }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { meta: { changes: Number(r.changes) } };
  }
  async first() {
    const row = this.db.prepare(this.sql).get(...this.params);
    return row === undefined ? null : row;
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.params) };
  }
}

export class D1Shim {
  constructor() { this.db = new DatabaseSync(":memory:"); }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; }
  exec(sql) { this.db.exec(sql); return Promise.resolve(); }
  // direct access for test assertions
  query(sql, ...params) { return this.db.prepare(sql).all(...params); }
}
