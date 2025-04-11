import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

export async function query(sql, env = process.env) {
  const client = new RDSDataClient();
  const params = {
    sql: sql,
    database: env.DATABASE,
    resourceArn: env.DATABASE_ARN,
    secretArn: env.DATABASE_SECRET_ARN,
  }

  const command = new ExecuteStatementCommand(params);
  const output = await client.send(command);
  return output.records;
}