/*
  Global footer (SPEC §4.1 v1.7): the compliance + risk line every page carries, and the thin
  fixed spacer bar the layout already relied on.
*/
export function Footer() {
  return (
    <>
      <p className="text-secondary-foreground mx-auto max-w-4xl px-4 pb-6 pt-10 text-center text-[11px] font-light">
        Solon is not offered to persons or entities in the United States, China, or sanctioned jurisdictions. Pre-audit
        software — use at your own risk.
      </p>
      <div className="bg-primary fixed bottom-0 z-[51] h-[12px] w-full overflow-visible" />
    </>
  );
}
