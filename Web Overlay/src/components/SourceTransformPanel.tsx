import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  RotateCcw,
  Eye,
  EyeOff,
  Play,
  CheckCircle2,
  Lock,
  Unlock,
  Sliders,
  Crop as CropIcon,
  RefreshCw,
  Sparkles,
  Monitor,
  Activity,
  Radio,
  User,
  Key,
  AlertTriangle,
} from 'lucide-react';

interface TransformState {
  posX: number;
  posY: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  zoomX: number;
  zoomY: number;
  cropTop: number;
  cropBottom: number;
  cropLeft: number;
  cropRight: number;
}

const DEFAULT_STATE: TransformState = {
  posX: 0,
  posY: 0,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  zoomX: 100,
  zoomY: 100,
  cropTop: 0,
  cropBottom: 0,
  cropLeft: 0,
  cropRight: 0,
};

declare global {
  interface Window {
    pywebview?: {
      api?: {
        get_transform?: () => Promise<TransformState>;
        render_overlay?: (transform: TransformState) => Promise<{
          success: boolean;
          match_id?: string;
          mode?: string;
          png_path?: string;
          error?: string;
        }>;
        toggle_overlay_visibility?: (visible: boolean) => Promise<boolean>;
        close_panel?: () => Promise<void>;
        get_riot_config?: () => Promise<any>;
        update_riot_id?: (riot_id: string) => Promise<any>;
        update_api_key?: (api_key: string) => Promise<any>;
        fetch_live_now?: () => Promise<any>;
        set_auto_polling?: (enabled: boolean, interval?: number) => Promise<boolean>;
      };
    };
    // Callbacks từ Python backend
    onAppStateUpdate?: (data: any) => void;
    onProgressUpdate?: (data: { pct: number; status: string }) => void;
  }
}

