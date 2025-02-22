import express from "express";
import api from "./services/api.js";
const { PORT = 8080, CLIENT_FOLDER = "../client" } = process.env;
const app = express();

const setHeaders = (res) => res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
app.use(express.static(CLIENT_FOLDER, { setHeaders }));
app.use("/api", api);
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
