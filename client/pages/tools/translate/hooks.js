import { openDB } from "idb";
import { createEffect } from "solid-js";
import { reconcile, unwrap } from "solid-js/store";

/**
 * A hook to persist session data in IndexedDB.
 *
 * @param {string} params.dbPrefix Prefix used to construct the per-user IndexedDB name.
 * @param {import("solid-js/store").Store} params.store The Solid store holding session data.
 * @param {import("solid-js/store").SetStoreFunction} params.setStore Setter returned from createStore to update the session store.
 * @param {Object} params.defaultStore Baseline default values merged when loading a session.
 * @param {() => Object} [params.getSnapshot] Returns extra transient data to persist with the store.
 * @param {(snapshot: Object) => void} [params.restoreSnapshot] Rehydrates transient data from a loaded snapshot.
 * @param {(jobId: string) => void} [params.onRetryJob] Callback invoked for each interrupted job id to retry.
 * @returns {Object} - The session persistence API.
 */
export function useSessionPersistence({
  dbPrefix,
  store,
  setStore,
  defaultStore,
  getSnapshot,
  restoreSnapshot,
  onRetryJob,
  getUserEmail,
}) {
  let db = null;
  const pendingRetries = [];

  function setParam(key, value) {
    const url = new URL(window.location);
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    } else {
      url.searchParams.delete(key);
    }
    window.history.replaceState(null, "", url);
  }

  async function getDatabase(userEmail = "anonymous") {
    const userName = (userEmail || "anonymous")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/--+/g, "-")
      .replace(/^-|-$/g, "");
    const dbName = `${dbPrefix}-${userName}`;
    return await openDB(dbName, 1, {
      upgrade(db) {
        const s = db.createObjectStore("sessions", { keyPath: "id", autoIncrement: true });
        s.createIndex("createdAt", "createdAt");
      },
    });
  }

  async function createSession() {
    if (!db) {
      return null;
    }

    const snap = {
      ...unwrap(store),
      ...getSnapshot?.(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    delete snap.id;
    const id = await db.add("sessions", snap);
    return id;
  }

  async function saveSession() {
    if (!db) {
      return;
    }

    const snap = {
      ...unwrap(store),
      ...getSnapshot?.(),
      updatedAt: Date.now(),
    };
    await db.put("sessions", snap);
  }

  async function loadSession(id) {
    if (!db) {
      return;
    }

    const sess = await db.get("sessions", +id);
    if (!sess) {
      return;
    }

    setStore(reconcile({ ...defaultStore, ...sess }, { merge: true }));
    restoreSnapshot?.(sess);

    const interrupted = Object.entries(sess.generatedDocuments || {})
      .filter(([_id, job]) => job?.status === "processing")
      .map(([_id]) => _id);

    if (typeof onRetryJob === "function") {
      interrupted.forEach(onRetryJob);
    } else {
      pendingRetries.push(...interrupted);
    }
  }

  createEffect(async () => {
    const userEmail = typeof getUserEmail === "function" ? getUserEmail() : getUserEmail;
    if (!userEmail) {
      return;
    }

    db = await getDatabase(userEmail || "anonymous");

    const sessionId = new URLSearchParams(window.location.search).get("id");
    if (sessionId) {
      await loadSession(sessionId);
    }
  });

  return {
    setParam,
    createSession,
    saveSession,
    loadSession,
  };
}
