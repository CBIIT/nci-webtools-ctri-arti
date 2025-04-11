import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import { retry } from "./utils.js";

export async function query(sql, parameters = [],  env = process.env) {
  const client = new RDSDataClient();
  const params = {
    sql: sql,
    parameters: parameters,
    continueAfterTimeout: true,
    database: env.DATABASE,
    resourceArn: env.DATABASE_ARN,
    secretArn: env.DATABASE_SECRET_ARN,
    formatRecordsAs: "JSON",
  }

  const command = new ExecuteStatementCommand(params);
  const output = await retry(() => client.send(command), 10, 100);
  return JSON.parse(output.formattedRecords) || [];
}