import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { RdsClusterStack, RdsClusterStackProps } from "../lib/stacks/rds-cluster-stack";
import config from "../config";

test("RDS instance created using Postgres", () => {
  const app = new App();
  const env = config.env;
  const stack = new RdsClusterStack(app, "RdsClusterStack", { env, ...config.rds });
});
