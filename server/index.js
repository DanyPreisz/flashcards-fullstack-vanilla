import { URL } from "node:url";
import { connect, isReady, users, cards, toId, mapCard } from "./db.js";
import { createApp, readJson, sendEmpty, sendJson, serveStatic } from "./http.js";
import { getUserFromRequest, hashPassword, signToken, verifyPassword } from "./middleware/auth.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
function usernameQuery(username) { return new RegExp("^" + username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"); }
function requireUser(req, res) { const user = getUserFromRequest(req); if (!user) { sendJson(res, 401, { error: "No autenticado" }); return null; } return user; }

const server = createApp(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname, searchParams } = url;
  const method = req.method || "GET";
  if (pathname === "/health") return sendJson(res, 200, { ok: true, db: isReady() });
  if (pathname.startsWith("/api/") && !isReady()) return sendJson(res, 503, { error: "Base no lista" });
  if (!pathname.startsWith("/api/")) return serveStatic(req, res);

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!USERNAME_RE.test(username)) return sendJson(res, 400, { error: "Usuario: 3-20 caracteres, letras, numeros y _" });
    if (password.length < 6) return sendJson(res, 400, { error: "La contrasena debe tener al menos 6 caracteres" });
    if (await users().findOne({ username: usernameQuery(username) })) return sendJson(res, 409, { error: "Ese usuario ya existe" });
    const result = await users().insertOne({ username, passwordHash: hashPassword(password), createdAt: new Date() });
    const user = { id: String(result.insertedId), username };
    return sendJson(res, 201, { user, token: signToken(user) });
  }
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const row = await users().findOne({ username: usernameQuery(username) });
    if (!row || !verifyPassword(String(body.password || ""), row.passwordHash)) return sendJson(res, 401, { error: "Usuario o contrasena incorrectos" });
    const user = { id: String(row._id), username: row.username };
    return sendJson(res, 200, { user, token: signToken(user) });
  }
  if (method === "GET" && pathname === "/api/auth/me") {
    const user = requireUser(req, res);
    if (!user) return;
    const row = await users().findOne({ _id: toId(user.id) });
    if (!row) return sendJson(res, 401, { error: "Usuario no encontrado" });
    return sendJson(res, 200, { user: { id: String(row._id), username: row.username } });
  }

  const user = requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  if (method === "GET" && pathname === "/api/cards") {
    const deck = String(searchParams.get("deck") || "").trim();
    const query = { userId };
    if (deck) query.deck = deck;
    const rows = await cards().find(query).sort({ deck: 1, front: 1 }).limit(200).toArray();
    const decks = await cards().distinct("deck", { userId });
    return sendJson(res, 200, { cards: rows.map(mapCard), decks });
  }
  if (method === "POST" && pathname === "/api/cards") {
    const body = await readJson(req);
    const front = String(body.front || "").trim();
    const back = String(body.back || "").trim();
    if (!front || !back) return sendJson(res, 400, { error: "Frente y dorso son obligatorios" });
    const result = await cards().insertOne({ userId, deck: String(body.deck || "General").trim().slice(0, 40) || "General", front: front.slice(0, 200), back: back.slice(0, 400), known: 0, createdAt: new Date() });
    return sendJson(res, 201, { card: mapCard(await cards().findOne({ _id: result.insertedId })) });
  }
  const known = pathname.match(/^\/api\/cards\/([a-fA-F0-9]{24})\/known$/);
  if (known && method === "POST") {
    const result = await cards().findOneAndUpdate({ _id: toId(known[1]), userId }, { $inc: { known: 1 } }, { returnDocument: "after" });
    if (!result) return sendJson(res, 404, { error: "Tarjeta no encontrada" });
    return sendJson(res, 200, { card: mapCard(result) });
  }
  const match = pathname.match(/^\/api\/cards\/([a-fA-F0-9]{24})$/);
  if (match && method === "DELETE") {
    const result = await cards().deleteOne({ _id: toId(match[1]), userId });
    if (!result.deletedCount) return sendJson(res, 404, { error: "Tarjeta no encontrada" });
    return sendEmpty(res, 204);
  }
  sendJson(res, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, HOST, () => console.log(`Flashcards en http://${HOST}:${PORT}`));
async function bootDb() { for (;;) { try { await connect(); return; } catch (err) { console.error("Mongo no disponible:", err.message); await new Promise((resolve) => setTimeout(resolve, 5000)); } } }
bootDb();
