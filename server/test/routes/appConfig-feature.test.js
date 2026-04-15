import "../../test-support/db.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import express from "express";
import { isToolEnabledFromDisabledValue } from "shared/app-config.js";
import request from "supertest";

import { createServerApi } from "../../api/index.js";

function enabledFeaturePath(toolName) {
  return "/config/enabledFeature/" + toolName;
}

async function stubToolEnabled() {
  return true;
}

async function stubToolDisabled() {
  return false;
}

function buildApp(overrides = {}) {
  const isToolEnabledImpl = overrides.isToolEnabled;
  const app = express();
  app.use((req, _res, next) => {
    req.session = {};
    next();
  });
  app.use(
    createServerApi({
      modules: {
        agents: {
          async *chat() {},
        },
        users: {
          async isToolEnabled(toolName) {
            if (typeof isToolEnabledImpl === "function") {
              return isToolEnabledImpl(toolName);
            }
            return isToolEnabledFromDisabledValue(toolName, "");
          },
        },
        cms: {
          async getAgents() {
            return [];
          },
        },
        gateway: {
          async invoke(input) {
            return { echoed: input };
          },
          async listModels() {
            return [{ name: "Model A", type: "chat" }];
          },
        },
      },
    })
  );
  return app;
}

describe("GET /config/enabledFeature/:toolName", () => {
  it("returns JSON true when the users module reports enabled", async () => {
    const app = buildApp({ isToolEnabled: stubToolEnabled });
    const res = await request(app).get(enabledFeaturePath("Chat"));
    assert.equal(res.status, 200);
    assert.equal(res.body, true);
  });

  it("returns JSON false when the users module reports disabled", async () => {
    const app = buildApp({ isToolEnabled: stubToolDisabled });
    const res = await request(app).get(enabledFeaturePath("Translator"));
    assert.equal(res.status, 200);
    assert.equal(res.body, false);
  });

  it("returns true without auth for a tool name outside the gated feature list", async () => {
    const app = buildApp();
    const res = await request(app).get(enabledFeaturePath("ReportBuilder"));
    assert.equal(res.status, 200);
    assert.equal(res.body, true);
  });
});
