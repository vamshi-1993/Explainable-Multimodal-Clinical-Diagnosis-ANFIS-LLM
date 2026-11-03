import axios from "axios";

const client = axios.create({ baseURL: "http://127.0.0.1:8000" });

export async function getOrgans() {
  const { data } = await client.get("/organs");
  return data.organs;
}

export async function analyseScan(file, organ) {
  const form = new FormData();
  form.append("file", file);
  form.append("organ", organ);
  const { data } = await client.post("/predict", form);
  return data;
}

export async function sendChat(sessionId, message) {
  const { data } = await client.post("/chat", { session_id: sessionId, message });
  return data.reply;
}