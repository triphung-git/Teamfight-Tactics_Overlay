import SourceTransformPanel from './components/SourceTransformPanel';

export default function App() {
  return (
    <div className="relative size-full min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 overflow-hidden select-none">
      {/* Subtle Desktop Studio Grid Background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.15]"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.15) 0%, transparent 60%),
            linear-gradient(to right, #27272a 1px, transparent 1px),
            linear-gradient(to bottom, #27272a 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 32px 32px, 32px 32px',
        }}
      />

      {/* Control Panel Container */}
      <main className="relative z-10 my-auto">
        <SourceTransformPanel />
      </main>

      {/* Studio Workspace Footer Indicator */}
      <footer className="absolute bottom-3 right-4 z-0 text-[10px] font-mono text-zinc-600 flex items-center gap-3 pointer-events-none">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Engine Active
        </span>
        <span>Studio Suite v2.4</span>
      </footer>
    </div>
  );
}
