/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { SideSheet, Button } from '@douyinfe/semi-ui-19';

import { useTranslation } from '../../services/i18n/i18n.jsx';

import './FilterDrawer.less';

/**
 * The drawer a page's filters live in.
 *
 * Shared by the listings and the jobs pages so that "where are the filters" has one answer and one
 * shape wherever you are, rather than a row of controls on one page and a drawer on the other.
 *
 * @param {Object} props
 * @param {boolean} props.visible
 * @param {() => void} props.onClose
 * @param {number} props.activeCount
 * @param {() => void} props.onClearAll
 * @param {React.ReactNode} props.children One or more {@link FilterGroup}.
 * @returns {React.ReactElement}
 */
export default function FilterDrawer({ visible, onClose, activeCount, onClearAll, children }) {
  const t = useTranslation();

  return (
    <SideSheet
      title={t('listings.filtersTitle')}
      visible={visible}
      onCancel={onClose}
      placement="right"
      width={360}
      className="filterDrawer"
      footer={
        <div className="filterDrawer__footer">
          <Button theme="borderless" disabled={activeCount === 0} onClick={onClearAll}>
            {t('listings.filterClearAll')}
          </Button>
          <Button theme="solid" type="primary" onClick={onClose}>
            {t('listings.filtersDone')}
          </Button>
        </div>
      }
    >
      {children}
    </SideSheet>
  );
}

FilterDrawer.displayName = 'FilterDrawer';

/**
 * One labelled block of filters inside the drawer.
 *
 * @param {Object} props
 * @param {string} props.title
 * @param {React.ReactNode} props.children
 * @returns {React.ReactElement}
 */
export function FilterGroup({ title, children }) {
  return (
    <div className="filterDrawer__group">
      <h4 className="filterDrawer__groupTitle">{title}</h4>
      {children}
    </div>
  );
}

FilterGroup.displayName = 'FilterGroup';

/**
 * Explanatory text for a control, in the room the drawer has and the topbar did not.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @returns {React.ReactElement}
 */
export function FilterHelp({ children }) {
  return <p className="filterDrawer__help">{children}</p>;
}

FilterHelp.displayName = 'FilterHelp';
