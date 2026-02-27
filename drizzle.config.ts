import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./database/schema.js",
  out: "./database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    host: process.env.PGHOST!,
    port: Number(process.env.PGPORT),
    database: process.env.PGDATABASE!,
    user: process.env.PGUSER!,
    password: process.env.PGPASSWORD!,
  },
});
