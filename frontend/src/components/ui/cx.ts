/** Join class names, skipping falsy entries. */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** The one focus ring every interactive primitive uses (docs/design.md §8). */
export const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** The same ring for a label that wraps a visually hidden input (radio, checkbox). */
export const focusRingWithin =
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

const base =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control font-medium whitespace-nowrap transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent/90",
  secondary: "border border-line-strong bg-panel text-ink hover:bg-raised",
  ghost: "text-ink-2 hover:bg-raised hover:text-ink",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-label",
  md: "h-8 px-3 text-body",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md") {
  return cx(base, variants[variant], sizes[size], focusRing);
}
