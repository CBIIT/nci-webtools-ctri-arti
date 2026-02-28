import db from "database";

import { sql } from "drizzle-orm";
import logger from "shared/logger.js";

const PRUNE_INTERVAL = 15 * 60 * 1000;

export function createSessionStore(session) {
  const Store = session.Store;

  class DrizzleSessionStore extends Store {
    #pruneTimer;

    constructor() {
      super();
      this.#schedulePrune();
    }

    #schedulePrune() {
      this.#pruneTimer = setTimeout(() => this.#prune(), PRUNE_INTERVAL);
      this.#pruneTimer.unref();
    }

    async #prune() {
      try {
        await db.execute(sql`DELETE FROM "session" WHERE expire < NOW()`);
      } catch (err) {
        logger.error("Failed to prune sessions:", err);
      }
      this.#schedulePrune();
    }

    #query(op, context, promise, cb) {
      promise
        .then((result) => cb(null, result))
        .catch((err) => {
          logger.error(`Session store ${op} failed:`, {
            ...context,
            cause: err.message,
            stack: err.stack,
          });
          cb(err);
        });
    }

    get(sid, cb) {
      this.#query(
        "get",
        { sid },
        db
          .execute(sql`SELECT sess FROM "session" WHERE sid = ${sid} AND expire >= NOW()`)
          .then((rows) => {
            const row = rows[0];
            return row ? (typeof row.sess === "string" ? JSON.parse(row.sess) : row.sess) : null;
          }),
        cb
      );
    }

    set(sid, sess, cb) {
      const expireMs = sess?.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + 86400000;
      const expire = new Date(expireMs).toISOString();
      const sessJson = JSON.stringify(sess);
      this.#query(
        "set",
        { sid, expire },
        db.execute(
          sql`INSERT INTO "session" (sid, sess, expire) VALUES (${sid}, ${sessJson}::json, ${expire}::timestamp)
              ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`
        ),
        cb
      );
    }

    destroy(sid, cb) {
      this.#query(
        "destroy",
        { sid },
        db.execute(sql`DELETE FROM "session" WHERE sid = ${sid}`),
        cb
      );
    }

    touch(sid, sess, cb) {
      const expireMs = sess?.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + 86400000;
      const expire = new Date(expireMs).toISOString();
      this.#query(
        "touch",
        { sid, expire },
        db.execute(sql`UPDATE "session" SET expire = ${expire}::timestamp WHERE sid = ${sid}`),
        cb
      );
    }
  }

  return new DrizzleSessionStore();
}
