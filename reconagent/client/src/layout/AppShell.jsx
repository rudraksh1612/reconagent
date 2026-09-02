const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard" },
  { key: "recon", label: "Recon", icon: "sync_alt" },
  { key: "qa", label: "Q&A", icon: "chat_bubble" },
  { key: "forecast", label: "Forecast", icon: "query_stats" },
];

function Icon({ name, filled = false, className = "" }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
    >
      {name}
    </span>
  );
}

export default function AppShell({ active, onChange, llmStatus, children }) {
  return (
    <div className="min-h-full bg-background text-on-background font-body-md">
      {/* TopAppBar */}
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-margin-mobile md:px-margin-desktop h-16 bg-surface border-b border-outline-variant">
        <div className="flex items-center gap-md">
          <Icon name="account_balance" filled className="text-primary text-2xl" />
          <h1 className="text-headline-md font-headline-md font-bold text-primary">ReconAgent</h1>
        </div>
        <div className="flex items-center gap-sm">
          {llmStatus && (
            <span
              className={`hidden sm:inline-flex items-center gap-xs text-label-caps font-label-caps px-sm py-xs rounded-sm border ${
                llmStatus.llmConfigured
                  ? "border-secondary text-secondary bg-secondary-container/30"
                  : "border-tertiary-fixed-dim text-on-tertiary-container bg-tertiary-fixed/40"
              }`}
            >
              <Icon name={llmStatus.llmConfigured ? "bolt" : "build"} className="text-[14px]" />
              {llmStatus.llmConfigured ? llmStatus.model : "heuristic fallback"}
            </span>
          )}
          <button className="p-2 rounded-full hover:bg-surface-container-low transition-colors">
            <Icon name="notifications" className="text-primary" />
          </button>
        </div>
      </header>

      {/* SideNav — desktop */}
      <nav className="hidden md:flex flex-col fixed top-16 left-0 w-64 h-[calc(100vh-64px)] bg-surface border-r border-outline-variant px-md py-lg gap-sm z-40">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`flex items-center gap-md px-4 py-3 rounded-lg transition-colors text-left ${
              active === item.key
                ? "bg-secondary-container text-on-secondary-container font-medium"
                : "text-on-surface-variant hover:bg-surface-container-low"
            }`}
          >
            <Icon name={item.icon} filled={active === item.key} />
            <span className="font-body-md text-body-md">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Main content */}
      <main className="pt-16 pb-24 md:pb-8 md:ml-64 px-margin-mobile md:px-margin-desktop max-w-[1440px] mx-auto min-h-full">
        {children}
      </main>

      {/* BottomNav — mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-xs pb-safe h-20 bg-surface border-t border-outline-variant">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`flex flex-col items-center justify-center px-4 py-1 rounded-lg transition-colors ${
              active === item.key
                ? "bg-secondary-container text-on-secondary-container rounded-full scale-95"
                : "text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            <Icon name={item.icon} filled={active === item.key} className="mb-1" />
            <span className="text-label-caps font-label-caps">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export { Icon };
