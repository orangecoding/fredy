import React from 'react';

import './Placeholder.less';

function getPlaceholder(rowCount, className) {
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    rows.push(<div className="place__line" key={i} />);
  }
  const clazz = `place ${className == null ? '' : className}`;
  return (
    <div className={clazz}>
      <div className="place__circle" />
      <div className="place__place_lines_wrapper">{rows}</div>
    </div>
  );
}

export default function Placeholder({ rows = 3, ready = false, children, customPlaceholder, className }) {
  if (!ready) {
    if (customPlaceholder != null) {
      return customPlaceholder;
    }

    return getPlaceholder(rows, className);
  }

  return children;
}
