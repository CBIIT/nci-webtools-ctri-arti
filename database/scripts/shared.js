export const pgConfig = {
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "postgres",
  username: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
};

export function printJson(label, value) {
  console.log(`${label}: ${JSON.stringify(value, null, 2)}`);
}
