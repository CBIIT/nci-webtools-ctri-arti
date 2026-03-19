import db, { Session } from "database";

import { sql, eq, gte, lt, and } from "drizzle-orm";
import logger from "shared/logger.js";

const PRUNE_INTERVAL = 15 * 60 * 1000;
const DEFAULT_TTL_MS = 86400000; // 24 hours

function resolveExpire(sess) {
  const raw = sess?.cookie?.expires;
  const ms = raw ? new Date(raw).getTime() : NaN;
  return new Date(Number.isFinite(ms) ? ms : Date.now() + DEFAULT_TTL_MS);
}

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
        await db.delete(Session).where(lt(Session.expire, sql`NOW()`));
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
          .select({ sess: Session.sess })
          .from(Session)
          .where(and(eq(Session.sid, sid), gte(Session.expire, sql`NOW()`)))
          .then((rows) => {
            const row = rows[0];
            return row ? (typeof row.sess === "string" ? JSON.parse(row.sess) : row.sess) : null;
          }),
        cb
      );
    }

    set(sid, sess, cb) {
      const expire = resolveExpire(sess);
      this.#query(
        "set",
        { sid, expire: expire.toISOString() },
        db.insert(Session).values({ sid, sess, expire }).onConflictDoUpdate({
          target: Session.sid,
          set: { sess, expire },
        }),
        cb
      );
    }

    destroy(sid, cb) {
      this.#query("destroy", { sid }, db.delete(Session).where(eq(Session.sid, sid)), cb);
    }

    touch(sid, sess, cb) {
      const expire = resolveExpire(sess);
      this.#query(
        "touch",
        { sid, expire: expire.toISOString() },
        db.update(Session).set({ expire }).where(eq(Session.sid, sid)),
        cb
      );
    }
  }

  return new DrizzleSessionStore();
}
