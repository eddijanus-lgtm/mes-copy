import { cloneElement, isValidElement, useId } from "react";

export default function FormField({ children, error, hint, label, required = false }) {
  const generatedId = useId();
  const fieldId = isValidElement(children) && children.props.id ? children.props.id : generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
      id: fieldId,
      "aria-describedby": describedBy,
      "aria-invalid": error ? true : undefined,
      required: required || children.props.required,
    })
    : children;

  return (
    <label className="ds-field" htmlFor={fieldId}>
      <span className="ds-field__label">{label}{required ? " *" : ""}</span>
      {control}
      {hint ? <span className="ds-field__hint" id={hintId}>{hint}</span> : null}
      {error ? <span className="ds-field__error" id={errorId}>{error}</span> : null}
    </label>
  );
}
