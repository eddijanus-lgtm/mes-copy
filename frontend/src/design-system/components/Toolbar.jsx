export default function Toolbar({ children, className = "" }) {
  return <div className={`ds-toolbar ${className}`.trim()}>{children}</div>;
}
