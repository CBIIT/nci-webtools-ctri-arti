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

    get(sid, cb) {
      db.execute(sql`SELECT sess FROM "session" WHERE sid = ${sid} AND expire >= NOW()`)
        .then((rows) => {
          const row = rows[0];
          cb(null, row ? (typeof row.sess === "string" ? JSON.parse(row.sess) : row.sess) : null);
        })
        .catch((err) => cb(err));
    }

    set(sid, sess, cb) {
      const expireMs = sess?.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + 86400000;
      const expire = new Date(expireMs);
      db.execute(
        sql`INSERT INTO "session" (sid, sess, expire) VALUES (${sid}, ${JSON.stringify(sess)}, ${expire})
            ON CONFLICT (sid) DO UPDATE SET sess = ${JSON.stringify(sess)}, expire = ${expire}`
      )
        .then(() => cb?.(null))
        .catch((err) => cb?.(err));
    }

    destroy(sid, cb) {
      db.execute(sql`DELETE FROM "session" WHERE sid = ${sid}`)
        .then(() => cb?.(null))
        .catch((err) => cb?.(err));
    }

    touch(sid, sess, cb) {
      const expireMs = sess?.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + 86400000;
      const expire = new Date(expireMs);
      db.execute(sql`UPDATE "session" SET expire = ${expire} WHERE sid = ${sid}`)
        .then(() => cb?.(null))
        .catch((err) => cb?.(err));
    }
  }

  return new DrizzleSessionStore();
}
