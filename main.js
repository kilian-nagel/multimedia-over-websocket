const remoteVideoEl = document.querySelector("#remote-video > source");

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
    console.log("Track settings:", stream.getVideoTracks()[0].getSettings());

    const mimeType = MediaCapture.CODECS.find(c => MediaRecorder.isTypeSupported(c)) ?? "";
    console.log("Supported codecs:", MediaCapture.CODECS.filter(c => MediaRecorder.isTypeSupported(c)));

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    recorder.ondataavailable = async (e) => {
      if (e.data.size === 0) return;
      const buf = await e.data.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const b64 = bytesToStr(bytes);
      chat.send({ messageType : 'video', data: b64});
      console.log(`[MediaRecorder] codec=${recorder.mimeType} chunk=${buf.byteLength} bytes`, buf);
    };
    recorder.start(1000);
    console.log(`[MediaRecorder] started — mimeType="${recorder.mimeType}"`);
  }
}

function bytesToStr(bytes){
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  console.log("binary : ", binary);
  const b64 = btoa(binary);
  return b64;
}

function strToBytes(data){
  let str = atob(data);
  let bytes = [];
  for(const [char,index] of str){
    console.log("converting char(i) : ", index)
    console.log(`char : ${char} -> ${str.charCodeAt(index)}`)
    bytes.push(str.charCodeAt(index))
  }
}

function getEncodedVideoString(type, base64data) {
   return 'data:video/' . type . ';base64,' . base64data;
}

function StreamRemoteVideo(base64data, remoteVideoEl){
  console.log("stramining : ", base64data);
  remoteVideoEl.src = base64data;
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
      
      console.log("received payload : ", payload);
      if(payload?.messageType && payload.messageType === 'video'){
        StreamRemoteVideo(getEncodedVideoString("webm", payload.data), remoteVideoEl);
      } else {
        this.#appendMessage(payload.username, payload.text, false);
      }
    });
  }

  send(data) {
    const text = this.#input.value.trim();
    if ((!data && !text) || this.#ws.readyState !== WebSocket.OPEN) return;

    if(data){
      console.log("sending video stream : ", data);
      // Video stream
      this.#ws.send(JSON.stringify({ messageType: "video", data: data }));
    } else {
      console.log("sending message : ", text);
      // Regular message
      this.#ws.send(JSON.stringify({ username: this.#username, text: text }));
    }
    this.#appendMessage(this.#username, text, true);
    this.#input.value = "";
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

const chat = new ChatClient(`ws://${location.hostname}:8080`);
chat.connect();

const media = new MediaCapture();
media.start(document.querySelector("video"), chat).catch(err => console.log("getUserMedia rejected:", err));

