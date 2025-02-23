// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';

import './Placeholder.less';

function getPlaceholder(rowCount: any, className: any) {
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
    rows.push(<div className="place__line" key={i} />);
  }
  const clazz = `place ${className == null ? '' : className}`;
  return (
    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
    <div className={clazz}>
      // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
      <div className="place__circle" />
      // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
      <div className="place__place_lines_wrapper">{rows}</div>
    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
    </div>
  );
}

export default function Placeholder({
  rows = 3,
  ready = false,
  children,
  customPlaceholder,
  className
}: any) {
  if (!ready) {
    if (customPlaceholder != null) {
      return customPlaceholder;
    }

    return getPlaceholder(rows, className);
  }

  return children;
}
