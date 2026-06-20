const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8080;

const httpServer = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    fs.createReadStream(path.join(__dirname, "index.html")).pipe(res);
  } else if(req.url === "/main.js") {
    res.writeHead(200, { "Content-Type": "text/javascript" });
    fs.createReadStream(path.join(__dirname, "main.js")).pipe(res);
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`Client connected: ${clientIp}`);

  ws.on("message", (data) => {
    let payload;
    try {
      payload = JSON.parse(data.toString());
    } catch { 
      return;
    }

    if(payload.data !== undefined){
      let d = payload.data;
      const type = Array.isArray(d) ? "array" : typeof d;
      console.log("data type:", type, "| constructor:", d?.constructor?.name);
    }
    console.log(`username : [${payload.username}] text : ${payload.text} data: ${payload.data} messageType: ${payload.messageType}`);

    // Broadcast to every other connected client
    for (const client of wss.clients) {
      if (client !== ws && client.readyState === ws.OPEN) {
        client.send(JSON.stringify(payload));
      }
    }
  });

  ws.on("close", () => console.log(`Client disconnected: ${clientIp}`));
  ws.on("error", (err) => console.error(`Error from ${clientIp}:`, err.message));
});

httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
