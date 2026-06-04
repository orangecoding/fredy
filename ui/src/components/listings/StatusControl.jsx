/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState } from 'react';
import { Dropdown, Button, Tooltip } from '@douyinfe/semi-ui-19';
import { IconChevronDown } from '@douyinfe/semi-icons';

import './StatusControl.less';
import { useTranslation } from '../../services/i18n/i18n.jsx';

/**
 * @typedef {('applied'|'rejected'|'accepted'|null)} ListingStatus
 */

/**
 * Shared control for setting a listing's user-decision status
 * (Applied / Rejected / Accepted).
 *
 * Both compact (table/grid rows) and full (listing detail header) modes
 * render a Button that picks up the project's CI tokens via the
 * .status-btn classes, with a small size variant for compact contexts.
 *
 * @param {Object} props
 * @param {ListingStatus} props.status - The current status value.
 * @param {(next: ListingStatus) => void} props.onChange - Called with the new status when the user picks one.
 * @param {boolean} [props.compact=false] - When true, renders smaller for table/grid rows; full size otherwise.
 * @param {(e: React.MouseEvent) => void} [props.onTriggerClick] - Optional click handler to stop propagation on the trigger.
 */
export default function StatusControl({ status = null, onChange, compact = false, onTriggerClick }) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const STATUS_OPTIONS = [
    { value: null, label: t('listings.status.none') },
    { value: 'applied', label: t('listings.status.applied') },
    { value: 'rejected', label: t('listings.status.rejected') },
    { value: 'accepted', label: t('listings.status.accepted') },
  ];

  const STATUS_TOOLTIP = t('listings.status.tooltip');

  const optionFor = (status) => STATUS_OPTIONS.find((o) => o.value === status) ?? STATUS_OPTIONS[0];

  const current = optionFor(status);

  const handlePick = (next) => {
    setOpen(false);
    if (next === status) return;
    onChange?.(next);
  };

  const menu = (
    <Dropdown.Menu>
      {STATUS_OPTIONS.map((opt) => (
        <Dropdown.Item
          key={opt.value ?? '__none__'}
          active={opt.value === status}
          onClick={() => handlePick(opt.value)}
        >
          {opt.label}
        </Dropdown.Item>
      ))}
    </Dropdown.Menu>
  );

  const className = ['status-btn', compact ? 'status-btn--compact' : null, status ? `status-btn--${status}` : null]
    .filter(Boolean)
    .join(' ');

  const trigger = (
    <Tooltip
      content={STATUS_TOOLTIP}
      position="top"
      trigger="custom"
      visible={tooltipOpen && !open}
      onVisibleChange={setTooltipOpen}
    >
      <Button
        size={compact ? 'small' : 'default'}
        theme="borderless"
        icon={<IconChevronDown />}
        iconPosition="right"
        onMouseEnter={() => setTooltipOpen(true)}
        onMouseLeave={() => setTooltipOpen(false)}
        onClick={(e) => {
          onTriggerClick?.(e);
          setTooltipOpen(false);
          setOpen((o) => !o);
        }}
        className={className}
      >
        {status ? current.label : t('listings.status.statusLabel')}
      </Button>
    </Tooltip>
  );

  return (
    <Dropdown
      trigger="custom"
      visible={open}
      onVisibleChange={setOpen}
      onClickOutSide={() => setOpen(false)}
      position="bottom"
      render={menu}
      stopPropagation
    >
      <span className="status-btn__anchor">{trigger}</span>
    </Dropdown>
  );
}
