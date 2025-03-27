import puppeteer from "puppeteer";

// Browser state
let browser = null;
const sessions = new Map();

export async function getSession(sessionId) {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
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
