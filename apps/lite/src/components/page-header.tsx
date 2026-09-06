/**
 * 三个主页面共用的标头。样式逐字沿用 Points / Liquidations 页:
 * font-pixel 标题 + max-w-2xl 说明段,左对齐在 max-w-7xl 容器内。
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
