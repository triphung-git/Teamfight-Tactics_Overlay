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
  Sparkles
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
      };
    };
  }
}

export default function SourceTransformPanel() {
  const [transform, setTransform] = useState<TransformState>(DEFAULT_STATE);
  const [lockAspect, setLockAspect] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [isClosed, setIsClosed] = useState(false);
  
  // Render process state
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('Frame render complete & synced');
  const [toastDuration, setToastDuration] = useState('1.2s');

  // Numeric scrub drag state
  const [scrubbingParam, setScrubbingParam] = useState<keyof TransformState | null>(null);
  const scrubStartRef = useRef<{ x: number; initialVal: number }>({ x: 0, initialVal: 0 });
  const rafIdRef = useRef<number | null>(null);

  // Nạp cấu hình transform đã lưu từ Python khi mở app
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

    if (window.pywebview) {
      initTransform();
    } else {
      window.addEventListener('pywebviewready', initTransform);
    }
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

      // Throttle mousemove update qua requestAnimationFrame chuẩn 60fps
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

  // Thực thi Render Overlay (Tích hợp thực tế với Python backend)
  const handleTriggerRender = async () => {
    if (isRendering) return;
    setIsRendering(true);
    setRenderProgress(20);
    setShowSuccessToast(false);

    const startTime = performance.now();

    try {
      if (window.pywebview?.api?.render_overlay) {
        setRenderProgress(45);
        const res = await window.pywebview.api.render_overlay(transform);
        const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(2);
        
        setRenderProgress(100);
        setTimeout(() => {
          setIsRendering(false);
          if (res?.success) {
            setToastMessage(`Đã Render: ${res.match_id} (${res.mode})`);
            setToastDuration(`${elapsedSec}s`);
            setShowSuccessToast(true);
            setIsVisible(true);
            setTimeout(() => setShowSuccessToast(false), 4500);
          } else {
            alert('Lỗi khi Render Overlay: ' + (res?.error || 'Không rõ'));
          }
        }, 300);
      } else {
        // Fallback simulation nếu test trên trình duyệt web thông thường
        let progress = 20;
        const interval = setInterval(() => {
          progress += 25;
          if (progress >= 100) {
            setRenderProgress(100);
            clearInterval(interval);
            setTimeout(() => {
              setIsRendering(false);
              setToastMessage('Frame render complete (Browser Simulation)');
              setToastDuration('0.05s');
              setShowSuccessToast(true);
              setTimeout(() => setShowSuccessToast(false), 3000);
            }, 300);
          } else {
            setRenderProgress(progress);
          }
        }, 150);
      }
    } catch (err: any) {
      setIsRendering(false);
      alert('Lỗi ngoại lệ: ' + (err?.message || err));
    }
  };

  // Toggle Hide / Show Overlay Window
  const handleToggleVisibility = async () => {
    const nextVis = !isVisible;
    setIsVisible(nextVis);
    if (window.pywebview?.api?.toggle_overlay_visibility) {
      try {
        await window.pywebview.api.toggle_overlay_visibility(nextVis);
      } catch (e) {
        console.warn('Lỗi toggle overlay:', e);
      }
    }
  };

  // Close Panel / App
  const handleClose = async () => {
    setIsClosed(true);
    if (window.pywebview?.api?.close_panel) {
      try {
        await window.pywebview.api.close_panel();
      } catch (e) {
        console.warn('Lỗi đóng app:', e);
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
          <span>OVERLAY POSTMATCH TFT Panel Closed</span>
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
              OVERLAY POSTMATCH TFT
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

        {/* Developed by Phung Van Tri */}
        <div className="text-right">
          <span className="text-[9px] font-mono text-zinc-500 tracking-tight italic">
            Developed by Phung Van Tri
          </span>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Hidden Indicator State Banner if Hidden */}
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

        {/* Render Status Notification Toast */}
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

            {/* Hide / Show Button */}
            <button
              onClick={handleToggleVisibility}
              className={`py-2 px-3 rounded-md text-xs font-medium tracking-wide transition-all flex items-center justify-center gap-1.5 border ${
                isVisible
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                  : 'bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border-amber-800/70'
              }`}
            >
              {isVisible ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Hide</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                  <span>Show</span>
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
