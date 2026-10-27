import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from "react";

import { buttonClass, cx, type ButtonSize, type ButtonVariant } from "./cx";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cx(buttonClass(variant, size), className)} {...rest} />
  );
});

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** A link that looks like a button (downloads, external docs). */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { variant = "secondary", size = "md", className, ...rest },
  ref,
) {
  return <a ref={ref} className={cx(buttonClass(variant, size), className)} {...rest} />;
});
