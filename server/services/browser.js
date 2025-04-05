import puppeteer from "puppeteer";

// Browser state
let browser = null;

/**
 * @type {Map<string, { page: puppeteer.Page, lastActivity: number }>}
 */
const sessions = new Map();

/**
 * Retrieves or creates a Puppeteer session for a given session ID.
 * If the session ID does not exist, a new session is created.
 * The session is stored in a Map for later retrieval.
 * The browser instance is launched if it is not already running.
 * The session is updated with the current timestamp to track activity.
 * 
 * @param {string} sessionId 
 * @returns {Promise<{ page: puppeteer.Page, lastActivity: number }>} The session object containing the Puppeteer page and last activity timestamp.
 */
export async function getSession(sessionId) {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--no-zygote"],
      protocolTimeout: 240_000,
    });
    browser.on("disconnected", () => {
      console.log("Browser was disconnected");
      browser = null;
      sessions.clear();
    });
  }

  if (!sessions.has(sessionId)) {
    const page = await browser.newPage();
    sessions.set(sessionId, { page, lastActivity: Date.now() });
  }

  const session = sessions.get(sessionId);
  session.lastActivity = Date.now();
  return session;
}

// Reset browser and all sessions
export async function resetBrowser() {
  if (browser) {
    await browser.close();
  }
  browser = null;
  sessions.clear();
}

export function cleanupSessions() {
  for (const [id, session] of sessions.entries()) {
    session.page.close();
    sessions.delete(id);
  }
}
