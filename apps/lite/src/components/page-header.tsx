/**
 * Shared header for the three main pages. Styling copied verbatim from the Points / Liquidations pages:
 * font-pixel title + max-w-2xl description, left-aligned within a max-w-7xl container.
 */
export function PageHeader({ title, subtitle, hint }: { title: string; subtitle: string; hint?: string }) {
  return (
    <div className="text-primary-foreground mx-auto w-full max-w-7xl px-2 pb-4 pt-10 lg:px-8">
      <h1 className="font-pixel text-3xl tracking-wide md:text-4xl">{title}</h1>
      <p className="text-secondary-foreground mt-3 max-w-2xl font-light">{subtitle}</p>
      {hint ? <p className="text-secondary-foreground mt-1 max-w-2xl font-light">{hint}</p> : null}
    </div>
  );
}
