import React from "react";

// Wraps a row that is flex on small screens and grid on lg screens
// count sets the number of equal columns on lg for perfect dot/date alignment
export default function AxisLayout({ count, className = "", style = {}, children }) {
  const gridTemplateColumns = `repeat(${count}, minmax(0, 1fr))`;
  return (
    <div className={`flex lg:grid ${className}`} style={{ gridTemplateColumns, ...style }}>
      {children}
    </div>
  );
}
