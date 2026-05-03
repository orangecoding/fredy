/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import './Headline.less';

export default function Headline({ text, actions } = {}) {
  return (
    <div className="page-heading">
      <div className="page-heading__row">
        <h1 className="page-heading__title">{text}</h1>
        {actions && <div>{actions}</div>}
      </div>
      <div className="page-heading__line" />
    </div>
  );
}
