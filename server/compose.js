import { createAgentsApplication } from "agents/app.js";
import { createAgentsRemote } from "agents/remote.js";
import { createCmsRemote } from "cms/remote.js";
import { createCmsService } from "cms/service.js";
import { createGatewayRemote } from "gateway/remote.js";
import { createGatewayService } from "gateway/service.js";
import { createUsersApplication } from "users/app.js";
import { createUsersRemote } from "users/remote.js";

const { USERS_URL, GATEWAY_URL, CMS_URL, AGENTS_URL } = process.env;

let modulesPromise;

function shouldBootstrapLocalGuardrails() {
  if (process.env.DISABLE_GUARDRAIL_BOOTSTRAP === "1") return false;
  return !process.execArgv.includes("--test");
}

function createUsersModule() {
  return USERS_URL ? createUsersRemote({ baseUrl: USERS_URL }) : createUsersApplication();
}

async function createGatewayModule({ users }) {
  const gateway = GATEWAY_URL
    ? createGatewayRemote({ baseUrl: GATEWAY_URL })
    : createGatewayService({ users });

  if (!GATEWAY_URL && shouldBootstrapLocalGuardrails()) {
    try {
      await gateway.reconcileGuardrails();
    } catch (error) {
      console.error("Local gateway guardrail bootstrap failed:", error);
    }
  }

  return gateway;
}

function createCmsModule({ gateway }) {
  return CMS_URL
    ? createCmsRemote({ baseUrl: CMS_URL })
    : createCmsService({ gateway, source: "server" });
}

function createAgentsModule({ gateway, cms }) {
  return AGENTS_URL
    ? createAgentsRemote({ baseUrl: AGENTS_URL })
    : createAgentsApplication({ gateway, cms, source: "server" });
}

async function createServerModules() {
  const users = createUsersModule();
  const gateway = await createGatewayModule({ users });
  const cms = createCmsModule({ gateway });
  const agents = createAgentsModule({ gateway, cms });

  return { users, gateway, cms, agents };
}

export async function getServerModules() {
  if (!modulesPromise) {
    modulesPromise = createServerModules();
  }

  return modulesPromise;
}

export async function getUsersModule() {
  return (await getServerModules()).users;
}

export async function getGatewayModule() {
  return (await getServerModules()).gateway;
}

export async function getCmsModule() {
  return (await getServerModules()).cms;
}

export async function getAgentsModule() {
  return (await getServerModules()).agents;
}
