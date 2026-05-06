import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Rcon } from "rcon-client";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/config", (req, res) => {
    const host = process.env.SERVER_IP || "";
    const password = process.env.RCON_PASSWORD || "";
    let port = process.env.SERVER_PORT || "";
    
    // Default port if host and password are provided
    if (host && password && !port) {
      port = "27015";
    }

    res.json({ host, port, password });
  });

  // API Routes
  app.post("/api/rcon/test", async (req, res) => {
    let { host, port, password } = req.body;
    
    if (!host || !port || !password) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    // Sanitize host: remove http:// or https:// if provided
    host = host.replace(/^(http|https):\/\//, "").split("/")[0];

    try {
      const decodedPassword = Buffer.from(password, 'base64').toString('utf-8');
      const rcon = await Rcon.connect({
        host,
        port: parseInt(port),
        password: decodedPassword,
        timeout: 5000
      });
      await rcon.end();
      res.json({ success: true, message: "Connected successfully" });
    } catch (error: any) {
      console.error(`RCON Test Error: ${error.message}`);
      res.status(500).json({ success: false, error: error.message || "Connection failed" });
    }
  });

  app.post("/api/rcon/command", async (req, res) => {
    let { host, port, password, command } = req.body;

    if (!host || !port || !password || !command) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    // Sanitize host
    host = host.replace(/^(http|https):\/\//, "").split("/")[0];

    try {
      const decodedPassword = Buffer.from(password, 'base64').toString('utf-8');
      const rcon = await Rcon.connect({
        host,
        port: parseInt(port),
        password: decodedPassword,
        timeout: 10000
      });
      const response = await rcon.send(command);
      await rcon.end();
      res.json({ success: true, response });
    } catch (error: any) {
      console.error(`RCON Command Error: ${error.message}`);
      res.status(500).json({ success: false, error: error.message || "Command execution failed" });
    }
  });

  // Helper to parse CS2 status command output
  const parseCs2Status = (text: string) => {
    const lines = text.split("\n");
    const status: any = {
      hostname: "",
      map: "",
      players: 0,
      humans: 0,
      bots: 0,
      maxPlayers: 0,
      version: "",
      udp_ip: "",
      os_type: "",
      steamid: "",
      playerList: [] as any[]
    };

    let playerSectionStarted = false;

    lines.forEach(line => {
      const trimmed = line.trim();
      
      // Header Info
      if (trimmed.match(/^hostname\s*:/i)) status.hostname = trimmed.slice(trimmed.indexOf(":") + 1).trim();
      if (trimmed.match(/^version\s*:/i)) status.version = trimmed.slice(trimmed.indexOf(":") + 1).trim();
      if (trimmed.match(/^udp\/ip\s*:/i)) status.udp_ip = trimmed.slice(trimmed.indexOf(":") + 1).trim();
      if (trimmed.match(/^os\/type\s*:/i)) status.os_type = trimmed.slice(trimmed.indexOf(":") + 1).trim();
      if (trimmed.match(/^steamid\s*:/i)) status.steamid = trimmed.slice(trimmed.indexOf(":") + 1).trim();
      
    // Map detection - handles multiple possible formats
      const mapRegexSet = [
        /map\s*:\s*(?:<[^>]+>\s*)?["']?([^\s\n\r"']+)["']?/i,
        /Loaded map\s+(?:<[^>]+>\s*)?["']?([^\s\n\r"']+)["']?/i,
        /Active map\s*:\s*(?:<[^>]+>\s*)?["']?([^\s\n\r"']+)["']?/i,
        /world\s*:\s*["']?([^\s\n\r"']+)["']?/i,
        /Current Map\s*:\s*["']?([^\s\n\r"']+)["']?/i,
        /map\s+["']?([^\s\n\r"']+)["']?/i,
        /loaded spawngroup\(\s*1\)\s*:\s*SV:\s*\[\d+:\s*([^\s|\]]+)/i,
        /SV\s*:\s*\[1:\s*([^\s|\]]+)/i
      ];

      if (process.env.DEBUG === "true" && trimmed.toLowerCase().includes("map")) {
        console.log(`[DEBUG] Potential map line: "${trimmed}"`);
      }

      for (const regex of mapRegexSet) {
        const match = trimmed.match(regex);
        if (match && match[1]) {
          const mapPath = match[1].replace(/\.vpk$/, "").replace(/["']/g, "").trim();
          // Filter out obvious non-maps and prioritize spawngroup 1 or lines containing "main lump"
          const isHighConfidence = trimmed.includes("spawngroup(  1)") || trimmed.includes("main lump") || trimmed.startsWith("map :");
          
          if (mapPath && mapPath.length > 2 && !mapPath.includes("<") && !mapPath.includes(" ") && !mapPath.toLowerCase().includes("none")) {
            const extractedMap = mapPath.split("/").pop() || mapPath;
            
            // Only update if we don't have a map yet, OR if this is a high-confidence line
            if (!status.map || isHighConfidence) {
              status.map = extractedMap;
              if (process.env.DEBUG === "true") console.log(`[DEBUG] Map detected: ${status.map} from "${trimmed}" (HighConf: ${isHighConfidence})`);
              if (isHighConfidence) break; 
            }
          }
        }
      }

      // Fallback map detection for weird lines
      if (!status.map && trimmed.includes("Loaded map") && !trimmed.includes("ERROR")) {
         const parts = trimmed.split(" ");
         const mapIdx = parts.findIndex(p => p === "map") + 1;
         if (mapIdx > 0 && parts[mapIdx]) {
           status.map = parts[mapIdx].replace(/[,"']/g, "");
         }
      }

      // Players line: 0 humans, 2 bots (0 max) OR 1/32 players
      if (trimmed.match(/^players\s*:\s+/i)) {
        const val = trimmed.split(":")[1]?.trim() || "";
        const humanMatch = val.match(/(\d+)\s+humans/i);
        const botMatch = val.match(/(\d+)\s+bots/i);
        const maxMatch = val.match(/\((\d+)\s+max\)/i);
        
        status.humans = humanMatch ? parseInt(humanMatch[1]) : 0;
        status.bots = botMatch ? parseInt(botMatch[1]) : 0;
        
        // Alternative format detection: 1/32
        if (!status.humans && !status.bots) {
           const slashMatch = val.match(/(\d+)\s*\/\s*(\d+)/);
           if (slashMatch) {
             status.players = parseInt(slashMatch[1]);
             status.maxPlayers = parseInt(slashMatch[2]);
             status.humans = status.players;
           }
        } else {
          status.players = status.humans + status.bots;
          status.maxPlayers = maxMatch ? parseInt(maxMatch[1]) : 0;
        }
      }

      // Player list starts: handles "# userid name" or "---------players--------"
      if (trimmed.startsWith("# userid name") || trimmed.includes("---------players--------")) {
        playerSectionStarted = true;
        return;
      }

      // Skip the column header if we're in the list
      if (playerSectionStarted && (trimmed.startsWith("id ") || trimmed.startsWith("#userid"))) return;
      if (playerSectionStarted && trimmed.startsWith("#end")) {
        playerSectionStarted = false;
        return;
      }

      if (playerSectionStarted && trimmed.length > 5) {
        // Format A: # 2 "Player Name" STEAM_1:1...
        if (trimmed.startsWith("#") && !trimmed.startsWith("#end")) {
          const parts = trimmed.split(/\s+/).filter(Boolean);
          if (parts.length >= 8) {
            const userId = parts[1];
            const steamId = parts[parts.length - 6];
            const ping = parts[parts.length - 4];
            const name = parts.slice(2, parts.length - 6).join(" ").replace(/"/g, "");
            status.playerList.push({ userId, name, steamId, ping, isBot: steamId.includes("BOT") });
          }
        } 
        // Format B: 0 BOT 0 0 active 0 'Farlow'
        else if (!trimmed.startsWith("id ") && !trimmed.startsWith("#")) {
          const parts = trimmed.split(/\s+/).filter(Boolean);
          if (parts.length >= 5) {
            const userId = parts[0];
            const ping = parts[2];
            const steamId = parts[1]; // often "BOT" or "STEAM_..."
            
            // The name is usually the last part or starts from index 6/7
            let name = "";
            if (trimmed.includes("'")) {
              name = trimmed.split("'")[1] || "";
            } else if (trimmed.includes('"')) {
              name = trimmed.split('"')[1] || "";
            } else {
              name = parts[parts.length - 1];
            }

            status.playerList.push({ 
              userId, 
              name: name.trim(), 
              steamId, 
              ping,
              isBot: steamId === "BOT" || steamId.includes("BOT")
            });
          }
        }
      }
    });

    return status;
  };

  const parseCs2InstalledMaps = (text: string) => {
    const lines = text.split("\n");
    const maps: { id: string; name: string; type: 'default' | 'workshop' }[] = [];

    const normalizeMapToken = (token: string) => token.trim().replace(/\.(bsp|vpk)$/i, "");

    const isValidMapToken = (token: string) => {
      const cleaned = normalizeMapToken(token);
      if (!cleaned) return false;
      if (cleaned.includes('/')) return false;

      const lower = cleaned.toLowerCase();
      if (!/^[a-z0-9_\-]+$/i.test(cleaned)) return false;
      if (cleaned.length <= 3) return false;
      if (lower.includes('vanity')) return false;
      if (lower.match(/^(map|list|workshop|installed|error|usage|unknown|server|rcon|host|name|status|total)$/i)) return false;
      if (lower.startsWith('editor') || lower.startsWith('graphics') || lower.startsWith('lobby') || lower.startsWith('prefabs') || lower.startsWith('templates') || lower.startsWith('ui')) return false;
      return true;
    };

    const pushMap = (raw: string, friendly?: string) => {
      const cleaned = normalizeMapToken(raw);
      if (!isValidMapToken(cleaned)) return;
      const name = friendly?.trim() || cleaned;
      if (maps.some(m => m.id.toLowerCase() === cleaned.toLowerCase())) return;
      maps.push({ id: cleaned, name, type: 'default' });
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const listLine = trimmed.match(/^(?:\d+[\.\)]\s*)?(?:map\s+list|installed\s+maps)\s*[:\-]?\s*(.+)$/i);
      if (listLine && listLine[1]) {
        listLine[1].split(/\s+/).forEach(token => pushMap(token));
        continue;
      }

      const lower = trimmed.toLowerCase();
      if (lower.includes("workshop") ||
          lower.includes("rcon from") ||
          lower.includes("usage") ||
          lower.includes("error") ||
          lower.includes("unknown command") ||
          lower.includes("command not found") ||
          lower.includes("total") ||
          lower.includes("server") ||
          lower.startsWith("l ") ||
          lower.startsWith("host_") ||
          lower.startsWith("map ")) {
        continue;
      }

      const tokens = trimmed.split(/\s+/);
      if (tokens.length > 1 && tokens.every(token => isValidMapToken(token))) {
        tokens.forEach(token => pushMap(token));
        continue;
      }

      const match = trimmed.match(/^(?:\d+[\.\)]\s*)?([a-z0-9_\/\-\.]+)(?:\s*[-:]\s*(.+))?$/i);
      if (!match) continue;

      const rawName = match[1].replace(/\.(bsp|vpk)$/i, "").trim();
      const friendlyName = match[2] ? match[2].trim() : rawName;
      pushMap(rawName, friendlyName);
    }

    return maps;
  };

  const parseCs2WorkshopMaps = (text: string) => {
    const lines = text.split("\n");
    const maps: { name: string; id: string; type: 'workshop' | 'default' }[] = [];
    
    lines.forEach(line => {
      const trimmed = line.trim();
      // Skip empty lines, headers, or typical RCON noise
      if (!trimmed || 
          trimmed.toLowerCase().includes("workshop map list") || 
          trimmed.toLowerCase().includes("---") ||
          trimmed.startsWith("L ") ||
          trimmed.includes("RCON from")) return;

      // Pattern 1: [G:1:...] "name" (id)
      const matchA = trimmed.match(/"([^\"]+)"\s+\((\d+)\)/);
      if (matchA) {
        maps.push({ name: matchA[1], id: matchA[2], type: 'workshop' });
        return;
      }

      // Pattern 2: id "name" or id name
      const matchB = trimmed.match(/^(\d+)\s+"?([^"\s]+)"?$/);
      if (matchB) {
        maps.push({ name: matchB[2], id: matchB[1], type: 'workshop' });
        return;
      }

      // Pattern 3: name (id)
      const matchC = trimmed.match(/^"?([^"\s]+)"?\s+\((\d+)\)$/);
      if (matchC) {
        maps.push({ name: matchC[1], id: matchC[2], type: 'workshop' });
        return;
      }

      // Pattern 4: Simple name (the format in your screenshot)
      // We accept strings that look like map names (alphanumeric, underscores, hyphens)
      if (trimmed.match(/^[a-zA-Z0-9_\-]+$/)) {
        maps.push({ name: trimmed, id: trimmed, type: 'workshop' });
      }
    });

    return maps;
  };

  app.post("/api/rcon/installed-maps", async (req, res) => {
    let { host, port, password } = req.body;
    if (!host || !port || !password) return res.status(400).json({ error: "Missing parameters" });
    host = host.replace(/^(http|https):\/\//, "").split("/")[0];

    try {
      const decodedPassword = Buffer.from(password, 'base64').toString('utf-8');
      const rcon = await Rcon.connect({ host, port: parseInt(port), password: decodedPassword, timeout: 5000 });
      let response = await rcon.send("maps *");
      const fallbackResponse = await rcon.send("maps");
      await rcon.end();

      const shouldFallback = (text: string) => {
        const lower = String(text || '').toLowerCase();
        return !lower.trim() || /unknown command|command not found|invalid command|unsupported|not recognized/.test(lower);
      };

      if (shouldFallback(response) && fallbackResponse && fallbackResponse.trim()) {
        response = fallbackResponse;
      }

      const maps = parseCs2InstalledMaps(response);
      res.json({ success: true, maps, raw: response });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/rcon/workshop-maps", async (req, res) => {
    let { host, port, password } = req.body;
    if (!host || !port || !password) return res.status(400).json({ error: "Missing parameters" });
    host = host.replace(/^(http|https):\/\//, "").split("/")[0];

    try {
      const decodedPassword = Buffer.from(password, 'base64').toString('utf-8');
      const rcon = await Rcon.connect({ host, port: parseInt(port), password: decodedPassword, timeout: 5000 });
      const response = await rcon.send("ds_workshop_listmaps");
      await rcon.end();

      const maps = parseCs2WorkshopMaps(response);
      res.json({ success: true, maps, raw: response });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/rcon/status", async (req, res) => {
    let { host, port, password } = req.body;
    if (!host || !port || !password) return res.status(400).json({ error: "Missing parameters" });
    host = host.replace(/^(http|https):\/\//, "").split("/")[0];

    try {
      const decodedPassword = Buffer.from(password, 'base64').toString('utf-8');
      const rcon = await Rcon.connect({ host, port: parseInt(port), password: decodedPassword, timeout: 5000 });
      
      const [statusRaw, gameTypeRaw, gameModeRaw] = await Promise.all([
        rcon.send("status"),
        rcon.send("game_type"),
        rcon.send("game_mode")
      ]);
      
      const status = parseCs2Status(statusRaw);
      
      // Extensive map detection fallbacks
      if (!status.map) {
        try {
          const [hostMapRaw, mapFullNameRaw] = await Promise.all([
            rcon.send("host_map"),
            rcon.send("map_fullname")
          ]).catch(() => ["", ""]);

          const hostMapMatch = hostMapRaw.match(/\"host_map\"\s*=\s*\"([^\"]+)\"/i) || hostMapRaw.match(/host_map\s*[:=]\s*([^\s]+)/i);
          if (hostMapMatch) {
            const m = hostMapMatch[1].replace(/\.vpk$/, "").replace(/["']/g, "").trim();
            status.map = m.split("/").pop() || m;
          }
          
          if (!status.map && mapFullNameRaw && !mapFullNameRaw.includes("Unknown") && mapFullNameRaw.length < 50) {
            status.map = mapFullNameRaw.trim().split("/").pop() || mapFullNameRaw.trim();
          }
        } catch (e) {
          if (process.env.DEBUG === "true") console.error("Map fallback detection failed:", e);
        }
      }

      await rcon.end();

      // Extract game type and mode values
      const gameTypeMatch = gameTypeRaw.match(/\"game_type\"\s*=\s*\"(\d+)\"/i) || 
                            gameTypeRaw.match(/game_type\s*[:=]\s*(\d+)/i) ||
                            gameTypeRaw.match(/game_type\s+(\d+)/i);
      const gameModeMatch = gameModeRaw.match(/\"game_mode\"\s*=\s*\"(\d+)\"/i) || 
                            gameModeRaw.match(/game_mode\s*[:=]\s*(\d+)/i) ||
                            gameModeRaw.match(/game_mode\s+(\d+)/i);
      
      const gameType = gameTypeMatch ? gameTypeMatch[1] : "0";
      const gameMode = gameModeMatch ? gameModeMatch[1] : "0";

      res.json({ success: true, status: { ...status, gameType, gameMode, debug_raw_status: statusRaw } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/rcon/action", async (req, res) => {
    let { host, port, password, action, target, value } = req.body;
    if (!host || !port || !password || !action) return res.status(400).json({ error: "Missing parameters" });
    host = host.replace(/^(http|https):\/\//, "").split("/")[0];

    const decodedPassword = Buffer.from(password, 'base64').toString('utf-8');

    let command = "";
    switch (action) {
      case "kick": command = `kickid ${target || value} "Kicked by admin"`; break;
      case "ban": command = `banid ${value} ${target} "Banned by admin"`; break;
      case "map": command = `changelevel ${value || target}`; break;
      case "gamemode": 
        // value expected to be "type mode" e.g. "0 0" for Casual
        // target expected to be the map name
        
        let finalMode = value;
        let finalMap = target || "de_dust2";

        // Heuristic: If target looks like a mode (e.g. "0 0") and value looks like a map (starts with de_ or has no spaces)
        if (target && target.match(/^\d+\s+\d+$/) && (!value || value.startsWith("de_") || !value.includes(" "))) {
          finalMode = target;
          finalMap = value || "de_dust2";
        }

        const modeParts = finalMode.split(" ");
        const gType = modeParts[0] || "0";
        const gMode = modeParts[1] || "0";
        // Using 'map' instead of 'changelevel' is often better for mode changes in CS2
        command = `game_type ${gType}; game_mode ${gMode}; map ${finalMap}`;
        break;
      case "cvar": command = `${target || value} ${value && target ? value : ""}`; break; 
      case "say": command = `say "${value || target}"`; break;
      case "teamname": command = `${target === "ct" ? "mp_teamname_1" : "mp_teamname_2"} "${value}"`; break;
      default: return res.status(400).json({ error: "Invalid action" });
    }

    try {
      const rcon = await Rcon.connect({ host, port: parseInt(port), password: decodedPassword, timeout: 5000 });
      if (process.env.DEBUG === "true") console.log(`[DEBUG] RCON CMD: ${command}`);
      const response = await rcon.send(command);
      if (process.env.DEBUG === "true") console.log(`[DEBUG] RCON RESP: ${response}`);
      await rcon.end();
      res.json({ success: true, response });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/rcon/cvars", async (req, res) => {
    let { host, port, password, search } = req.body;
    if (!host || !port || !password) return res.status(400).json({ error: "Missing parameters" });
    host = host.replace(/^(http|https):\/\//, "").split("/")[0];

    try {
      const decodedPassword = Buffer.from(password, 'base64').toString('utf-8');
      const rcon = await Rcon.connect({ host, port: parseInt(port), password: decodedPassword, timeout: 10000 });
      // In CS2, 'cvarlist' followed by a search term is very reliable for parsing
      const raw = await rcon.send(search ? `cvarlist ${search}` : "cvarlist");
      await rcon.end();

      const lines = raw.split("\n");
      const cvars = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("---") || trimmed.includes("total convars")) return null;

        // 1. Try colon format: name : value : flags : description
        if (trimmed.includes(" : ")) {
          const parts = trimmed.split(" : ");
          if (parts.length >= 2) {
            return {
              name: parts[0].trim(),
              value: parts[1].trim(),
              flags: parts.length >= 3 ? parts[2].trim() : "",
              description: parts.length >= 4 ? parts.slice(3).join(" : ").trim() : ""
            };
          }
        }

        // 2. Try standard format: "name" = "value"
        const standardMatch = trimmed.match(/^"([^"]+)"\s+=\s+"([^"]*)"\s*(.*)$/);
        if (standardMatch) {
          const [_, name, value, rest] = standardMatch;
          const descMatch = rest.match(/-\s+(.*)$/);
          return {
            name,
            value,
            description: descMatch ? descMatch[1].trim() : rest.replace(/\(.*\)/, "").trim(),
            flags: rest.includes("(") ? rest.split("(")[0].trim() : ""
          };
        }

        return null;
      }).filter(Boolean);

      res.json({ success: true, cvars, raw });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