export default function SourceTransformPanel() {
  const [transform, setTransform] = useState<TransformState>(DEFAULT_STATE);
  const [lockAspect, setLockAspect] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosed, setIsClosed] = useState(false);

  // Riot ID & Live Tracker State
  const [riotId, setRiotId] = useState('');
  const [apiKeyMasked, setApiKeyMasked] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [isFetchingRiot, setIsFetchingRiot] = useState(false);
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [newApiKeyInput, setNewApiKeyInput] = useState('');

  // Render process state
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('Overlay rendered & synced');
  const [toastDuration, setToastDuration] = useState('1.2s');

  // OBS connection status
  const [obsConnected, setObsConnected] = useState(false);
  const obsUrl = 'http://localhost:8080/overlay';

  // Numeric scrub drag state
  const [scrubbingParam, setScrubbingParam] = useState<keyof TransformState | null>(null);
  const scrubStartRef = useRef<{ x: number; initialVal: number }>({ x: 0, initialVal: 0 });
  const rafIdRef = useRef<number | null>(null);

  // Nạp transform & riot config khi mở app
  useEffect(() => {
    const initTransform = async () => {
      if (window.pywebview?.api?.get_transform) {
        try {
          const saved = await window.pywebview.api.get_transform();
          if (saved) setTransform(saved);
        } catch (e) {
          console.warn('Could not load transform from backend:', e);
        }
      }
    };

    const initRiotConfig = async () => {
      try {
        let riotData: any = null;
        if (window.pywebview?.api?.get_riot_config) {
          riotData = await window.pywebview.api.get_riot_config();
        } else {
          riotData = await fetch('/api/riot').then(r => r.json()).catch(() => null);
        }
        if (riotData) {
          if (riotData.riot_id) setRiotId(riotData.riot_id);
          if (riotData.api_key_masked) setApiKeyMasked(riotData.api_key_masked);
          if (riotData.has_api_key !== undefined) setHasApiKey(riotData.has_api_key);
          if (riotData.is_polling !== undefined) setIsPolling(riotData.is_polling);
        }
      } catch (e) {
        console.warn('Could not load Riot config:', e);
      }
    };

    if (window.pywebview) {
      initTransform();
      initRiotConfig();
    } else {
      window.addEventListener('pywebviewready', () => {
        initTransform();
        initRiotConfig();
      });
      initRiotConfig();
    }

    // Callback nhận thông báo từ Python Backend
    window.onAppStateUpdate = (data: any) => {
      if (data?.overlay_config?.overlay_transform) {
        setTransform(data.overlay_config.overlay_transform);
      }
      if (data?.config) {
        if (data.config.riot_id) setRiotId(data.config.riot_id);
        if (data.config.api_key) {
          setHasApiKey(true);
          const k = data.config.api_key;
          setApiKeyMasked(k.length > 10 ? `${k.slice(0, 6)}...${k.slice(-4)}` : k);
        }
      }
      if (data?.is_polling !== undefined) {
        setIsPolling(data.is_polling);
      }
      if (data?.fetch_status) {
        setIsFetchingRiot(false);
        if (data.fetch_status.success) {
          setToastMessage(data.fetch_status.message || 'Đã nạp trận mới nhất');
          setShowSuccessToast(true);
          setShowErrorToast(false);
          setTimeout(() => setShowSuccessToast(false), 4000);
        } else {
          setErrorMessage(data.fetch_status.error || 'Lỗi khi kết nối Riot API');
          setShowErrorToast(true);
          setTimeout(() => setShowErrorToast(false), 7000);
        }
      }
      if (data?.active_match) {
        setToastMessage(`Trận mới: ${data.active_match.match_id || 'Đã đồng bộ'}`);
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 3000);
      }
    };

    // Kết nối WS cục bộ để nhận thông báo OVERLAY_RENDERED
    // (chỉ để hiển thị trạng thái OBS connected, không dùng cho multi-client sync)
    let socket: WebSocket | null = null;
    let reconnectTimer: any = null;

    const connectWs = () => {
      try {
        socket = new WebSocket('ws://127.0.0.1:8080/ws');

        socket.onopen = () => {
          setObsConnected(true);
        };

        socket.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'INITIAL_STATE') {
              if (msg.overlay_config?.overlay_transform) {
                setTransform(msg.overlay_config.overlay_transform);
              }
            } else if (msg.type === 'OVERLAY_RENDERED') {
              const src = msg.source ? ` (${msg.source})` : '';
              setToastMessage(`Overlay cập nhật: ${msg.match_id || 'OK'}${src}`);
              setToastDuration('instant');
              setShowSuccessToast(true);
              setTimeout(() => setShowSuccessToast(false), 3500);
            }
          } catch (e) {}
        };

        socket.onclose = () => {
          setObsConnected(false);
          reconnectTimer = setTimeout(connectWs, 1500);
        };

        socket.onerror = () => {
          if (socket) socket.close();
        };
      } catch (e) {
        setObsConnected(false);
        reconnectTimer = setTimeout(connectWs, 2000);
      }
    };

    // Chỉ kết nối WS khi chạy trên HTTP (không phải file://)
    if (window.location.protocol.startsWith('http')) {
      connectWs();
    }

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) socket.close();
      window.removeEventListener('pywebviewready', initTransform);
    };
  }, []);

  const updateParam = (key: keyof TransformState, value: number) => {
    setTransform(prev => {
      const next = { ...prev, [key]: value };
      if (lockAspect && key === 'zoomX') {
        next.zoomY = value;
      } else if (lockAspect && key === 'zoomY') {
        next.zoomX = value;
      }
      return next;
    });
  };

  const handleResetTransform = () => {
    setTransform(prev => ({
      ...prev,
      posX: 0,
      posY: 0,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      zoomX: 100,
      zoomY: 100,
    }));
  };

  const handleResetCrop = () => {
    setTransform(prev => ({
      ...prev,
      cropTop: 0,
      cropBottom: 0,
      cropLeft: 0,
      cropRight: 0,
    }));
  };

  const handleResetAll = () => {
    setTransform(DEFAULT_STATE);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!scrubbingParam || !scrubStartRef.current) return;

      if (rafIdRef.current !== null) return;

      const currentX = e.clientX;
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        if (!scrubbingParam || !scrubStartRef.current) return;

        const deltaX = currentX - scrubStartRef.current.x;
        let step = 1;
        if (e.shiftKey) step = 5;
        if (e.altKey) step = 0.1;

        const raw = scrubStartRef.current.initialVal + Math.round(deltaX * 0.5) * step;
        let clamped = raw;

        if (scrubbingParam.startsWith('crop')) {
          clamped = Math.min(80, Math.max(0, Math.round(raw)));
        } else if (scrubbingParam.startsWith('zoom')) {
          clamped = Math.min(300, Math.max(10, Math.round(raw)));
        } else if (scrubbingParam.startsWith('rot')) {
          clamped = Math.min(180, Math.max(-180, Math.round(raw)));
        } else if (scrubbingParam.startsWith('pos')) {
          clamped = Math.min(200, Math.max(-200, Math.round(raw)));
        }

        updateParam(scrubbingParam, clamped);
      });
    };

    const handleMouseUp = () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      setScrubbingParam(null);
    };

    if (scrubbingParam) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [scrubbingParam, lockAspect]);

  // Cập nhật Riot ID & Kích hoạt Fetch trận mới
  const handleUpdateRiotId = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!riotId.trim() || isFetchingRiot) return;
    setIsFetchingRiot(true);
    setShowErrorToast(false);
    try {
      if (window.pywebview?.api?.update_riot_id) {
        const res = await window.pywebview.api.update_riot_id(riotId.trim());
        if (res && !res.success && res.error) {
          setErrorMessage(res.error);
          setShowErrorToast(true);
          setIsFetchingRiot(false);
        }
      } else {
        const res = await fetch('/api/riot/fetch', { method: 'POST' }).then(r => r.json());
        if (res && !res.success && res.error) {
          setErrorMessage(res.error);
          setShowErrorToast(true);
          setIsFetchingRiot(false);
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Không thể kết nối Riot API');
      setShowErrorToast(true);
      setIsFetchingRiot(false);
    }
  };

  // Bật/tắt Auto Polling Live In-Game Tracker
  const handleTogglePolling = async () => {
    try {
      const nextPolling = !isPolling;
      if (window.pywebview?.api?.set_auto_polling) {
        const res = await window.pywebview.api.set_auto_polling(nextPolling, 30);
        setIsPolling(res);
      } else {
        setIsPolling(nextPolling);
      }
      setToastMessage(nextPolling ? '🟢 Đã BẬT Live Tracker (30s)' : '⚪ Đã TẮT Live Tracker');
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    } catch (e) {
      console.warn('Could not toggle polling:', e);
    }
  };

  // Lưu API Key mới vào .env
  const handleSaveApiKey = async () => {
    if (!newApiKeyInput.trim()) return;
    try {
      if (window.pywebview?.api?.update_api_key) {
        const res = await window.pywebview.api.update_api_key(newApiKeyInput.trim());
        if (res && res.success) {
          setHasApiKey(true);
          const k = newApiKeyInput.trim();
          setApiKeyMasked(k.length > 10 ? `${k.slice(0, 6)}...${k.slice(-4)}` : k);
          setIsKeyModalOpen(false);
          setNewApiKeyInput('');
          setToastMessage('✓ Đã cập nhật API Key mới!');
          setShowSuccessToast(true);
          setShowErrorToast(false);
          handleUpdateRiotId();
        } else {
          setErrorMessage(res?.error || 'Lỗi khi lưu API Key');
          setShowErrorToast(true);
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Lỗi khi lưu API Key');
      setShowErrorToast(true);
    }
  };

  // Thực thi Render Overlay
  const handleTriggerRender = async () => {
    if (isRendering) return;

    setIsRendering(true);
    setRenderProgress(20);
    setShowSuccessToast(false);

    const startTime = performance.now();

    try {
      if (window.pywebview?.api?.render_overlay) {
        // Chế độ Desktop: gọi trực tiếp Python API
        setRenderProgress(45);
        const res = await window.pywebview.api.render_overlay(transform);
        const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(2);

        setRenderProgress(100);
        setTimeout(() => {
          setIsRendering(false);
          if (res?.success) {
            setToastMessage(`✓ Overlay rendered: ${res.match_id} (${res.mode})`);
            setToastDuration(`${elapsedSec}s`);
            setShowSuccessToast(true);
            setIsVisible(true);
            setTimeout(() => setShowSuccessToast(false), 4500);
          } else {
            alert('Render Error: ' + (res?.error || 'Unknown error'));
          }
        }, 300);
      } else {
        // Chế độ Browser: gọi REST API localhost
        setRenderProgress(40);
        const res = await fetch('/api/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transform }),
        }).then(r => r.json());

        const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(2);
        setRenderProgress(100);
        setTimeout(() => {
          setIsRendering(false);
          if (res?.success) {
            setToastMessage(`✓ Overlay rendered: ${res.match_id || 'OK'}`);
            setToastDuration(`${elapsedSec}s`);
            setShowSuccessToast(true);
            setIsVisible(true);
            setTimeout(() => setShowSuccessToast(false), 4500);
          } else {
            alert('Render Error: ' + (res?.error || 'Unknown error'));
          }
        }, 300);
      }
    } catch (err: any) {
      setIsRendering(false);
      alert('Exception: ' + (err?.message || err));
    }
  };

  const handleToggleVisibility = async () => {
    const nextVis = !isVisible;
    setIsVisible(nextVis);
    if (window.pywebview?.api?.toggle_overlay_visibility) {
      try {
        await window.pywebview.api.toggle_overlay_visibility(nextVis);
      } catch (e) {
        console.warn('Toggle overlay error:', e);
      }
    }
  };

  const handleClose = async () => {
    setIsClosed(true);
    if (window.pywebview?.api?.close_panel) {
      try {
        await window.pywebview.api.close_panel();
      } catch (e) {
        console.warn('Close error:', e);
      }
    }
  };

  const startScrub = (key: keyof TransformState, e: React.MouseEvent) => {
    e.preventDefault();
    setScrubbingParam(key);
    scrubStartRef.current = {
      x: e.clientX,
      initialVal: transform[key],
    };
  };

  if (isClosed) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-zinc-950 rounded-xl border border-zinc-800 shadow-2xl">
        <div className="text-zinc-400 text-sm mb-3 font-medium flex items-center gap-2">
          <Sliders className="w-4 h-4 text-zinc-500" />
          <span>TFT Post-Match Studio — Closed</span>
        </div>
        <button
          onClick={() => setIsClosed(false)}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-md border border-zinc-700 transition-all shadow-md flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
          Reopen Panel
        </button>
      </div>
    );
  }

  return (
    <div className={`w-[460px] max-w-full bg-zinc-900/95 text-zinc-200 rounded-xl border border-zinc-800 shadow-2xl overflow-hidden backdrop-blur-md select-none font-sans transition-all ${!isVisible ? 'opacity-60' : 'opacity-100'}`}>

      {/* 1. Header */}
      <div className="px-3.5 py-2.5 bg-zinc-950/80 border-b border-zinc-800/80 flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isVisible ? 'bg-blue-500 animate-pulse' : 'bg-amber-500'}`} />
            <h1 className="text-xs font-bold text-zinc-100 uppercase tracking-wider leading-none">
              TFT POST-MATCH STUDIO
            </h1>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleResetAll}
              title="Reset All Parameters"
              className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 rounded transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleClose}
              title="Close Panel"
              className="p-1 text-zinc-400 hover:text-red-400 hover:bg-zinc-800/80 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* OBS Status Bar */}
        <div className="flex items-center justify-between pt-1 mt-0.5 border-t border-zinc-800/60">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono">
            <Monitor className="w-3 h-3" />
            <span className={obsConnected ? 'text-emerald-400' : 'text-zinc-500'}>
              {obsConnected ? '● Server Online' : '○ Connecting...'}
            </span>
            <span className="text-zinc-600">|</span>
            <span
              className="text-blue-400 hover:text-blue-300 cursor-pointer transition-colors"
              title="OBS Browser Source URL — Click to copy"
              onClick={() => {
                navigator.clipboard?.writeText(obsUrl).catch(() => {});
              }}
            >
              {obsUrl}
            </span>
          </div>
          <span className="text-[9px] font-mono text-zinc-500 tracking-tight italic">
            Standalone v3.0
          </span>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Riot Live In-Game Tracker Section */}
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-2.5 flex flex-col gap-2 shadow-inner">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              <span>Riot Live In-Game Tracker</span>
            </div>

            <button
              type="button"
              onClick={handleTogglePolling}
              title="Tự động kiểm tra trận mới ngầm mỗi 30s khi ván đấu kết thúc"
              className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 border transition-all ${
                isPolling
                  ? 'bg-emerald-950/60 border-emerald-600/70 text-emerald-400 animate-pulse'
                  : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-400'
              }`}
            >
              <Radio className="w-3 h-3" />
              <span>{isPolling ? 'AUTO 30s: BẬT' : 'AUTO: TẮT'}</span>
            </button>
          </div>

          {/* Riot ID Input & Fetch Button */}
          <form onSubmit={handleUpdateRiotId} className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <User className="w-3.5 h-3.5 text-zinc-500 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={riotId}
                onChange={(e) => setRiotId(e.target.value)}
                placeholder="Riot ID (vd: Bí Ẹo#VN2)"
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 pl-7 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isFetchingRiot}
              className={`px-3 py-1 rounded text-xs font-medium border flex items-center gap-1 transition-all ${
                isFetchingRiot
                  ? 'bg-blue-950 border-blue-800 text-blue-300 cursor-wait'
                  : 'bg-blue-600/90 hover:bg-blue-600 border-blue-500 text-white shadow-sm'
              }`}
            >
              <RefreshCw className={`w-3 h-3 ${isFetchingRiot ? 'animate-spin' : ''}`} />
              <span>{isFetchingRiot ? 'Đang quét...' : 'Lấy Trận'}</span>
            </button>
          </form>

          {/* API Key Status Pill & Quick Update */}
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-0.5 border-t border-zinc-800/60">
            <div className="flex items-center gap-1">
              <Key className="w-3 h-3 text-zinc-500" />
              <span>Key:</span>
              <span className={hasApiKey ? 'text-zinc-400' : 'text-amber-400'}>
                {apiKeyMasked || '(Chưa có key)'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsKeyModalOpen(!isKeyModalOpen)}
              className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
            >
              {isKeyModalOpen ? 'Đóng' : 'Đổi API Key (24h)'}
            </button>
          </div>

          {/* Inline API Key Input */}
          {isKeyModalOpen && (
            <div className="mt-1 p-2 bg-zinc-900/90 border border-zinc-700/80 rounded flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>Dán Riot API Key mới (RGAPI-...):</span>
                <a
                  href="https://developer.riotgames.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:underline text-[9px]"
                >
                  Lấy key tại Riot ↗
                </a>
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newApiKeyInput}
                  onChange={(e) => setNewApiKeyInput(e.target.value)}
                  placeholder="RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200 placeholder:text-zinc-600 font-mono focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleSaveApiKey}
                  className="px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium"
                >
                  Lưu
                </button>
              </div>
            </div>
          )}

          {/* Error Message Toast in Card */}
          {showErrorToast && (
            <div className="p-2 bg-red-950/60 border border-red-800/80 rounded text-[11px] text-red-300 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block">Lỗi kết nối Riot API:</span>
                <span className="text-[10px] text-red-300/90 font-mono leading-tight block">{errorMessage}</span>
                {(errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('hết hạn')) && (
                  <button
                    type="button"
                    onClick={() => setIsKeyModalOpen(true)}
                    className="mt-1 text-[10px] text-amber-300 font-semibold underline block hover:text-amber-200"
                  >
                    👉 Khóa API Key đã hết hạn. Bấm vào đây để dán khóa mới!
                  </button>
                )}
              </div>
              <button onClick={() => setShowErrorToast(false)} className="text-red-400 hover:text-red-200">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Hidden Indicator */}
        {!isVisible && (
          <div className="bg-amber-950/40 border border-amber-800/50 text-amber-300 text-[11px] px-3 py-1.5 rounded-md flex items-center justify-between font-mono">
            <div className="flex items-center gap-1.5">
              <EyeOff className="w-3.5 h-3.5 text-amber-400" />
              <span>Overlay Hidden from Stream Output</span>
            </div>
          </div>
        )}

        {/* 2. Transform Controls */}
        <div className="bg-zinc-950/50 rounded-lg p-2.5 border border-zinc-800/80 space-y-2">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1.5">
            <span className="text-[11px] font-semibold text-zinc-200 tracking-wide flex items-center gap-1.5">
              <Sliders className="w-3 h-3 text-blue-400" />
              Transform
            </span>
            <button
              onClick={handleResetTransform}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 font-mono transition-colors"
            >
              Reset Transform
            </button>
          </div>

          {/* Position Section */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Position</div>
            <div className="grid grid-cols-2 gap-2">
              <ControlRow
                label="Pos X"
                value={transform.posX}
                min={-200}
                max={200}
                unit="px"
                onChange={v => updateParam('posX', v)}
                onScrubStart={e => startScrub('posX', e)}
              />
              <ControlRow
                label="Pos Y"
                value={transform.posY}
                min={-200}
                max={200}
                unit="px"
                onChange={v => updateParam('posY', v)}
                onScrubStart={e => startScrub('posY', e)}
              />
            </div>
          </div>

          {/* Rotation Section */}
          <div className="space-y-1.5 pt-1">
            <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Rotation</div>
            <div className="grid grid-cols-3 gap-1.5">
              <ControlRow
                label="Rot X"
                value={transform.rotX}
                min={-180}
                max={180}
                unit="°"
                onChange={v => updateParam('rotX', v)}
                onScrubStart={e => startScrub('rotX', e)}
              />
              <ControlRow
                label="Rot Y"
                value={transform.rotY}
                min={-180}
                max={180}
                unit="°"
                onChange={v => updateParam('rotY', v)}
                onScrubStart={e => startScrub('rotY', e)}
              />
              <ControlRow
                label="Rot Z"
                value={transform.rotZ}
                min={-180}
                max={180}
                unit="°"
                onChange={v => updateParam('rotZ', v)}
                onScrubStart={e => startScrub('rotZ', e)}
              />
            </div>
          </div>

          {/* Zoom Section */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Zoom</span>
              <button
                onClick={() => setLockAspect(!lockAspect)}
                title={lockAspect ? 'Unlock Aspect Ratio' : 'Lock Aspect Ratio'}
                className={`p-0.5 rounded text-[10px] transition-colors flex items-center gap-1 font-mono ${
                  lockAspect ? 'text-blue-400 bg-blue-950/40 border border-blue-800/50' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {lockAspect ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
                <span>{lockAspect ? 'Locked' : 'Independent'}</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ControlRow
                label="Zoom X"
                value={transform.zoomX}
                min={10}
                max={300}
                unit="%"
                onChange={v => updateParam('zoomX', v)}
                onScrubStart={e => startScrub('zoomX', e)}
              />
              <ControlRow
                label="Zoom Y"
                value={transform.zoomY}
                min={10}
                max={300}
                unit="%"
                onChange={v => updateParam('zoomY', v)}
                onScrubStart={e => startScrub('zoomY', e)}
              />
            </div>
          </div>
        </div>

        {/* 3. Crop Controls */}
        <div className="bg-zinc-950/50 rounded-lg p-2.5 border border-zinc-800/80 space-y-2">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1.5">
            <span className="text-[11px] font-semibold text-zinc-200 tracking-wide flex items-center gap-1.5">
              <CropIcon className="w-3 h-3 text-cyan-400" />
              Crop
            </span>
            <button
              onClick={handleResetCrop}
              className="text-[10px] text-zinc-400 hover:text-cyan-300 font-mono transition-colors flex items-center gap-1 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              Reset Crop
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <ControlRow
              label="Top"
              value={transform.cropTop}
              min={0}
              max={80}
              unit="%"
              onChange={v => updateParam('cropTop', v)}
              onScrubStart={e => startScrub('cropTop', e)}
            />
            <ControlRow
              label="Bottom"
              value={transform.cropBottom}
              min={0}
              max={80}
              unit="%"
              onChange={v => updateParam('cropBottom', v)}
              onScrubStart={e => startScrub('cropBottom', e)}
            />
            <ControlRow
              label="Left"
              value={transform.cropLeft}
              min={0}
              max={80}
              unit="%"
              onChange={v => updateParam('cropLeft', v)}
              onScrubStart={e => startScrub('cropLeft', e)}
            />
            <ControlRow
              label="Right"
              value={transform.cropRight}
              min={0}
              max={80}
              unit="%"
              onChange={v => updateParam('cropRight', v)}
              onScrubStart={e => startScrub('cropRight', e)}
            />
          </div>
        </div>

        {/* Toast Notification */}
        {showSuccessToast && (
          <div className="bg-emerald-950/80 border border-emerald-700/60 text-emerald-200 text-[11px] px-3 py-1.5 rounded-md flex items-center justify-between font-mono animate-fade-in shadow-lg">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{toastMessage}</span>
            </div>
            <span className="text-[9px] text-emerald-400/80">{toastDuration}</span>
          </div>
        )}

        {/* 4. Main Action Controls */}
        <div className="pt-1">
          <div className="grid grid-cols-3 gap-2">
            {/* Render Button */}
            <button
              onClick={handleTriggerRender}
              disabled={isRendering}
              className={`relative overflow-hidden py-2 px-3 rounded-md text-xs font-semibold tracking-wide transition-all shadow-md flex items-center justify-center gap-1.5 border ${
                isRendering
                  ? 'bg-blue-950 border-blue-700 text-blue-200 cursor-wait'
                  : 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white border-blue-500 shadow-blue-950/50'
              }`}
            >
              {isRendering ? (
                <>
                  <div
                    className="absolute inset-0 bg-blue-500/30 transition-all duration-150"
                    style={{ width: `${renderProgress}%` }}
                  />
                  <RefreshCw className="w-3.5 h-3.5 animate-spin z-10 text-blue-200" />
                  <span className="z-10 font-mono text-[11px]">{renderProgress}%</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Render</span>
                </>
              )}
            </button>

            {/* Xem / Ẩn Cửa Sổ Preview */}
            <button
              onClick={handleToggleVisibility}
              title={isVisible ? "Ẩn cửa sổ xem trước trên màn hình" : "Mở cửa sổ xem trước Overlay trên màn hình"}
              className={`py-2 px-3 rounded-md text-xs font-medium tracking-wide transition-all flex items-center justify-center gap-1.5 border ${
                isVisible
                  ? 'bg-blue-950/60 hover:bg-blue-900/60 text-blue-300 border-blue-700/80'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
              }`}
            >
              {isVisible ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-blue-400" />
                  <span>Ẩn Preview</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Xem Preview</span>
                </>
              )}
            </button>

            {/* Close Button */}
            <button
              onClick={handleClose}
              className="py-2 px-3 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-850 text-zinc-300 hover:text-white rounded-md text-xs font-medium border border-zinc-700 transition-all flex items-center justify-center gap-1.5"
            >
              <X className="w-3.5 h-3.5 text-zinc-400" />
              <span>Close</span>
            </button>
          </div>

          {/* OBS Setup Hint */}
          <div className="mt-2 text-[10px] font-mono text-zinc-600 text-center">
            OBS → Add Browser Source →{' '}
            <span
              className="text-blue-500 cursor-pointer hover:text-blue-400"
              onClick={() => navigator.clipboard?.writeText(obsUrl).catch(() => {})}
              title="Click to copy OBS URL"
            >
              {obsUrl}
            </span>
            {' '}(1920×1080)
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact Horizontal Control Row Component
interface ControlRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (val: number) => void;
  onScrubStart: (e: React.MouseEvent) => void;
}

function ControlRow({
  label,
  value,
  min,
  max,
  unit,
  onChange,
  onScrubStart,
}: ControlRowProps) {
  return (
    <div className="flex items-center gap-1.5 bg-zinc-900/80 px-2 py-1 rounded border border-zinc-800/80 hover:border-zinc-700/80 transition-colors">
      <span
        onMouseDown={onScrubStart}
        title="Click & drag left/right to scrub value"
        className="text-[10px] font-mono text-zinc-400 shrink-0 cursor-ew-resize hover:text-blue-400 transition-colors select-none"
      >
        {label}
      </span>

      <input
        type="range"
        min={min}
        max={max}
        step={unit === '°' ? 1 : 1}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
      />

      <span className="text-[10px] font-mono text-zinc-300 w-9 text-right shrink-0">
        {Math.round(value)}
        {unit}
      </span>
    </div>
  );
}
