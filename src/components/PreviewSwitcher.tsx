import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  CreditCard,
  Shield,
  User,
  Lock,
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  RotateCcw,
} from 'lucide-react';

export const PreviewSwitcher: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Position coordinates (null means default CSS corner anchor)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isPaymentPage = location.pathname.startsWith('/pay');
  const isAdmin = location.pathname.startsWith('/admin');
  const isClient = location.pathname.startsWith('/client');
  const isLogin = location.pathname === '/login';

  // Dragging event listeners
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging || !dragRef.current) return;
      e.preventDefault();

      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;

      const newX = Math.max(10, Math.min(window.innerWidth - 80, dragRef.current.startPosX + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 50, dragRef.current.startPosY + dy));

      setPosition({ x: newX, y: newY });
    };

    const handlePointerUp = () => {
      if (isDragging) {
        setIsDragging(false);
        dragRef.current = null;
      }
    };

    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove, { passive: false });
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    }

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only drag from the drag handle or header
    if ((e.target as HTMLElement).closest('button:not([data-drag-handle="true"])')) {
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    const currentX = rect ? rect.left : window.innerWidth - 320;
    const currentY = rect ? rect.top : window.innerHeight - 100;

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: currentX,
      startPosY: currentY,
    };
    setIsDragging(true);
  };

  const handleResetPosition = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPosition(null);
  };

  return (
    <div
      ref={containerRef}
      id="live-preview-switcher"
      style={
        position
          ? {
              position: 'fixed',
              left: `${position.x}px`,
              top: `${position.y}px`,
              zIndex: 99999,
              touchAction: 'none',
            }
          : {
              position: 'fixed',
              bottom: '12px',
              right: '12px',
              zIndex: 99999,
              touchAction: 'none',
            }
      }
      className={`select-none font-sans transition-shadow ${
        isDragging ? 'opacity-90 shadow-2xl cursor-grabbing scale-[1.01]' : 'opacity-100'
      }`}
    >
      <div className="bg-slate-900/95 text-white backdrop-blur-md border border-slate-700/80 shadow-2xl rounded-xl overflow-hidden text-xs max-w-[340px] sm:max-w-md ring-1 ring-white/10">
        {/* Top Movable Drag Handle Bar */}
        <div
          onPointerDown={handlePointerDown}
          className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-800/90 border-b border-slate-700/60 cursor-grab active:cursor-grabbing hover:bg-slate-800 transition-colors select-none"
          title="Drag anywhere on this bar to move switcher"
        >
          <div className="flex items-center gap-2">
            <span className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-200 p-0.5">
              <GripHorizontal className="w-4 h-4" />
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-bold text-slate-200 tracking-wide uppercase">
              Preview Switcher
            </span>
          </div>

          <div className="flex items-center gap-1">
            {position && (
              <button
                type="button"
                onClick={handleResetPosition}
                className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-700/60 transition-colors"
                title="Reset Position to corner"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsMinimized(!isMinimized)}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700/60 transition-colors"
              title={isMinimized ? 'Expand bar' : 'Minimize bar'}
            >
              {isMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Quick Route Buttons (Hidden when minimized) */}
        {!isMinimized && (
          <div className="p-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => navigate('/pay/DEMO-CHALLAN?amt=1500&rem=Official%20Challan%20Fee')}
              className={`px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                isPaymentPage
                  ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
              <span>🏛️ Payment Page</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/admin/dashboard')}
              className={`px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                isAdmin
                  ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span>Admin</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/client/dashboard')}
              className={`px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                isClient
                  ? 'bg-purple-600 text-white shadow-sm ring-1 ring-purple-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              <User className="w-3.5 h-3.5 text-purple-400" />
              <span>Client</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/login')}
              className={`px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                isLogin
                  ? 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Login</span>
            </button>

            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-slate-400 hover:text-slate-200 px-2 py-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-[11px] font-medium transition-colors ml-auto cursor-pointer"
            >
              {isExpanded ? 'Less' : 'More'}
            </button>
          </div>
        )}

        {/* Expanded Options: Change Amounts / Presets for Payment Gateway Preview */}
        {!isMinimized && isExpanded && (
          <div className="p-2.5 pt-1 border-t border-slate-800 bg-slate-950/70 text-[11px] space-y-2">
            <span className="text-slate-400 block font-medium">Gateway Amount Modes:</span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => navigate('/pay/DEMO-FIXED?amt=1500&rem=Application%20Fee')}
                className="p-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-left text-slate-300 hover:text-white cursor-pointer"
              >
                Amount Set: <strong>₹1,500</strong>
              </button>
              <button
                type="button"
                onClick={() => navigate('/pay/DEMO-OPEN?amt=0')}
                className="p-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-left text-slate-300 hover:text-white cursor-pointer"
              >
                No Amount: <strong>(Custom)</strong>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
