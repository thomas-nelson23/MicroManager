/** The app bar's wordmark and top-level tabs, shared by the pages that aren't a single project. */
export type AppSection = "projects" | "requests";

export function AppNav({ current, navigate }: { current: AppSection; navigate: (to: string) => void }) {
  const link = (to: string, section: AppSection, label: string) => (
    <a
      href={to}
      className={current === section ? "current" : ""}
      aria-current={current === section ? "page" : undefined}
      onClick={(e) => { e.preventDefault(); navigate(to); }}
    >
      {label}
    </a>
  );
  return (
    <header className="appbar">
      <span className="wordmark">Micro<b>Manager</b></span>
      <nav aria-label="Sections">
        {link("/", "projects", "Projects")}
        {link("/requests", "requests", "Feature requests")}
      </nav>
    </header>
  );
}
