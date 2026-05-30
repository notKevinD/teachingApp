const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT || 3001);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handle);
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    socket.on("room:join", (room) => {
      socket.join(room || "global");
    });

    socket.on("state:changed", (room) => {
      io.to(room || "global").emit("state:refresh");
    });

    socket.on("focus:update", (payload) => {
      io.to(payload?.room || "global").emit("focus:updated", payload);
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`Mandarin Class MVP ready on http://${hostname}:${port}`);
  });
});
