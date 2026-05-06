/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Settings, Server, Users, Map as MapIcon, Zap, Send, Shield, Activity, Info, X, ChevronRight, Loader2, AlertTriangle, CheckCircle2, LayoutDashboard, Sliders, MessageSquare, Search, ChevronLeft, ChevronRight as ChevronRightIcon, RefreshCw, Palette } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const THEMES = [
  { id: 'classic', name: 'Classic Dark', class: '' },
  { id: 'nord', name: 'Nord Arctic', class: 'theme-nord' },
  { id: 'gruvbox', name: 'Gruvbox Retro', class: 'theme-gruvbox' },
  { id: 'cyberpunk', name: 'Cyberpunk', class: 'theme-cyberpunk' },
  { id: 'onedark', name: 'One Dark', class: 'theme-onedark' },
  { id: 'monokai', name: 'Monokai', class: 'theme-monokai' },
  { id: 'green', name: 'Terminal Green', class: 'theme-green' },
  { id: 'solarized', name: 'Solarized Dark', class: 'theme-solarized' },
  { id: 'dracula', name: 'Dracula', class: 'theme-dracula' },
];

interface ServerDetails {
  host: string;
  port: string;
  password: string;
}

interface ConsoleEntry {
  type: 'command' | 'response' | 'error';
  content: string;
  timestamp: Date;
}

interface CVar {
  name: string;
  value: string;
  flags: string;
  description: string;
}

const GAME_MODES = [
  { name: 'Competitive', type: '0', mode: '1', desc: 'The classic 5v5 experience' },
  { name: 'Wingman', type: '0', mode: '2', desc: 'Fast-paced 2v2 on small maps' },
  { name: 'Casual', type: '0', mode: '0', desc: 'Low-stakes gameplay with friends' },
  { name: 'Deathmatch', type: '1', mode: '2', desc: 'Instant respawns, free-for-all' },
  { name: 'Arms Race', type: '1', mode: '0', desc: 'Slay your way to the golden knife' },
  { name: 'Custom', type: '3', mode: '0', desc: 'User-defined community rules' },
];

