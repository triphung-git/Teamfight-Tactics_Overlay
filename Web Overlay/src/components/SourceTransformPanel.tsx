import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  X,
  Eye,
  EyeOff,
  Play,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Monitor,
  Activity,
  Radio,
  User,
  Key,
  AlertTriangle,
  Search,
  ChevronDown,
  Save,
} from 'lucide-react';

// ---- Augment types ----
interface AugmentItem {
  id: string;
  name: string;   // English name from DDragon
  image: string;  // Filename, e.g. "BronzeForLife_II.png"
}

declare global {
  interface Window {
    pywebview?: {
      api?: {
        render_overlay?: () => Promise<{
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
        get_augments_list?: () => Promise<AugmentItem[]>;
        save_custom_augments?: (augments: (string | null)[]) => Promise<any>;
      };
    };
    // Callbacks từ Python backend
    onAppStateUpdate?: (data: any) => void;
    onProgressUpdate?: (data: { pct: number; status: string }) => void;
  }
}

export default function SourceTransformPanel() {
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

  // Augments Selector State
  const [augmentsList, setAugmentsList] = useState<AugmentItem[]>([]);
  // 3 slots: each is the image filename (e.g. "BronzeForLife_II.png") or null = Auto
  const [selectedAugments, setSelectedAugments] = useState<(string | null)[]>([null, null, null]);
  const [isSavingAugments, setIsSavingAugments] = useState(false);
  const [augmentsLoaded, setAugmentsLoaded] = useState(false);

  // Nạp riot config & augments khi mở app
  useEffect(() => {
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

    // Load danh sách augments + config hiện tại
    const initAugments = async () => {
      try {
        // Load danh sách tất cả augments
        let list: AugmentItem[] = [];
        if (window.pywebview?.api?.get_augments_list) {
          list = await window.pywebview.api.get_augments_list();
        } else {
          const res = await fetch('/api/augments').then(r => r.json()).catch(() => null);
          list = res?.augments || [];
        }
        setAugmentsList(list);
        setAugmentsLoaded(true);

        // Load custom_augments hiện tại từ config
        const cfgRes = await fetch('/api/config').then(r => r.json()).catch(() => null);
        if (cfgRes?.custom_augments && Array.isArray(cfgRes.custom_augments)) {
          const slots = [0, 1, 2].map(i => {
            const v = cfgRes.custom_augments[i];
            return (typeof v === 'string' && v.trim()) ? v.trim() : null;
          });
          setSelectedAugments(slots);
        }
      } catch (e) {
        console.warn('Could not load augments:', e);
        setAugmentsLoaded(true);
      }
    };

    if (window.pywebview) {
      initRiotConfig();
      initAugments();
    } else {
      window.addEventListener('pywebviewready', () => {
        initRiotConfig();
        initAugments();
      });
      initRiotConfig();
      initAugments();
    }

    // Callback nhận thông báo từ Python Backend
    window.onAppStateUpdate = (data: any) => {
      if (data?.overlay_config?.custom_augments !== undefined) {
        const ca = data.overlay_config.custom_augments;
        if (Array.isArray(ca)) {
          const slots = [0, 1, 2].map(i => {
            const v = ca[i];
            return (typeof v === 'string' && v.trim()) ? v.trim() : null;
          });
          setSelectedAugments(slots);
        } else {
          // config không có custom_augments → tất cả Auto
          setSelectedAugments([null, null, null]);
        }
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
            if (msg.type === 'OVERLAY_RENDERED') {
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
    };
  }, []);

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

  // Lưu Augments và re-render overlay
  const handleSaveAugments = async () => {
    if (isSavingAugments) return;
    setIsSavingAugments(true);
    try {
      // selectedAugments: (string | null)[] — null = Auto
      if (window.pywebview?.api?.save_custom_augments) {
        const res = await window.pywebview.api.save_custom_augments(selectedAugments);
        if (res?.success) {
          setToastMessage('✓ Augments saved & overlay re-rendered!');
          setShowSuccessToast(true);
          setTimeout(() => setShowSuccessToast(false), 4000);
        } else {
          throw new Error(res?.error || 'Unknown error');
        }
      } else {
        // Web mode: REST API
        const res = await fetch('/api/augments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ custom_augments: selectedAugments }),
        }).then(r => r.json());
        if (res?.success) {
          setToastMessage('✓ Augments saved & overlay re-rendered!');
          setShowSuccessToast(true);
          setTimeout(() => setShowSuccessToast(false), 4000);
        } else {
          throw new Error(res?.error || 'Failed to save augments');
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save augments');
      setShowErrorToast(true);
      setTimeout(() => setShowErrorToast(false), 5000);
    } finally {
      setIsSavingAugments(false);
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
        const res = await window.pywebview.api.render_overlay();
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

  if (isClosed) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-zinc-950 rounded-xl border border-zinc-800 shadow-2xl">
        <div className="text-zinc-400 text-sm mb-3 font-medium flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" />
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
    <div className={`w-[460px] max-w-full bg-zinc-900/95 text-zinc-200 rounded-xl border border-zinc-800 shadow-2xl backdrop-blur-md select-none font-sans transition-all flex flex-col
      ${!isVisible ? 'opacity-90' : 'opacity-100'}`}
      style={{ maxHeight: '100dvh' }}
    >
      {/* 1. Header — cố định, không co rút */}
      <div className="px-3.5 py-2.5 bg-zinc-950/80 border-b border-zinc-800/80 flex flex-col gap-1 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isVisible ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500'}`} />
            <h1 className="text-xs font-bold text-zinc-100 uppercase tracking-wider leading-none">
              TFT POST-MATCH STUDIO
            </h1>
          </div>

          <div className="flex items-center gap-1">
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

      {/* Scrollable body — co dãn theo chiều cao cửa sổ */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-3"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#3f3f46 transparent',
        }}
      >
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

        {/* Augments Selection Card */}
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-2.5 flex flex-col gap-2 shadow-inner">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1.5">
            <span className="text-[11px] font-semibold text-zinc-200 tracking-wide flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Augments Selection
            </span>
            <button
              onClick={handleSaveAugments}
              disabled={isSavingAugments || !augmentsLoaded}
              className={`px-2.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 border transition-all ${
                isSavingAugments
                  ? 'bg-amber-950/60 border-amber-600/60 text-amber-300 cursor-wait'
                  : 'bg-amber-600/90 hover:bg-amber-500 border-amber-500 text-white shadow-sm'
              }`}
            >
              <Save className="w-3 h-3" />
              <span>{isSavingAugments ? 'Saving...' : 'Save & Sync'}</span>
            </button>
          </div>

          {/* 3 Augment Slot Pickers */}
          {!augmentsLoaded ? (
            <div className="flex items-center justify-center py-3 text-zinc-500 text-[11px] font-mono">
              <RefreshCw className="w-3 h-3 animate-spin mr-1.5" /> Loading augments...
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map(slotIdx => (
                <AugmentSlotPicker
                  key={slotIdx}
                  slotIndex={slotIdx}
                  augmentsList={augmentsList}
                  value={selectedAugments[slotIdx]}
                  onChange={img => {
                    setSelectedAugments(prev => {
                      const next = [...prev];
                      next[slotIdx] = img;
                      return next;
                    });
                  }}
                />
              ))}
            </div>
          )}

          <div className="text-[9px] font-mono text-zinc-600 pt-0.5 border-t border-zinc-800/40">
            Slot “Auto” uses live match augments. Save to sync overlay instantly.
          </div>
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

        {/* Main Action Controls */}
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

// ============================================================
// AugmentSlotPicker — Searchable combobox cho 1 slot lõi
// ============================================================
interface AugmentSlotPickerProps {
  slotIndex: number;
  augmentsList: AugmentItem[];
  value: string | null;          // image filename or null = Auto
  onChange: (img: string | null) => void;
}

function AugmentSlotPicker({ slotIndex, augmentsList, value, onChange }: AugmentSlotPickerProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  // Vị trí dropdown (fixed so that it escapes overflow-y-auto containers)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Tìm thông tin augment hiện tại
  const currentAug = value ? augmentsList.find(a => a.image === value) : null;

  // Filter logic: nếu có query thì tìm prefix/includes, nếu không thì hiện toàn bộ
  const filtered = useMemo((): AugmentItem[] => {
    const q = query.trim().toLowerCase();
    if (!q) return augmentsList;
    // Ưu tiên: bắt đầu bằng query
    const starts = augmentsList.filter(a => a.name.toLowerCase().startsWith(q));
    // Phụ: chứa query (nhưng không bắt đầu)
    const includes = augmentsList.filter(a =>
      !a.name.toLowerCase().startsWith(q) && a.name.toLowerCase().includes(q)
    );
    return [...starts, ...includes];
  }, [augmentsList, query]);

  // Đóng khi click ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleOpen = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownHeight = 260;
    // Mở lên nếu không đủ chỗ bên dưới
    const openUpward = spaceBelow < dropdownHeight + 8 && rect.top > dropdownHeight;
    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
    setIsOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelect = (aug: AugmentItem | null) => {
    onChange(aug?.image ?? null);
    setIsOpen(false);
    setQuery('');
  };

  const slotLabel = ['Augment I', 'Augment II', 'Augment III'][slotIndex] ?? `Slot ${slotIndex + 1}`;
  const IMG_BASE = '/TFT_DDragon/img/augment/';

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1">
      {/* Label */}
      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">{slotLabel}</span>

      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded border text-left transition-all ${ 
          isOpen
            ? 'border-amber-500/70 bg-zinc-900 ring-1 ring-amber-500/30'
            : 'border-zinc-700/80 bg-zinc-900/70 hover:border-zinc-600'
        }`}
      >
        {/* Augment icon preview */}
        {currentAug ? (
          <img
            src={`${IMG_BASE}${currentAug.image}`}
            alt={currentAug.name}
            className="w-5 h-5 rounded object-cover shrink-0"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-5 h-5 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
            <Sparkles className="w-2.5 h-2.5 text-zinc-600" />
          </div>
        )}

        {/* Name display */}
        <span className={`text-[11px] flex-1 truncate ${ currentAug ? 'text-zinc-200 font-medium' : 'text-zinc-500 italic' }`}>
          {currentAug ? currentAug.name : 'Auto (from match)'}
        </span>

        <ChevronDown className={`w-3 h-3 text-zinc-500 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown panel — fixed-positioned để thoát overflow ancestor */}
      {isOpen && (
        <div
          className="bg-zinc-950 border border-amber-600/40 rounded-lg shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
          style={{ ...dropdownStyle, maxHeight: '260px' }}
        >
          {/* Search input */}
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-zinc-800">
            <Search className="w-3 h-3 text-zinc-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search augments..."
              className="flex-1 bg-transparent text-[11px] text-zinc-200 placeholder-zinc-600 outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-zinc-600 hover:text-zinc-400">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Scrollable list */}
          <div className="overflow-y-auto flex-1" style={{ maxHeight: '196px' }}>
            {/* Auto option */}
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-zinc-800/70 transition-colors text-left border-b border-zinc-800/50 ${
                value === null ? 'bg-amber-950/40' : ''
              }`}
            >
              <div className="w-5 h-5 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                <Sparkles className="w-2.5 h-2.5 text-amber-500" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] text-amber-300 font-semibold">Auto</span>
                <span className="text-[9px] text-zinc-600 font-mono">Use live match data</span>
              </div>
              {value === null && <CheckCircle2 className="w-3 h-3 text-amber-400 ml-auto shrink-0" />}
            </button>

            {/* Augment items */}
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-[11px] text-zinc-600 font-mono">No augments found</div>
            ) : (
              filtered.map(aug => (
                <button
                  key={aug.id}
                  type="button"
                  onClick={() => handleSelect(aug)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-zinc-800/70 transition-colors text-left ${
                    value === aug.image ? 'bg-amber-950/30' : ''
                  }`}
                >
                  <img
                    src={`${IMG_BASE}${aug.image}`}
                    alt={aug.name}
                    className="w-5 h-5 rounded object-cover shrink-0"
                    onError={e => {
                      const el = e.target as HTMLImageElement;
                      el.style.display = 'none';
                    }}
                  />
                  <span className={`text-[11px] truncate ${ value === aug.image ? 'text-amber-200 font-semibold' : 'text-zinc-300' }`}>
                    {aug.name}
                  </span>
                  {value === aug.image && <CheckCircle2 className="w-3 h-3 text-amber-400 ml-auto shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
