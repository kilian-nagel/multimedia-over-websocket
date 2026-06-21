const remoteVideoEl = document.querySelector("#remote-video");

class MediaCapture {
  static CODECS = [
    "video/webm;codecs=av1,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/mp4;codecs=avc1,mp4a.40.2",
  ];

  async start(videoEl, chat) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    videoEl.srcObject = stream;

    const mimeType = MediaCapture.CODECS.find(c => MediaRecorder.isTypeSupported(c)) ?? "";
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    recorder.ondataavailable = async (e) => {
      if (e.data.size === 0) return;
      const buf = await e.data.arrayBuffer();
      chat.send({ mimeType: recorder.mimeType, chunk: bytesToB64(new Uint8Array(buf)) });
    };
    recorder.start(1000);
  }
}

function bytesToB64(bytes) {
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join(""));
}

function b64ToBuffer(b64) {
  const str = atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes.buffer;
}

class RemoteVideoPlayer {
  #ms = null;
  #sourceBuffer = null;
  #queue = [];

  constructor(videoEl) {
    const ms = new MediaSource();
    videoEl.src = URL.createObjectURL(ms);
    ms.addEventListener("sourceopen", () => { this.#ms = ms; });
  }

  appendChunk(mimeType, b64) {
    if (!this.#sourceBuffer) {
      if (!this.#ms) return;
      this.#sourceBuffer = this.#ms.addSourceBuffer(mimeType);
      this.#sourceBuffer.addEventListener("updateend", () => this.#flush());
    }
    this.#queue.push(b64ToBuffer(b64));
    this.#flush();
  }

  #flush() {
    if (this.#sourceBuffer.updating || this.#queue.length === 0) return;
    this.#sourceBuffer.appendBuffer(this.#queue.shift());
  }
}

class ChatClient {
  #username = "User-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  #ws = null;

  #dot        = document.getElementById("status-dot");
  #statusText = document.getElementById("status-text");
  #messages   = document.getElementById("messages");
  #input      = document.getElementById("input");
  #sendBtn    = document.getElementById("send");

  constructor(url) {
    this.url = url;
    this.#sendBtn.addEventListener("click", () => this.send(undefined));
    this.#input.addEventListener("keydown", (e) => { if (e.key === "Enter") this.send(undefined); });
  }

  connect() {
    this.#ws = new WebSocket(this.url);

    this.#ws.addEventListener("open", () => {
      this.#dot.className = "connected";
      this.#statusText.textContent = "Connected";
      this.#input.disabled = false;
      this.#sendBtn.disabled = false;
      this.#appendNotice("You joined the chat");
    });

    this.#ws.addEventListener("close", () => {
      this.#dot.className = "disconnected";
      this.#statusText.textContent = "Disconnected — retrying…";
      this.#input.disabled = true;
      this.#sendBtn.disabled = true;
      this.#appendNotice("Connection lost. Reconnecting in 3 s…");
      setTimeout(() => this.connect(), 3000);
    });

    this.#ws.addEventListener("error", () => this.#ws.close());

    this.#ws.addEventListener("message", (e) => {
      let payload;
      try { payload = JSON.parse(e.data); } catch { return; }

      if (payload?.type === "video") {
        remotePlayer.appendChunk(payload.data.mimeType, payload.data.chunk);
      } else if (payload?.type === "message") {
        this.#appendMessage(payload.data.username, payload.data.text, false);
      }
    });
  }

  send(data) {
    const text = this.#input.value.trim();
    if ((!data && !text) || this.#ws.readyState !== WebSocket.OPEN) return;

    if (data) {
      this.#ws.send(JSON.stringify({ type: "video", data: data }));
    } else {
      this.#ws.send(JSON.stringify({ type: "message", data: { username: this.#username, text: text } }));
      this.#appendMessage(this.#username, text, true);
      this.#input.value = "";
    }
  }

  #appendMessage(user, text, mine) {
    const el = document.createElement("div");
    el.className = "msg " + (mine ? "mine" : "theirs");

    if (!mine) {
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = user;
      el.appendChild(meta);
    }

    const body = document.createElement("div");
    body.textContent = text;
    el.appendChild(body);

    this.#messages.appendChild(el);
    this.#messages.scrollTop = this.#messages.scrollHeight;
  }

  #appendNotice(text) {
    const el = document.createElement("div");
    el.className = "notice";
    el.textContent = text;
    this.#messages.appendChild(el);
    this.#messages.scrollTop = this.#messages.scrollHeight;
  }
}

const remotePlayer = new RemoteVideoPlayer(remoteVideoEl);
const chat = new ChatClient(`ws://${location.hostname}:8080`);
chat.connect();

const media = new MediaCapture();
media.start(document.querySelector("video"), chat).catch(err => console.log("getUserMedia rejected:", err));
