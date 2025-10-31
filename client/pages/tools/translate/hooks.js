import { createEffect, createResource } from "solid-js";

import { openDB } from "idb";
import { reconcile, unwrap } from "solid-js/store";

export function useSessionPersistence({
  dbPrefix,
  store,
  setStore,
  defaultStore,
  getSnapshot,
  restoreSnapshot,
  onRetryJob,
}) {
  let db = null;
  const pendingRetries = [];

  const [session] = createResource(() => fetch("/api/session").then((r) => r.json()));

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

    console.log(getSnapshot());

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
    const user = session()?.user;
    if (!user) {
      return;
    }

    db = await getDatabase(user.email || "anonymous");

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