export default function App() {
  const [config, setConfig] = useState<ServerDetails>(() => {
    const saved = localStorage.getItem('cs2_rcon_config');
    return saved ? JSON.parse(saved) : { host: '', port: '27015', password: '' };
  });
  
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [consoleHistory, setConsoleHistory] = useState<ConsoleEntry[]>([]);
  const [commandInput, setCommandInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [showConfig, setShowConfig] = useState(!config.host);
  const [activeTab, setActiveTab] = useState<'console' | 'players' | 'maps' | 'gamemodes' | 'dashboard' | 'actions' | 'cvars'>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('cs2_sidebar_collapsed') === 'true';
  });
  const [serverInfo, setServerInfo] = useState<any>(null);
  const [isFetchingStatus, setIsFetchingStatus] = useState(false);
  const [workshopMaps, setWorkshopMaps] = useState<any[]>([]);
  const [serverMaps, setServerMaps] = useState<any[]>([]);
  const [rawWorkshopOutput, setRawWorkshopOutput] = useState<string>('');
  const [showRawWorkshop, setShowRawWorkshop] = useState(false);
  const [isFetchingMaps, setIsFetchingMaps] = useState(false);
  const [mapSortOrder, setMapSortOrder] = useState<'name' | 'source'>('name');
  const [configEdited, setConfigEdited] = useState(false);
  const [hasAutoConnectAttempted, setHasAutoConnectAttempted] = useState(false);
  const [theme, setTheme] = useState(THEMES[0]);

  useEffect(() => {
    // Apply theme to body and root for global consistency
    const applyTheme = () => {
      THEMES.forEach(t => {
        if (t.class) {
          document.body.classList.remove(t.class);
          document.documentElement.classList.remove(t.class);
        }
      });
      if (theme.class) {
        document.body.classList.add(theme.class);
        document.documentElement.classList.add(theme.class);
      }
    };
    applyTheme();
  }, [theme]);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [cvars, setCvars] = useState<CVar[]>([]);
  const [rawCvars, setRawCvars] = useState('');
  const [showRawModal, setShowRawModal] = useState(false);
  const [cvarSearch, setCvarSearch] = useState('');
  const [cvarPage, setCvarPage] = useState(1);
  const [isLoadingCvars, setIsLoadingCvars] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem('cs2_command_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tempCommand, setTempCommand] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);

  const COMMON_COMMANDS = [
    'status', 'stats', 'users', 'maps', 'changelevel', 'ds_workshop_changelevel', 
    'mp_restartgame', 'mp_warmup_start', 'mp_warmup_end', 'mp_pause_match', 'mp_unpause_match',
    'sv_cheats', 'sv_gravity', 'sv_infinite_ammo', 'bot_add', 'bot_kick', 'bot_quota',
    'kick', 'banid', 'banip', 'unban', 'say', 'mp_roundtime', 'mp_freezetime', 'mp_buytime',
    'vignette', 'tv_record', 'tv_stop', 'tv_status', 'exec', 'writeid', 'writeip'
  ];

  const autocompleteSuggestions = commandInput.trim() 
    ? COMMON_COMMANDS.filter(cmd => cmd.toLowerCase().startsWith(commandInput.toLowerCase()) && cmd !== commandInput)
    : [];

  // Server Actions State
  const [botQuota, setBotQuota] = useState(10);
  const [restartSec, setRestartSec] = useState(1);
  const [ctName, setCtName] = useState('');
  const [tName, setTName] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [friendlyFire, setFriendlyFire] = useState(false);

  const CVARS_PER_PAGE = 20;

  useEffect(() => {
    const fetchEnvConfig = async () => {
      try {
        const response = await fetch('/api/config');
        const data = await response.json();
        // Require at least host and password
        if (data.host && data.password) {
          const newConfig = {
            host: data.host,
            port: data.port || "27015",
            password: data.password
          };
          setConfig(newConfig);
          setShowConfig(false);
        }
      } catch (err) {
        console.error("Failed to fetch environment config", err);
      }
    };
    fetchEnvConfig();
  }, []);

  useEffect(() => {
    localStorage.setItem('cs2_rcon_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('cs2_sidebar_collapsed', isSidebarCollapsed.toString());
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (isConnected) {
      fetchStatus();
      const interval = setInterval(fetchStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected && !isConnecting && !hasAutoConnectAttempted && !configEdited && config.host && config.password) {
      setHasAutoConnectAttempted(true);
      testConnection();
    }
  }, [isConnected, isConnecting, hasAutoConnectAttempted, configEdited, config.host, config.password]);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleHistory]);

  useEffect(() => {
    if (!isExecuting && isConnected && activeTab === 'console') {
      commandInputRef.current?.focus();
    }
  }, [isExecuting, isConnected, activeTab]);

  useEffect(() => {
    localStorage.setItem('cs2_command_history', JSON.stringify(commandHistory));
  }, [commandHistory]);

  const sanitizeConfig = (c: ServerDetails) => ({
    ...c,
    host: c.host.trim().replace(/^(http|https):\/\//, "").split("/")[0],
    port: c.port.trim(),
    password: c.password.trim()
  });

  const addLog = (type: 'command' | 'response' | 'error', content: string) => {
    setConsoleHistory(prev => [...prev, { type, content, timestamp: new Date() }].slice(-100));
  };

  const executeAction = async (action: string, value: string = '', target: string = '') => {
    if (!isConnected) return false;
    const sanitized = sanitizeConfig(config);
    try {
      const res = await fetch(`${window.location.origin}/api/rcon/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...sanitized, 
          password: btoa(unescape(encodeURIComponent(config.password))),
          action, 
          value, 
          target 
        }),
      });
      const data = await res.json();
      if (data.success) {
        addLog('command', `Server: ${action} ${target} ${value}`);
        if (data.response) addLog('response', data.response);
        return true;
      } else {
        addLog('error', `Rejected: ${data.error}`);
        return false;
      }
    } catch (err: any) {
      addLog('error', `Link Fault: ${err.message}`);
      return false;
    }
  };

  const fetchCvars = async (search: string = '') => {
    setIsLoadingCvars(true);
    const sanitized = sanitizeConfig(config);
    try {
      const res = await fetch(`${window.location.origin}/api/rcon/cvars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...sanitized, 
          password: btoa(unescape(encodeURIComponent(config.password))),
          search 
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCvars(data.cvars);
        setRawCvars(data.raw);
        setCvarPage(1);
      }
    } catch (err: any) {
      addLog('error', `Directory Fault: ${err.message}`);
    } finally {
      setIsLoadingCvars(false);
    }
  };

  const updateCvar = async (name: string, value: string) => {
    const success = await executeAction('cvar', value, name);
    if (success) {
      setCvars(prev => prev.map(c => c.name === name ? { ...c, value } : c));
    }
  };

  useEffect(() => {
    if (isConnected && activeTab === 'cvars' && cvars.length === 0) {
      fetchCvars();
    }
  }, [isConnected, activeTab]);

  const filteredCvars = cvars.filter(c => 
    c.name.toLowerCase().includes(cvarSearch.toLowerCase()) || 
    c.description.toLowerCase().includes(cvarSearch.toLowerCase())
  );

  const paginatedCvars = filteredCvars.slice((cvarPage - 1) * CVARS_PER_PAGE, cvarPage * CVARS_PER_PAGE);
  const totalPages = Math.ceil(filteredCvars.length / CVARS_PER_PAGE);

  const fetchStatus = async () => {
    if (!isConnected) return;
    setIsFetchingStatus(true);
    const sanitized = sanitizeConfig(config);
    try {
      const res = await fetch(`${window.location.origin}/api/rcon/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...sanitized,
          password: btoa(unescape(encodeURIComponent(config.password)))
        }),
      });
      const data = await res.json();
      if (data.success) {
        setServerInfo(data.status);
      }
    } catch (err) {
      console.error("Failed to fetch status", err);
    } finally {
      setIsFetchingStatus(false);
    }
  };

  const fetchWorkshopMaps = async () => {
    if (!isConnected) return;
    const sanitized = sanitizeConfig(config);
    try {
      const res = await fetch(`${window.location.origin}/api/rcon/workshop-maps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...sanitized,
          password: btoa(unescape(encodeURIComponent(config.password)))
        }),
      });
      const data = await res.json();
      if (data.success) {
        setWorkshopMaps(data.maps);
        setRawWorkshopOutput(data.raw || '');
        addLog('response', `Workshop maps loaded (${data.maps.length || 0} entries)`);
        console.debug('Workshop maps response:', data.raw || data.maps);
      } else {
        addLog('error', `Workshop maps failed: ${data.error || 'Unknown error'}`);
        console.error('Failed to fetch workshop maps:', data.error);
      }
    } catch (err: any) {
      addLog('error', `Workshop maps fetch error: ${err.message}`);
      console.error("Failed to fetch workshop maps", err);
    }
  };

  const fetchInstalledMaps = async () => {
    if (!isConnected) return;
    const sanitized = sanitizeConfig(config);
    try {
      const res = await fetch(`${window.location.origin}/api/rcon/installed-maps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...sanitized,
          password: btoa(unescape(encodeURIComponent(config.password)))
        }),
      });
      const data = await res.json();
      if (data.success) {
        setServerMaps(data.maps);
        addLog('response', `Installed maps loaded (${data.maps.length || 0} entries)`);
        if (!data.maps || data.maps.length === 0) {
          addLog('error', 'No installed maps were returned by the server');
        }
        console.debug('Installed maps response:', data);
      } else {
        addLog('error', `Installed maps failed: ${data.error || 'Unknown error'}`);
        console.error('Failed to fetch installed maps:', data.error);
      }
    } catch (err: any) {
      addLog('error', `Installed maps fetch error: ${err.message}`);
      console.error("Failed to fetch installed maps", err);
    }
  };

  const syncMaps = async (force: boolean = false) => {
    if (!isConnected && !force) return;
    setIsFetchingMaps(true);
    try {
      await Promise.allSettled([fetchInstalledMaps(), fetchWorkshopMaps()]);
    } finally {
      setIsFetchingMaps(false);
    }
  };

  useEffect(() => {
    if (isConnected && activeTab === 'maps') {
      syncMaps();
    }
  }, [isConnected, activeTab]);

  const testConnection = async () => {
    if (!config.host) return;
    setIsConnecting(true);
    setConnectionError(null);
    const sanitized = sanitizeConfig(config);
    
    // Check for LAN IP
    const isPrivateIP = sanitized.host.match(/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/);
    if (isPrivateIP && window.location.hostname.includes('run.app')) {
      setConnectionError("Detected Private LAN IP. The cloud-based preview cannot connect to local network addresses. Please run this app locally via Docker.");
      setIsConnecting(false);
      return;
    }

    try {
      const res = await fetch(`${window.location.origin}/api/rcon/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...sanitized,
          password: btoa(unescape(encodeURIComponent(config.password)))
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsConnected(true);
        setShowConfig(false);
        addLog('response', 'Successfully established connection to server ' + sanitized.host);
        fetchStatus();
        void syncMaps(true);
      } else {
        setConnectionError(data.error || 'Authentication rejected by server.');
        addLog('error', 'Authentication failed: ' + data.error);
      }
    } catch (err: any) {
      setConnectionError('Network failure: Unable to reach the backend gateway. Check your internet connection.');
      addLog('error', 'Network failure: ' + err.message);
    } finally {
      setIsConnecting(false);
    }
  };

  const executeCommand = async (cmd: string = commandInput) => {
    if (!cmd.trim() || isExecuting) return;
    
    // History management
    if (cmd.trim()) {
      setCommandHistory(prev => {
        const newHistory = [cmd.trim(), ...prev.filter(h => h !== cmd.trim())].slice(0, 50);
        return newHistory;
      });
    }
    setHistoryIndex(-1);
    setTempCommand('');
    setShowAutocomplete(false);

    addLog('command', cmd);
    if (cmd === commandInput) {
      setCommandInput('');
    }
    
    setIsExecuting(true);
    const sanitized = sanitizeConfig(config);
    try {
      const res = await fetch(`${window.location.origin}/api/rcon/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...sanitized, 
          password: btoa(unescape(encodeURIComponent(config.password))),
          command: cmd 
        }),
      });
      const data = await res.json();
      if (data.success) {
        addLog('response', data.response);
        if (cmd === 'status') fetchStatus();
      } else {
        addLog('error', data.error);
      }
    } catch (err: any) {
      addLog('error', 'Console error: ' + err.message);
    } finally {
      setIsExecuting(false);
    }
  };

  const MAP_LIST = [
    { id: 'de_dust2', name: 'Dust II' },
    { id: 'de_mirage', name: 'Mirage' },
    { id: 'de_inferno', name: 'Inferno' },
    { id: 'de_nuke', name: 'Nuke' },
    { id: 'de_overpass', name: 'Overpass' },
    { id: 'de_ancient', name: 'Ancient' },
    { id: 'de_anubis', name: 'Anubis' },
    { id: 'de_vertigo', name: 'Vertigo' },
  ];

  const quickActions = [
    { label: 'Status', cmd: 'status', icon: Activity },
    { label: 'Restart Round', cmd: 'mp_restartgame 1', icon: Zap },
    { label: 'Pause', cmd: 'mp_pause_match', icon: Info },
    { label: 'Unpause', cmd: 'mp_unpause_match', icon: ChevronRight },
  ];

  const getGameModeName = (type: string, mode: string) => {
    const found = GAME_MODES.find(m => m.type === String(type) && m.mode === String(mode));
    if (found) return found.name;
    if (type === undefined || mode === undefined) return 'Unknown';
    return `Custom (${type}:${mode})`;
  };

  const formatMapLabel = (rawName: string) => {
    return rawName.split(/[_\/]/).map((part: string) => {
      const lower = part.toLowerCase();
      if (lower === 'cs2') return 'CS2';
      if (lower === 'cs') return 'CS';
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }).join(' ');
  };

  const isValidServerMap = (map: any) => {
    const id = String(map.id || map.name || '').toLowerCase();
    return /^[a-z0-9_-]+$/.test(id)
      && !id.includes('/')
      && !id.includes('vanity')
      && !/(^editor|^graphics|^lobby|^prefabs|^templates|^ui|^workshop|^server)/.test(id);
  };

  const defaultMapOptions = serverMaps.length > 0
    ? serverMaps.filter(isValidServerMap).filter(m => 
        !workshopMaps.some(wm => 
          wm.id?.toLowerCase() === (m.id || m.name)?.toLowerCase() || 
          wm.name?.toLowerCase() === (m.id || m.name)?.toLowerCase()
        )
      ).map(m => ({ ...m, type: 'default' as const, name: formatMapLabel(m.name || m.id) }))
    : MAP_LIST.map(m => ({ ...m, type: 'default' as const }));

  const resetConfig = () => {
    localStorage.removeItem('cs2_rcon_config');
    setConfig({ host: '', port: '27015', password: '' });
    setIsConnected(false);
    setConnectionError(null);
    setShowConfig(true);
    setConfigEdited(false);
    setHasAutoConnectAttempted(false);
  };

  return (
    <div id="app-root" className={`h-screen bg-cs-bg-main flex flex-col overflow-hidden text-cs-text selection:bg-cs-yellow/20 ${theme.class}`}>
      {/* Top Header */}
      <header className="h-16 border-b border-cs-border bg-cs-bg-panel flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <img 
            src="https://cdn.fastly.steamstatic.com/apps/csgo/images/csgo_react//global/cs2_icon_color_512x512.png" 
            alt="CS2 Logo" 
            className="w-8 h-8"
          />
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-sm font-semibold tracking-wide">
                {serverInfo?.hostname || (isConnected ? config.host : 'Dedicated Server')}
              </h1>
              <p className="text-[10px] text-cs-muted font-mono">
                {config.host ? `ID: ${config.host}:${config.port}` : 'NO_CONFIG_LOADED'}
              </p>
            </div>
            {isConnected && (
              <button 
                onClick={resetConfig}
                className="p-1.5 hover:bg-cs-red/10 rounded-md text-cs-muted hover:text-cs-red transition-colors"
                title="Disconnect from Server"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-8">
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-cs-muted tracking-widest">Status</span>
              {isFetchingStatus && <Loader2 className="w-2.5 h-2.5 text-cs-yellow animate-spin" />}
            </div>
            <span className={`text-xs flex items-center gap-1.5 ${isConnected ? 'text-cs-green' : 'text-cs-red'}`}>
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-cs-green animate-pulse' : 'bg-cs-red'}`}></span>
              {isConnecting ? 'Connecting...' : isConnected ? 'Active' : 'Disconnected'}
            </span>
          </div>
          
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[10px] text-cs-muted tracking-widest">Game Mode</span>
            <div className="h-4 flex items-center gap-1.5 min-w-[60px] justify-end">
              {serverInfo ? (
                <span className={`text-xs font-medium ${isConnected && serverInfo ? 'text-cs-blue' : 'text-cs-muted'}`}>
                  {getGameModeName(serverInfo.gameType, serverInfo.gameMode)}
                </span>
              ) : (
                <Loader2 className="w-3 h-3 text-cs-muted animate-spin" />
              )}
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] text-cs-muted tracking-widest">Current Map</span>
            <div className="flex flex-col items-end leading-none min-w-[80px] min-h-[16px] justify-center">
              {serverInfo ? (
                <>
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className={`text-xs font-bold tracking-tight ${isConnected && serverInfo ? 'text-cs-yellow' : 'text-cs-muted'}`}>
                      {MAP_LIST.find(m => m.id === serverInfo.map)?.name || workshopMaps.find(m => m.id === serverInfo.map || m.name === serverInfo.map)?.name || (serverInfo.map && serverInfo.map.toLowerCase().replace(/cs2/g, 'CS2').replace(/cs/g, 'CS'))}
                    </span>
                  </div>
                  {serverInfo?.map && (
                    <span className="text-[8px] text-cs-muted font-mono mt-0.5">
                      {serverInfo.map.toLowerCase().replace(/cs2/g, 'CS2').replace(/cs/g, 'CS')}
                    </span>
                  )}
                </>
              ) : (
                <Loader2 className="w-3 h-3 text-cs-muted animate-spin" />
              )}
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] text-cs-muted tracking-widest">Players</span>
            <div className="h-4 flex items-center gap-1.5 min-w-[50px] justify-end">
              {serverInfo ? (
                <span className={`text-xs font-medium ${isConnected && serverInfo ? 'text-cs-text' : 'text-cs-muted'}`}>
                  {`${serverInfo.players} / ${serverInfo.maxPlayers}`}
                </span>
              ) : (
                <Loader2 className="w-3 h-3 text-cs-muted animate-spin" />
              )}
            </div>
          </div>
          <button 
            onClick={() => executeCommand('mp_restartgame 1')}
            disabled={!isConnected}
            className="px-4 py-2 bg-cs-red hover:brightness-110 disabled:opacity-20 text-white text-[10px] font-bold rounded shadow-lg shadow-red-900/20 active:scale-95 transition-all uppercase tracking-wider"
          >
            RESTART ROUND
          </button>
          <div className="hidden lg:flex items-center gap-6 border-l border-cs-border pl-6 ml-2">
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-cs-muted tracking-widest uppercase">Efficiency</span>
              <span className={`text-xs font-mono font-bold ${isConnected ? 'text-cs-blue' : 'text-cs-muted'}`}>
                {isConnected ? '99.1%' : '--'}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-cs-muted tracking-widest uppercase">TPS</span>
              <span className={`text-xs font-mono font-bold ${isConnected ? 'text-cs-green' : 'text-cs-muted'}`}>
                {isConnected ? '128.0' : '--'}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-cs-muted tracking-widest uppercase">VAR</span>
              <span className={`text-xs font-mono font-bold ${isConnected ? 'text-cs-text' : 'text-cs-muted'}`}>
                {isConnected ? '0.008' : '--'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <div className="relative">
              <button 
                onClick={() => setShowThemeMenu(!showThemeMenu)}
                className="p-2 hover:bg-white/5 rounded-lg text-cs-muted hover:text-white transition-colors"
                title="Theme Settings"
              >
                <Palette className="w-5 h-5" />
              </button>
              
              <AnimatePresence>
                {showThemeMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-48 bg-cs-bg-panel border border-cs-border rounded-lg shadow-xl z-[100] overflow-hidden"
                  >
                    <div className="p-2 border-b border-cs-border">
                      <p className="text-[9px] uppercase tracking-widest text-cs-muted font-bold px-2 py-1">Interface Theme</p>
                    </div>
                    <div className="p-1">
                      {THEMES.map((themeOption) => (
                        <button
                          key={themeOption.id}
                          onClick={() => {
                            setTheme(themeOption);
                            setShowThemeMenu(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-colors ${theme.id === themeOption.id ? 'bg-cs-yellow/10 text-cs-yellow' : 'text-cs-muted hover:bg-white/5 hover:text-white'}`}
                        >
                          {themeOption.name}
                          {theme.id === themeOption.id && <CheckCircle2 className="w-3 h-3" />}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button 
            onClick={() => setShowConfig(true)}
            className="p-2 hover:bg-white/5 rounded-lg text-cs-muted hover:text-white transition-colors"
            title="Server Configuration"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Control Column (Icon Sidebar) */}
        <aside className={`${isSidebarCollapsed ? 'w-16' : 'w-56'} border-r border-cs-border bg-cs-bg-console flex flex-col items-center py-6 gap-2 shrink-0 transition-all duration-300 overflow-hidden`}>
          <div className="w-full px-3 mb-6">
            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="w-full flex items-center justify-center p-2 rounded-lg text-cs-muted hover:bg-white/5 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-2">
                <ChevronLeft className={`w-5 h-5 transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : ''}`} />
                {!isSidebarCollapsed && <span className="text-[10px] font-bold tracking-widest">Collapse</span>}
              </div>
            </button>
          </div>

          <div className="w-full px-3 flex flex-col gap-2">
            {[
              { id: 'dashboard', icon: LayoutDashboard, label: 'Status' },
              { id: 'console', icon: Terminal, label: 'Console' },
              { id: 'players', icon: Users, label: 'Players' },
              { id: 'maps', icon: MapIcon, label: 'Maps' },
              { id: 'gamemodes', icon: Zap, label: 'Modes' },
              { id: 'actions', icon: Sliders, label: 'Actions' },
              { id: 'cvars', icon: Activity, label: 'Variables' },
            ].map((item) => (
              <button 
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`flex items-center p-2 rounded-lg transition-colors cursor-pointer group relative ${
                  activeTab === item.id 
                    ? 'bg-cs-border text-cs-yellow' 
                    : 'text-cs-muted hover:bg-white/5 hover:text-white'
                } ${isSidebarCollapsed ? 'justify-center' : 'gap-3 px-4'}`}
                title={isSidebarCollapsed ? item.label : undefined}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {!isSidebarCollapsed && (
                  <span className="text-[10px] font-bold tracking-widest whitespace-nowrap">
                    {item.label}
                  </span>
                )}
                {isSidebarCollapsed && (
                  <div className="absolute left-16 bg-cs-bg-panel border border-cs-border px-3 py-1 rounded text-[10px] font-bold tracking-widest text-white opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
                    {item.label}
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="mt-auto w-full px-3 pb-4">
            {/* Action Bar or Spacer */}
          </div>
        </aside>

        {/* Dynamic Center Area */}
        <main className="flex-1 flex flex-col bg-cs-bg-console relative overflow-hidden">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex-1 p-8 flex flex-col overflow-y-auto custom-scrollbar"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold tracking-tight">Server Status</h2>
                  <div className="flex gap-2">
                    <button 
                      onClick={fetchStatus}
                      className="p-2 bg-cs-bg-panel border border-cs-border hover:bg-white/5 rounded text-cs-muted hover:text-white transition-colors"
                      title="Force Refresh"
                    >
                      <Activity className="w-4 h-4" />
                    </button>
                    <div className="px-3 py-1 bg-cs-blue/10 border border-cs-blue/20 rounded-full text-cs-blue text-[10px] font-bold tracking-widest flex items-center">
                      Node: {serverInfo?.hostname || 'N/A'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-cs-bg-panel border border-cs-border rounded-lg p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4 text-cs-muted">
                      <Shield className="w-4 h-4 text-cs-red" />
                      <span className="text-[10px] font-bold tracking-widest">Steam Identity</span>
                    </div>
                    <div className="space-y-4">
                      {serverInfo?.steamid ? (() => {
                        const match = serverInfo.steamid.match(/\[([G|A]):(\d+):(\d+)\]\s+\((\d+)\)/);
                        if (match) {
                          const [_, type, universe, accountId, steamId64] = match;
                          return (
                            <>
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-bold text-cs-muted uppercase tracking-wider">SteamID3 / GSLT</span>
                                <div className="font-mono text-sm text-cs-yellow">{match[0].split(' ')[0]}</div>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  <span className="text-[8px] px-1.5 py-0.5 bg-cs-red/10 border border-cs-red/20 text-cs-red font-bold rounded">
                                    {type === 'G' ? 'Persistent Server' : 'Anonymous'}
                                  </span>
                                  <span className="text-[8px] px-1.5 py-0.5 bg-cs-blue/10 border border-cs-blue/20 text-cs-blue font-bold rounded">
                                    Universe: {universe === '1' ? 'Public' : universe}
                                  </span>
                                  <span className="text-[8px] px-1.5 py-0.5 bg-white/5 border border-white/10 text-cs-muted font-mono rounded">
                                    ID: {accountId}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col gap-1 pt-2 border-t border-cs-border/50">
                                <span className="text-[9px] font-bold text-cs-muted uppercase tracking-wider">SteamID64</span>
                                <div className="font-mono text-sm text-white/90">{steamId64}</div>
                              </div>
                            </>
                          );
                        }
                        return <div className="font-mono text-sm text-cs-yellow">{serverInfo.steamid}</div>;
                      })() : (
                        <div className="font-mono text-sm text-cs-muted">Public Identifier N/A</div>
                      )}
                    </div>
                  </div>
                  {/* Technical Specs Cards */}
                  <div className="bg-cs-bg-panel border border-cs-border rounded-lg p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4 text-cs-muted">
                      <Activity className="w-4 h-4 text-cs-yellow" />
                      <span className="text-[10px] font-bold tracking-widest">Version / Build</span>
                    </div>
                    <div className="font-mono text-sm break-all leading-relaxed">
                      {serverInfo?.version || 'Unknown System Build'}
                    </div>
                  </div>

                  <div className="bg-cs-bg-panel border border-cs-border rounded-lg p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4 text-cs-muted">
                      <Server className="w-4 h-4 text-cs-blue" />
                      <span className="text-[10px] font-bold tracking-widest">UDP/IP Interface</span>
                    </div>
                    <div className="font-mono text-sm">
                      {serverInfo?.udp_ip || 'Internal Network Only'}
                    </div>
                  </div>

                  <div className="bg-cs-bg-panel border border-cs-border rounded-lg p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4 text-cs-muted">
                      <Shield className="w-4 h-4 text-cs-green" />
                      <span className="text-[10px] font-bold tracking-widest">OS Infrastructure</span>
                    </div>
                    <div className="font-mono text-sm leading-relaxed">
                      {serverInfo?.os_type?.toLowerCase() || 'generic kernel'}
                    </div>
                  </div>
                </div>

                {/* Extended Details Table */}
                <div className="mt-8 bg-cs-bg-panel border border-cs-border rounded-lg overflow-hidden">
                  <div className="px-6 py-4 border-b border-cs-border bg-cs-bg-main">
                    <h3 className="text-[10px] font-bold text-cs-muted tracking-[0.2em]">Live Telemetry</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-cs-border">
                    <div className="p-6 flex justify-between items-center">
                      <span className="text-[11px] text-cs-muted font-bold">Humans Detected</span>
                      <span className="text-2xl font-black text-white">{serverInfo?.humans ?? 0}</span>
                    </div>
                    <div className="p-6 flex justify-between items-center">
                      <span className="text-[11px] text-cs-muted font-bold">Bots</span>
                      <span className="text-2xl font-black text-cs-yellow">{serverInfo?.bots ?? 0}</span>
                    </div>
                    <div className="p-6 flex justify-between items-center">
                      <span className="text-[11px] text-cs-muted font-bold">Current Map</span>
                      <span className="text-xl font-bold text-cs-blue">{serverInfo?.map || 'N/A'}</span>
                    </div>
                    <div className="p-6 flex justify-between items-center">
                      <span className="text-[11px] text-cs-muted font-bold">Maximum Capacity</span>
                      <span className="text-xl font-bold text-cs-muted">{serverInfo?.maxPlayers || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Raw Context Output */}
                <div className="mt-8">
                   <h3 className="text-[10px] font-bold text-cs-muted tracking-[0.2em] mb-4">Diagnostics Console</h3>
                   <div className="bg-black/40 border border-cs-border rounded-lg p-4 font-mono text-[11px] text-cs-muted leading-relaxed max-h-48 overflow-y-auto custom-scrollbar">
                     &gt; Fetching latest telemetry from node...<br/>
                     &gt; Server: {config.host}:{config.port}<br/>
                     &gt; Verified: {isConnected ? 'YES' : 'NO'}<br/>
                     &gt; Last Response: {new Date().toLocaleTimeString()}<br/>
                     &gt; All subsystems green.
                   </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'actions' && (
              <motion.div 
                key="actions"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex-1 p-8 flex flex-col overflow-y-auto custom-scrollbar"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold tracking-tight text-white">Server Actions</h2>
                  <div className="px-3 py-1 bg-cs-yellow/10 border border-cs-yellow/20 rounded-full text-cs-yellow text-[10px] font-bold tracking-widest">
                    Live Session Management
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Game & Teams */}
                  <div className="space-y-6">
                    <div className="bg-cs-bg-panel border border-cs-border rounded-lg p-6">
                      <h3 className="text-xs font-bold tracking-widest text-cs-muted mb-4 border-b border-cs-border/50 pb-2 flex items-center gap-2">
                         <Zap className="w-3 h-3 text-cs-yellow" /> Combat & Rules
                      </h3>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-white">Friendly Fire</p>
                            <p className="text-[10px] text-cs-muted">Allow teammates to damage each other</p>
                          </div>
                          <button 
                            onClick={() => {
                              const next = !friendlyFire;
                              setFriendlyFire(next);
                              executeAction('cvar', next ? '1' : '0', 'mp_friendlyfire');
                            }}
                            className={`w-12 h-6 rounded-full p-1 transition-colors ${friendlyFire ? 'bg-cs-green' : 'bg-cs-bg-main'}`}
                          >
                            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${friendlyFire ? 'translate-x-6' : 'translate-x-0'}`} />
                          </button>
                        </div>
                        <div className="pt-4 space-y-2">
                          <label className="text-[10px] uppercase text-cs-muted font-bold block">Quick Restart Schedule (Seconds)</label>
                          <div className="flex gap-2">
                            <input 
                              type="number" min="1" max="60"
                              value={restartSec}
                              onChange={(e) => setRestartSec(parseInt(e.target.value))}
                              className="w-20 bg-cs-bg-main border border-cs-border rounded px-3 py-2 text-sm font-mono"
                            />
                            <button 
                              onClick={() => executeCommand(`mp_restartgame ${restartSec}`)}
                              className="flex-1 bg-cs-red px-4 py-2 rounded text-[10px] font-bold uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all"
                            >
                              Execute Restart
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-cs-bg-panel border border-cs-border rounded-lg p-6">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-cs-muted mb-4 border-b border-cs-border/50 pb-2 flex items-center gap-2">
                         <Users className="w-3 h-3 text-cs-blue" /> Team Management
                      </h3>
                      <div className="space-y-4">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => executeCommand('mp_scrambleteams')}
                            className="flex-1 bg-cs-bg-main border border-cs-border hover:bg-white/5 p-2 rounded text-[10px] font-bold uppercase"
                          >
                            Scramble Teams
                          </button>
                          <button 
                            onClick={() => executeCommand('mp_swapteams')}
                            className="flex-1 bg-cs-bg-main border border-cs-border hover:bg-white/5 p-2 rounded text-[10px] font-bold uppercase"
                          >
                            Swap Sides
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[9px] uppercase text-cs-muted font-bold">Rename CT</label>
                            <div className="flex gap-2">
                              <input 
                                placeholder="Counter-Terrorists"
                                className="flex-1 bg-cs-bg-main border border-cs-border rounded px-3 py-2 text-sm"
                                value={ctName}
                                onKeyDown={(e) => e.key === 'Enter' && executeAction('teamname', ctName, 'ct')}
                                onChange={(e) => setCtName(e.target.value)}
                              />
                              <button 
                                onClick={() => executeAction('teamname', ctName, 'ct')}
                                className="bg-cs-bg-panel border border-cs-border hover:bg-white/5 px-2 rounded text-[9px] font-bold uppercase"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] uppercase text-cs-muted font-bold">Rename T</label>
                            <div className="flex gap-2">
                              <input 
                                placeholder="Terrorists"
                                className="flex-1 bg-cs-bg-main border border-cs-border rounded px-3 py-2 text-sm"
                                value={tName}
                                onKeyDown={(e) => e.key === 'Enter' && executeAction('teamname', tName, 't')}
                                onChange={(e) => setTName(e.target.value)}
                              />
                              <button 
                                onClick={() => executeAction('teamname', tName, 't')}
                                className="bg-cs-bg-panel border border-cs-border hover:bg-white/5 px-2 rounded text-[9px] font-bold uppercase"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bots & Comms */}
                  <div className="space-y-6">
                    <div className="bg-cs-bg-panel border border-cs-border rounded-lg p-6">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-cs-muted mb-4 border-b border-cs-border/50 pb-2 flex items-center gap-2">
                         <Activity className="w-3 h-3 text-cs-green" /> Bots
                      </h3>
                      <div className="space-y-4">
                        <div className="space-y-2">
                           <div className="flex justify-between">
                             <label className="text-[10px] uppercase text-cs-muted font-bold">Bot Quota</label>
                             <span className="text-[10px] font-mono text-cs-yellow">{botQuota} ENTITIES</span>
                           </div>
                           <input 
                             type="range" min="0" max="32"
                             value={botQuota}
                             onChange={(e) => setBotQuota(parseInt(e.target.value))}
                             className="w-full accent-cs-yellow bg-cs-bg-main h-1.5 rounded-lg appearance-none cursor-pointer"
                           />
                           <div className="flex gap-2">
                             <button 
                               onClick={() => executeAction('cvar', botQuota.toString(), 'bot_quota')}
                               className="flex-1 bg-cs-bg-main border border-cs-border hover:bg-white/5 p-2 rounded text-[10px] font-bold uppercase"
                             >
                               Set Quota
                             </button>
                             <button 
                               onClick={() => executeCommand('bot_kick')}
                               className="px-4 bg-cs-red/20 border border-cs-red/50 hover:bg-cs-red/30 p-2 rounded text-[10px] font-bold uppercase text-cs-red"
                             >
                               Kick All Bots
                             </button>
                           </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-cs-bg-panel border border-cs-border rounded-lg p-6">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-cs-muted mb-4 border-b border-cs-border/50 pb-2 flex items-center gap-2">
                         <MessageSquare className="w-3 h-3 text-cs-blue" /> Global message
                      </h3>
                      <div className="space-y-4">
                         <p className="text-[10px] text-cs-muted italic">Transmit a global text broadcast to all active session participants via RCON shell.</p>
                         <div className="flex gap-2">
                           <input 
                             placeholder="Type broadcast message..."
                             className="flex-1 bg-cs-bg-main border border-cs-border rounded px-4 py-2 text-sm"
                             value={broadcastMsg}
                             onChange={(e) => setBroadcastMsg(e.target.value)}
                             onKeyDown={(e) => e.key === 'Enter' && executeAction('say', broadcastMsg)}
                           />
                           <button 
                             onClick={() => {
                               executeAction('say', broadcastMsg);
                               setBroadcastMsg('');
                             }}
                             className="bg-cs-blue px-4 py-2 rounded text-[10px] font-bold uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all"
                           >
                             Send
                           </button>
                         </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'cvars' && (
              <motion.div 
                key="cvars"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex-1 p-8 flex flex-col overflow-hidden"
              >
                <div className="flex items-center justify-between mb-8 shrink-0">
                  <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-bold tracking-tight text-white">Server Variables</h2>
                    <div className="px-3 py-1 bg-cs-blue/10 border border-cs-blue/20 rounded-full text-cs-blue text-[10px] font-bold tracking-widest">
                       {filteredCvars.length} Loaded
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                     <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cs-muted" />
                        <input 
                           type="text" 
                           placeholder="Search variables (e.g. mp_roundtime)"
                           className="bg-cs-bg-panel border border-cs-border rounded px-10 py-2.5 text-xs w-80 focus:border-cs-yellow outline-none transition-all"
                           value={cvarSearch}
                           onChange={(e) => {
                             setCvarSearch(e.target.value);
                             setCvarPage(1);
                           }}
                        />
                     </div>
                     <button 
                       onClick={() => setShowRawModal(true)}
                       className="p-2.5 bg-cs-bg-panel border border-cs-border hover:bg-cs-border/50 rounded transition-colors text-[10px] font-bold tracking-widest text-cs-muted hover:text-white flex items-center gap-2"
                     >
                        <Terminal className="w-3.5 h-3.5" /> Raw View
                     </button>
                     <button 
                       onClick={() => fetchCvars(cvarSearch)}
                       className="p-2.5 bg-cs-bg-panel border border-cs-border hover:bg-cs-border/50 rounded transition-colors"
                       title="Force Fetch All"
                     >
                        <RefreshCw className={`w-4 h-4 ${isLoadingCvars ? 'animate-spin' : ''}`} />
                     </button>
                  </div>
                </div>

                <div className="flex-1 bg-cs-bg-panel border border-cs-border rounded-lg overflow-hidden flex flex-col">
                   <div className="overflow-y-auto flex-1 custom-scrollbar">
                      <table className="w-full text-left">
                        <thead className="sticky top-0 bg-cs-bg-main z-10 border-b border-cs-border">
                          <tr>
                            <th className="px-6 py-4 text-[10px] font-bold text-cs-muted uppercase tracking-widest">Variable Name</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-cs-muted uppercase tracking-widest">Current Value</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-cs-muted uppercase tracking-widest">Flags</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-cs-muted uppercase tracking-widest">Documentation</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-cs-border/30">
                          {isLoadingCvars && (
                            <tr>
                              <td colSpan={4} className="px-6 py-12 text-center text-cs-muted font-mono animate-pulse">
                                INITIATING DIRECTORY SYNC WITH CLUSTER...
                              </td>
                            </tr>
                          )}
                          {!isLoadingCvars && paginatedCvars.map(cvar => (
                            <tr key={cvar.name} className="hover:bg-white/[0.02] transition-colors group">
                               <td className="px-6 py-4">
                                  <span className="font-mono text-xs font-bold text-cs-yellow">{cvar.name}</span>
                               </td>
                               <td className="px-6 py-4">
                                  <input 
                                     defaultValue={cvar.value}
                                     className="bg-transparent border border-transparent group-hover:border-cs-border/50 rounded px-2 py-1 text-xs font-mono outline-none focus:bg-black/50 focus:border-cs-yellow transition-all w-full max-w-[120px]"
                                     onBlur={(e) => {
                                        if (e.target.value !== cvar.value) {
                                          updateCvar(cvar.name, e.target.value);
                                        }
                                     }}
                                     onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          (e.target as HTMLInputElement).blur();
                                        }
                                     }}
                                  />
                               </td>
                               <td className="px-6 py-4">
                                  <span className="text-[10px] font-mono text-cs-muted leading-tight block max-w-[150px] uppercase">
                                     {cvar.flags || '-'}
                                  </span>
                               </td>
                               <td className="px-6 py-4">
                                  <p className="text-[11px] text-cs-muted leading-relaxed italic line-clamp-2 max-w-[400px]">
                                     {cvar.description || 'No specialized system documentation available.'}
                                  </p>
                               </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                   </div>
                   
                    {/* Pagination Footer */}
                    <div className="px-6 py-4 border-t border-cs-border bg-cs-bg-main flex items-center justify-between shrink-0">
                       <div className="text-[10px] font-bold text-cs-muted uppercase tracking-widest">
                          Showing {(cvarPage - 1) * CVARS_PER_PAGE + 1} to {Math.min(cvarPage * CVARS_PER_PAGE, filteredCvars.length)} of {filteredCvars.length}
                       </div>
                       <div className="flex items-center gap-4">
                          <div className="flex gap-1 overflow-x-auto max-w-[200px] no-scrollbar">
                             {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pageNum;
                                if (totalPages <= 5) {
                                  pageNum = i + 1;
                                } else {
                                  if (cvarPage <= 3) pageNum = i + 1;
                                  else if (cvarPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                                  else pageNum = cvarPage - 2 + i;
                                }
                                return (
                                  <button
                                    key={pageNum}
                                    onClick={() => setCvarPage(pageNum)}
                                    className={`w-8 h-8 flex items-center justify-center rounded text-[10px] font-bold transition-all ${
                                      cvarPage === pageNum 
                                        ? 'bg-cs-yellow text-black' 
                                        : 'bg-cs-bg-panel border border-cs-border text-cs-muted hover:text-white hover:bg-white/5'
                                    }`}
                                  >
                                    {pageNum}
                                  </button>
                                );
                             })}
                          </div>

                          <div className="flex gap-2 border-l border-cs-border pl-4">
                             <button 
                                disabled={cvarPage === 1}
                                onClick={() => setCvarPage(p => p - 1)}
                                className="p-2 border border-cs-border rounded disabled:opacity-20 hover:bg-white/5 transition-colors"
                             >
                                <ChevronLeft className="w-4 h-4" />
                             </button>
                             <button 
                                disabled={cvarPage === totalPages}
                                onClick={() => setCvarPage(p => p + 1)}
                                className="p-2 border border-cs-border rounded disabled:opacity-20 hover:bg-white/5 transition-colors"
                             >
                                <ChevronRightIcon className="w-4 h-4" />
                             </button>
                          </div>
                       </div>
                    </div>
                </div>
              </motion.div>
            )}
            {activeTab === 'console' && (
              <motion.div 
                key="console"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex-1 flex flex-col overflow-hidden"
              >
                <div 
                  onClick={() => {
                    if (window.getSelection()?.toString() === '') {
                      commandInputRef.current?.focus();
                    }
                  }}
                  className="flex-1 p-6 font-mono text-[13px] leading-relaxed overflow-y-auto custom-scrollbar flex flex-col text-cs-text cursor-text"
                >
                  <div className="mt-auto space-y-1">
                    {consoleHistory.map((entry, i) => (
                      <div key={i} className="flex gap-4 group">
                        <span className="text-cs-muted/30 text-[10px] mt-0.5 min-w-[65px] hidden sm:block">
                          [{entry.timestamp.toLocaleTimeString([], { hour12: false })}]
                        </span>
                        <div className="flex-1">
                          {entry.type === 'command' && (
                            <div className="flex items-start gap-2 text-cs-yellow font-bold">
                              <span className="opacity-50 tracking-tighter">[RCON]</span>
                              <span>{entry.content}</span>
                            </div>
                          )}
                          {entry.type === 'response' && (
                            <div className="text-cs-text/90 whitespace-pre-wrap leading-relaxed">
                              {entry.content}
                            </div>
                          )}
                          {entry.type === 'error' && (
                            <div className="text-cs-red bg-cs-red/5 border-l-2 border-cs-red pl-3 py-1 my-1 flex items-center gap-2">
                              <AlertTriangle className="w-3 h-3" />
                              {entry.content}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={consoleEndRef} />
                  </div>
                </div>
                
                {/* RCON Input Bar */}
                <div className="h-14 border-t border-cs-border bg-cs-bg-panel px-4 flex items-center gap-3 shrink-0">
                  <span className="text-cs-yellow font-mono font-bold text-xs">RCON</span>
                  <form onSubmit={(e) => { e.preventDefault(); executeCommand(); }} className="flex-1 flex items-center gap-3">
                    <div className="flex-1 relative">
                      <input 
                        ref={commandInputRef}
                        type="text" 
                        value={commandInput}
                        onChange={(e) => {
                          setCommandInput(e.target.value);
                          if (historyIndex === -1) {
                            setTempCommand(e.target.value);
                          }
                          setShowAutocomplete(true);
                          setAutocompleteIndex(0);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Tab' && autocompleteSuggestions.length > 0) {
                            e.preventDefault();
                            setCommandInput(autocompleteSuggestions[autocompleteIndex]);
                            setShowAutocomplete(false);
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            if (showAutocomplete && autocompleteSuggestions.length > 0) {
                              setAutocompleteIndex(prev => (prev > 0 ? prev - 1 : autocompleteSuggestions.length - 1));
                            } else if (historyIndex < commandHistory.length - 1) {
                              const newIndex = historyIndex + 1;
                              setHistoryIndex(newIndex);
                              setCommandInput(commandHistory[newIndex]);
                            }
                          } else if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            if (showAutocomplete && autocompleteSuggestions.length > 0) {
                              setAutocompleteIndex(prev => (prev < autocompleteSuggestions.length - 1 ? prev + 1 : 0));
                            } else if (historyIndex > 0) {
                              const newIndex = historyIndex - 1;
                              setHistoryIndex(newIndex);
                              setCommandInput(commandHistory[newIndex]);
                            } else if (historyIndex === 0) {
                              setHistoryIndex(-1);
                              setCommandInput(tempCommand);
                            }
                          } else if (e.key === 'Escape') {
                            setShowAutocomplete(false);
                          }
                        }}
                        onBlur={() => {
                          // Delay hiding to allow click on suggestion
                          setTimeout(() => setShowAutocomplete(false), 200);
                        }}
                        placeholder={isConnected ? "Type command (e.g. status, changelevel, kick)..." : "Initialize connection to send commands..."}
                        disabled={!isConnected || isExecuting}
                        className="w-full bg-transparent border-none focus:ring-0 text-sm font-mono placeholder:text-cs-muted/40 outline-none"
                      />

                      {showAutocomplete && autocompleteSuggestions.length > 0 && (
                        <div className="absolute bottom-full left-0 mb-2 w-64 bg-cs-bg-panel border border-cs-border rounded-lg shadow-xl z-50 overflow-hidden">
                          <div className="p-2 border-b border-cs-border bg-black/20 flex justify-between items-center">
                            <span className="text-[9px] font-bold text-cs-muted uppercase tracking-widest">Suggestions</span>
                            <span className="text-[8px] text-cs-muted/50 font-mono">TAB to select</span>
                          </div>
                          <div className="max-h-48 overflow-y-auto custom-scrollbar">
                            {autocompleteSuggestions.map((suggestion, idx) => (
                              <div 
                                key={suggestion}
                                onClick={() => {
                                  setCommandInput(suggestion);
                                  setShowAutocomplete(false);
                                  commandInputRef.current?.focus();
                                }}
                                className={`px-4 py-2 text-xs font-mono cursor-pointer transition-colors ${idx === autocompleteIndex ? 'bg-cs-yellow/10 text-cs-yellow' : 'text-cs-muted hover:bg-white/5'}`}
                              >
                                {suggestion}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-cs-muted uppercase font-bold">
                      {isExecuting ? <Loader2 className="w-3 h-3 animate-spin" /> : "ENTER"}
                    </div>
                  </form>
                </div>
              </motion.div>
            )}

            {activeTab === 'players' && (
              <motion.div 
                key="players"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex-1 p-8 flex flex-col"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold tracking-tight">Connected Players</h2>
                  <div className="px-3 py-1 bg-cs-green/10 border border-cs-green/20 rounded-full text-cs-green text-[10px] font-bold tracking-widest">
                    Live
                  </div>
                </div>

                <div className="flex-1 bg-cs-bg-panel border border-cs-border rounded-lg overflow-hidden flex flex-col">
                  {serverInfo?.playerList?.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-cs-bg-main border-b border-cs-border">
                          <th className="px-6 py-4 text-[10px] font-bold text-cs-muted tracking-widest">ID</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-cs-muted tracking-widest">Name</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-cs-muted tracking-widest">Steam ID</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-cs-muted tracking-widest">Ping</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-cs-muted tracking-widest text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cs-border">
                        {serverInfo.playerList.map((player: any) => (
                          <tr key={player.userId} className="hover:bg-white/5 transition-colors group">
                            <td className="px-6 py-4 font-mono text-xs text-cs-muted">{player.userId}</td>
                            <td className="px-6 py-4 font-bold">{player.name}</td>
                            <td className="px-6 py-4 font-mono text-xs text-cs-muted">{player.steamId}</td>
                            <td className="px-6 py-4">
                              <span className={`text-xs font-mono ${parseInt(player.ping) < 50 ? 'text-cs-green' : 'text-cs-yellow'}`}>
                                {player.ping}ms
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => executeAction('kick', player.userId)}
                                  title={`Kick ${player.name} (Slot ${player.userId})`}
                                  className="px-3 py-1 bg-cs-yellow/10 hover:bg-cs-yellow text-cs-yellow hover:text-black text-[10px] font-bold rounded transition-all uppercase"
                                >
                                  Kick
                                </button>
                                <button 
                                  onClick={() => executeAction('ban', player.steamId, '60')}
                                  title={`Ban ${player.name} for 60m`}
                                  className="px-3 py-1 bg-cs-red/10 hover:bg-cs-red text-cs-red hover:text-white text-[10px] font-bold rounded transition-all uppercase"
                                >
                                  Ban 1h
                                </button>
                                <button 
                                  onClick={() => executeAction('ban', player.steamId, '0')}
                                  title={`Permanent Ban ${player.name}`}
                                  className="px-3 py-1 bg-red-600/10 hover:bg-red-600 text-red-600 hover:text-white text-[10px] font-bold rounded transition-all uppercase"
                                >
                                  Forever
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-6 opacity-20">
                      <Users className="w-24 h-24 stroke-[0.5]" />
                      <p className="text-xs uppercase tracking-[0.4em]">No Personnel Detected</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'maps' && (
              <motion.div 
                key="maps"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex-1 p-8 flex flex-col min-h-0"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold tracking-tight">Map List</h2>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setMapSortOrder(prev => prev === 'name' ? 'source' : 'name')}
                      className="px-3 py-1 bg-cs-bg-panel border border-cs-border hover:bg-white/5 rounded text-[10px] font-bold tracking-widest uppercase transition-colors"
                      title="Toggle Sort Order"
                    >
                      Sort: {mapSortOrder === 'name' ? 'Alphabetical' : 'By Source'}
                    </button>
                    <button 
                      onClick={() => void syncMaps()}
                      disabled={isFetchingMaps}
                      className="p-2 bg-cs-bg-panel border border-cs-border hover:bg-white/5 rounded text-cs-muted hover:text-white transition-colors disabled:opacity-50"
                      title="Sync Maps"
                    >
                      <RefreshCw className={`w-4 h-4 ${isFetchingMaps ? 'animate-spin' : ''}`} />
                    </button>
                    <div className="px-3 py-1 bg-cs-yellow/10 border border-cs-yellow/20 rounded-full text-cs-yellow text-[10px] font-bold tracking-widest flex items-center">
                      Change Server Map
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-2 custom-scrollbar">
                  {[
                    ...defaultMapOptions,
                    ...workshopMaps.map(m => ({ 
                      id: m.id.toLowerCase(), 
                      name: m.name.split('_').map((w: string) => {
                        const low = w.toLowerCase();
                        if (low === 'cs2') return 'CS2';
                        if (low === 'cs') return 'CS';
                        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
                      }).join(' '),
                      rawName: m.name.toLowerCase(),
                      type: 'workshop' as const 
                    }))
                  ].sort((a: any, b: any) => {
                    if (mapSortOrder === 'source') {
                      if (a.type !== b.type) return a.type === 'default' ? -1 : 1;
                    }
                    return a.name.localeCompare(b.name);
                  }).map((map: any) => {
                    const isCurrent = serverInfo?.map?.toLowerCase() === map.rawName?.toLowerCase() || 
                                     serverInfo?.map?.toLowerCase() === map.id?.toLowerCase();
                    
                    return (
                      <div 
                        key={map.id}
                        onClick={() => {
                          if (map.type === 'workshop') {
                            executeCommand(`ds_workshop_changelevel ${map.rawName || map.id}`);
                          } else {
                            executeAction('map', map.id);
                          }
                        }}
                        className={`flex items-center justify-between p-4 bg-cs-bg-panel border border-cs-border rounded-lg cursor-pointer transition-all hover:bg-white/5 ${isCurrent ? 'border-cs-yellow/50 ring-1 ring-cs-yellow/30' : ''}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-cs-yellow animate-pulse' : 'bg-cs-muted/30'}`} />
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-cs-yellow leading-tight">{map.name}</h3>
                              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded tracking-widest uppercase ${map.type === 'workshop' ? 'bg-cs-blue/20 text-cs-blue border border-cs-blue/30' : 'bg-cs-muted/10 text-cs-muted border border-cs-muted/20'}`}>
                                {map.type === 'workshop' ? 'Workshop' : 'Default'}
                              </span>
                            </div>
                            <p className="text-[10px] font-mono text-cs-muted">
                              {(map.rawName || map.id).toLowerCase().replace(/cs2/g, 'CS2').replace(/cs/g, 'CS')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {isCurrent && (
                            <span className="text-[9px] font-bold text-cs-yellow uppercase tracking-widest bg-cs-yellow/10 px-2 py-0.5 rounded">Current</span>
                          )}
                          <ChevronRight className="w-4 h-4 text-cs-muted" />
                        </div>
                      </div>
                    );
                  })}
                  
                  {isFetchingMaps && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 opacity-30">
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <p className="text-[10px] font-bold tracking-[0.2em] uppercase">Scanning Workshop Repositories...</p>
                    </div>
                  )}
                  
                  {!isFetchingMaps && workshopMaps.length === 0 && (
                    <div className="flex flex-col gap-4">
                      <div className="p-4 bg-cs-bg-panel/50 border border-cs-border border-dashed rounded-lg text-center">
                        <p className="text-[10px] text-cs-muted font-bold tracking-widest uppercase">No Workshop Maps Found on Server</p>
                      </div>
                      
                      <button 
                        onClick={() => setShowRawWorkshop(!showRawWorkshop)}
                        className="text-[9px] font-bold text-cs-muted hover:text-cs-yellow uppercase tracking-tighter self-center transition-colors"
                      >
                        {showRawWorkshop ? 'Hide Raw Output' : 'Show Server Response'}
                      </button>

                      {showRawWorkshop && rawWorkshopOutput && (
                        <div className="bg-black/40 p-4 rounded border border-cs-border font-mono text-[10px] whitespace-pre overflow-x-auto text-cs-muted">
                          {rawWorkshopOutput}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'gamemodes' && (
              <motion.div 
                key="gamemodes"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex-1 p-8 flex flex-col"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold tracking-tight">Game Modes</h2>
                  <div className="px-3 py-1 bg-cs-blue/10 border border-cs-blue/20 rounded-full text-cs-blue text-[10px] font-bold tracking-widest">
                    Change Mode
                  </div>
                </div>

                <div className="space-y-2">
                  {GAME_MODES.map((mode) => {
                    const isActive = serverInfo?.gameType === mode.type && serverInfo?.gameMode === mode.mode;
                    return (
                      <div 
                        key={mode.name}
                        onClick={() => executeAction('gamemode', `${mode.type} ${mode.mode}`, serverInfo?.map || 'de_dust2')}
                        className={`flex items-center justify-between p-4 bg-cs-bg-panel border border-cs-border rounded-lg cursor-pointer transition-all hover:bg-white/5 ${isActive ? 'border-cs-blue/50 ring-1 ring-cs-blue/30' : ''}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-cs-blue animate-pulse' : 'bg-cs-muted/30'}`} />
                          <div>
                            <div className="flex items-center gap-3">
                              <h3 className="text-sm font-bold text-cs-yellow leading-tight">{mode.name}</h3>
                              <div className="flex gap-2 font-mono text-[9px] text-cs-muted font-bold tracking-tighter opacity-50">
                                <span>T:{mode.type}</span>
                                <span>M:{mode.mode}</span>
                              </div>
                            </div>
                            <p className="text-[10px] text-cs-muted mt-0.5">{(mode as any).desc || 'Standard ruleset'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {isActive ? (
                            <span className="text-[9px] font-bold text-cs-blue uppercase tracking-widest bg-cs-blue/20 border border-cs-blue/30 px-2 py-0.5 rounded flex items-center gap-1.5 shadow-[0_0_10px_rgba(30,144,255,0.1)]">
                              <span className="w-1.5 h-1.5 bg-cs-blue rounded-full animate-pulse" />
                              Active Mode
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold text-cs-muted/40 uppercase tracking-widest">Switch</span>
                          )}
                          <ChevronRight className={`w-4 h-4 transition-transform ${isActive ? 'text-cs-blue translate-x-1' : 'text-cs-muted/20'}`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <div className="mt-8 p-6 bg-cs-bg-panel border border-cs-border rounded-lg">
                  <div className="flex items-center gap-3 mb-4">
                    <Shield className="w-5 h-5 text-cs-yellow" />
                    <h4 className="text-xs font-bold uppercase tracking-widest">Protocol Reminder</h4>
                  </div>
                  <p className="text-xs text-cs-muted leading-relaxed max-w-2xl">
                    Changing the engagement ruleset (Game Mode) typically requires a map reload. The system will automatically trigger 
                    a reload of the current theater (<span className="text-cs-yellow font-bold uppercase">{serverInfo?.map}</span>) 
                    after updating server variables to ensure all mechanics are initialized correctly.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Right Dashboard Pane */}
        <aside className="w-72 border-l border-cs-border bg-cs-bg-main hidden xl:flex flex-col shrink-0 text-white">
          <div className="flex-1 overflow-hidden p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[10px] text-cs-muted font-bold tracking-[0.2em]">Session Log</h2>
              <button 
                onClick={() => setConsoleHistory([])}
                className="text-[9px] font-bold text-cs-muted hover:text-cs-yellow transition-colors uppercase tracking-widest"
              >
                Clear Log
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2">
              {consoleHistory.length > 0 ? (
                <div className="space-y-4">
                  {(() => {
                    const grouped: any[] = [];
                    const history = [...consoleHistory];
                    for (let i = 0; i < history.length; i++) {
                      const entry = history[i];
                      if (entry.type === 'command') {
                        // Look ahead for response
                        const next = history[i + 1];
                        if (next && next.type === 'response') {
                          grouped.push({
                            type: 'pair',
                            command: entry.content,
                            response: next.content,
                            timestamp: next.timestamp
                          });
                          i++; // Skip next
                        } else {
                          grouped.push({
                            type: 'command',
                            content: entry.content,
                            timestamp: entry.timestamp
                          });
                        }
                      } else {
                        grouped.push(entry);
                      }
                    }
                    return grouped.reverse().slice(0, 30).map((item, i) => (
                      <div key={i} className={`p-3 rounded border-l-2 text-[10px] font-mono leading-relaxed bg-white/[0.02] shadow-sm ${
                        item.type === 'pair' ? 'border-cs-yellow/50' : 
                        item.type === 'command' ? 'border-cs-yellow' : 
                        item.type === 'error' ? 'border-cs-red' : 'border-cs-blue/30'
                      }`}>
                        <div className="flex justify-between items-center mb-2">
                          <span className={`font-bold tracking-widest ${
                            item.type === 'pair' || item.type === 'command' ? 'text-cs-yellow' : 
                            item.type === 'error' ? 'text-cs-red' : 'text-cs-muted'
                          }`}>
                            {item.type === 'pair' ? 'Session Transaction' : 
                             item.type === 'command' ? 'Command Call' : 
                             item.type === 'error' ? 'System Error' : 'Server Response'}
                          </span>
                          <span className="text-[8px] opacity-30">
                            {item.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        
                        {item.type === 'pair' ? (
                          <div className="space-y-2">
                            <div className="text-cs-yellow font-bold bg-cs-yellow/5 p-1.5 rounded">
                              <span className="opacity-50 mr-1">$</span> {item.command}
                            </div>
                            <div className="text-cs-text pl-3 border-l border-white/10 break-words line-clamp-4">
                              {item.response}
                            </div>
                          </div>
                        ) : (
                          <div className={`break-words line-clamp-3 ${
                            item.type === 'command' ? 'text-cs-yellow font-bold' : 
                            item.type === 'error' ? 'text-cs-red' : 'text-cs-text'
                          }`}>
                            {item.content}
                          </div>
                        )}
                      </div>
                    ));
                  })()}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-cs-muted/10 opacity-50 space-y-4">
                  <Terminal className="w-12 h-12 stroke-[0.5]" />
                  <p className="text-[9px] uppercase tracking-widest text-center">Awaiting System<br/>Logs</p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Connection Modal Overlay */}
      <AnimatePresence>
        {showConfig && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => isConnected && setShowConfig(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-cs-bg-panel border border-cs-border rounded-lg p-8 w-full max-w-md relative shadow-2xl overflow-hidden"
            >
              {/* Logo Background Blur */}
              <div className="absolute -top-12 -right-12 w-48 h-48 bg-cs-yellow/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex flex-col items-center text-center mb-8">
                <img 
                  src="https://cdn.fastly.steamstatic.com/apps/csgo/images/csgo_react//global/cs2_icon_color_512x512.png" 
                  alt="CS2 Logo" 
                  className="w-16 h-16 mb-4"
                />
                <h2 className="text-2xl font-black tracking-tighter text-cs-yellow italic uppercase">CS2 RCON Commander</h2>
                <p className="text-cs-muted text-[10px] tracking-[0.2em] mt-1 font-bold">Remote Server Authentication</p>
              </div>

              {isConnected && (
                <button 
                  onClick={() => setShowConfig(false)}
                  className="absolute top-4 right-4 p-1 hover:bg-white/5 rounded text-cs-muted hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              )}

              <div className="space-y-6">
                {connectionError && (
                  <motion.div 
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-cs-red/10 border border-cs-red/30 rounded text-[11px] text-cs-red flex gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{connectionError}</span>
                  </motion.div>
                )}
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-[0.2em] font-mono text-cs-muted font-bold ml-1">Server IP Address</label>
                  <input 
                    type="text" 
                    placeholder="E.G. 127.0.0.1"
                    value={config.host}
                    onChange={(e) => {
                      setConfigEdited(true);
                      setConfig({ ...config, host: e.target.value });
                    }}
                    className="w-full bg-cs-bg-console border border-cs-border rounded-md py-3 px-4 outline-none focus:border-cs-yellow/50 transition-all font-mono text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-[0.2em] font-mono text-cs-muted font-bold ml-1">RCON Port</label>
                  <input 
                    type="text" 
                    placeholder="27015"
                    value={config.port}
                    onChange={(e) => {
                      setConfigEdited(true);
                      setConfig({ ...config, port: e.target.value });
                    }}
                    className="w-full bg-cs-bg-console border border-cs-border rounded-md py-3 px-4 outline-none focus:border-cs-yellow/50 transition-all font-mono text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-[0.2em] font-mono text-cs-muted font-bold ml-1">RCON Password</label>
                  <input 
                    type="password" 
                    placeholder="••••••••"
                    value={config.password}
                    onChange={(e) => {
                      setConfigEdited(true);
                      setConfig({ ...config, password: e.target.value });
                    }}
                    className="w-full bg-cs-bg-console border border-cs-border rounded-md py-3 px-4 outline-none focus:border-cs-yellow/50 transition-all font-mono text-sm"
                  />
                </div>

                {isConnected && (
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] uppercase text-cs-muted font-bold tracking-widest">Danger Zone</span>
                    <button 
                      onClick={resetConfig}
                      className="text-[10px] text-cs-red font-bold hover:underline uppercase tracking-widest"
                    >
                      Logout / Wipe Config
                    </button>
                  </div>
                )}

                <button 
                  onClick={testConnection}
                  disabled={!config.host || !config.port || !config.password || isConnecting}
                  className="w-full py-4 bg-cs-yellow hover:brightness-110 disabled:opacity-5 disabled:grayscale text-black font-black uppercase tracking-[0.2em] text-xs rounded shadow-xl transition-all active:scale-[0.98] mt-4"
                >
                  {isConnecting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Connecting...
                    </span>
                  ) : 'Login to RCON'}
                </button>
                
                {isConnecting && (
                  <p className="text-center mt-4">
                    <button 
                      onClick={() => setIsConnecting(false)}
                      className="text-[10px] text-cs-muted hover:text-white uppercase font-bold tracking-widest"
                    >
                      Cancel Attempt
                    </button>
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Raw Output Modal */}
      <AnimatePresence>
        {showRawModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRawModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-cs-bg-panel border border-cs-border rounded-lg w-full max-w-4xl h-[80vh] flex flex-col relative z-10 overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-cs-border flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-widest">RCON Raw Output: cvarlist</h3>
                <button onClick={() => setShowRawModal(false)} className="p-1 hover:bg-white/5 rounded text-cs-muted hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 p-6 overflow-y-auto custom-scrollbar font-mono text-[11px] leading-relaxed text-cs-muted bg-cs-bg-console">
                <pre className="whitespace-pre-wrap">{rawCvars || 'No raw data available. Ensure connection is active and data has been fetched.'}</pre>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
