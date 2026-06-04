/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import insufficientPermission from '../../assets/insufficient_permission.png';
import { useTranslation } from '../../services/i18n/i18n.jsx';

export default function InsufficientPermission() {
  const t = useTranslation();
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
      <img src={insufficientPermission} height={250} />
      <br />
      <h4>{t('permission.title')}</h4>
    </div>
  );
}
