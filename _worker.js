export class ScoreboardDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Set();
    this._loaded = false;
    this.current = null;
  }

  async load() {
    if (this._loaded) return;
    const stored = await this.state.storage.get("state");
    this.current = stored ?? {
      home: { name: "LOCAL", logo: "", points: 0, sets: 0 },
      away: { name: "VISITANTE", logo: "", points: 0, sets: 0 },
      serving: "home",
      setNumber: 1,
      overlayPosition: "tl"
    };
    this._loaded = true;
  }

  async save() {
    await this.state.storage.put("state", this.current);
  }

  broadcast() {
    const msg = JSON.stringify({ type: "state", state: this.current });
    for (const ws of this.sockets) {
      try { ws.send(msg); } catch {}
    }
  }

  applyAction(type) {
    const s = this.current;
    const target = s.setNumber === 5 ? 15 : 25;

    function won(a,b){ return a >= target && (a-b)>=2 }

    switch(type){
      case "HOME_POINT":
        s.home.points++;
        if(won(s.home.points,s.away.points)){
          s.home.sets++; 
          if(s.home.sets<3){ s.setNumber++; s.home.points=0; s.away.points=0; }
        }
        break;
      case "AWAY_POINT":
        s.away.points++;
        if(won(s.away.points,s.home.points)){
          s.away.sets++; 
          if(s.away.sets<3){ s.setNumber++; s.home.points=0; s.away.points=0; }
        }
        break;
      case "RESET_MATCH":
        s.home.points=0; s.away.points=0;
        s.home.sets=0; s.away.sets=0;
        s.setNumber=1;
        break;
      case "SWAP_SIDES":
        const tmp=s.home; s.home=s.away; s.away=tmp;
        break;
    }
  }

  async fetch(request) {
    await this.load();
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.accept();
      this.sockets.add(server);

      server.addEventListener("message", (e)=>{
        const data = JSON.parse(e.data);
        if(data.type==="action"){ this.applyAction(data.action); this.save(); this.broadcast(); }
        if(data.type==="patch"){ Object.assign(this.current,data.patch); this.save(); this.broadcast(); }
      });

      server.send(JSON.stringify({type:"state",state:this.current}));
      return new Response(null,{status:101,webSocket:client});
    }

    return new Response("Not found",{status:404});
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const id = env.SCOREBOARD.idFromName("global");
    const stub = env.SCOREBOARD.get(id);

    if(url.pathname==="/ws") return stub.fetch(request);

    return env.ASSETS.fetch(request);
  }
};
