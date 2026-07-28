import { forwardRef } from "react";

const Button = forwardRef(function Button(
  {
    as: Component = "button",
    children,
    className = "",
    icon,
    iconOnly = false,
    size = "md",
    type = "button",
    variant = "primary",
    ...props
  },
  ref,
) {
  const classes = [
    "ds-button",
    `ds-button--${variant}`,
    `ds-button--${size}`,
    iconOnly ? "ds-button--icon-only" : "",
    className,
  ].filter(Boolean).join(" ");

  const componentProps = Component === "button" ? { type } : {};

  return (
    <Component ref={ref} className={classes} {...componentProps} {...props}>
      {icon}
      {iconOnly ? <span className="sr-only">{children}</span> : children}
    </Component>
  );
});

export default Button;
