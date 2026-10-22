/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button, Empty, Select, Table, Tooltip } from '@douyinfe/semi-ui-19';
import {
  IconDeleteStroked,
  IconEditStroked,
  IconMinusCircleStroked,
  IconPlus,
  IconSendStroked,
} from '@douyinfe/semi-icons';

import { IconCopy } from '../icons/StrokeIcons.jsx';

import { useScreenWidth } from '../../hooks/screenWidth.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import './NotificationChannelTable.less';

/**
 * The one table that renders notification channels, used by the Settings page and by the job form.
 *
 * Sharing it is deliberate. The Destination column and the visibility labels are what a user reads
 * to decide whether a channel is the right one, and two copies of that would drift apart. The two
 * places differ only in which actions they offer, which is what `actions` selects - note that the
 * job form offers `detach` (remove from this job) where Settings offers `delete` (remove from the
 * instance). Two verbs, because they are two different actions.
 *
 * Below 700px the columns collapse into a single stacked cell. A five-column table on a phone
 * either scrolls sideways, which hides the actions, or squeezes a destination into a two-character
 * column - neither is a table anyone can use.
 *
 * @param {Object} props
 * @param {Object[]} [props.channels] - Channel DTOs from `/api/notificationChannels`.
 * @param {Array<'add'|'test'|'edit'|'clone'|'delete'|'detach'>} [props.actions]
 * @param {(channel: Object) => void} [props.onAdd]
 * @param {(channel: Object) => void} [props.onTest]
 * @param {(channel: Object) => void} [props.onEdit]
 * @param {(channel: Object) => void} [props.onClone]
 * @param {(channel: Object) => void} [props.onDelete]
 * @param {(channel: Object) => void} [props.onDetach]
 * @param {boolean} [props.canManageVisibility] - Renders a control instead of a label.
 * @param {(channel: Object, visibility: string) => void} [props.onVisibilityChange]
 * @param {boolean} [props.showVisibility]
 * @param {boolean} [props.showUsage]
 * @param {React.ReactNode} [props.emptyText]
 * @returns {React.ReactElement}
 */
export default function NotificationChannelTable({
  channels = [],
  actions = ['test', 'edit', 'clone', 'delete'],
  onAdd,
  onTest,
  onEdit,
  onClone,
  onDelete,
  onDetach,
  canManageVisibility = false,
  onVisibilityChange,
  showVisibility = true,
  showUsage = true,
  emptyText,
} = {}) {
  const t = useTranslation();
  const width = useScreenWidth();
  const isNarrow = width <= 700;

  const visibilityOptions = [
    { value: 'private', label: t('notification.channels.visibilityPrivate') },
    { value: 'admin', label: t('notification.channels.visibilityAdmin') },
    { value: 'everyone', label: t('notification.channels.visibilityEveryone') },
  ];

  const visibilityLabel = (visibility) =>
    visibilityOptions.find((option) => option.value === visibility)?.label ?? visibility;

  // The i18n helper has no plural machinery, so the singular is its own key rather than a
  // "{{count}} jobs" that reads "1 jobs".
  const usageLabel = (count) => {
    if (count === 0) return t('notification.channels.usageNone');
    if (count === 1) return t('notification.channels.usageJobsOne');
    return t('notification.channels.usageJobs', { count });
  };

  const visibilityCell = (visibility, record) =>
    canManageVisibility && record.canEdit ? (
      <Select
        value={visibility}
        className="notificationChannelTable__visibility"
        onChange={(value) => onVisibilityChange?.(record, value)}
        optionList={visibilityOptions}
      />
    ) : (
      visibilityLabel(visibility)
    );

  /*
   * Quiet round icons, each named for a screen reader as well as in its tooltip. They used to be four
   * different weights - a borderless send, an outlined edit, a borderless copy, a red delete - for
   * four actions of the same rank. Only deleting a channel from the instance stays red, because it is
   * the one that cannot be taken back; "Add" in the picker is outlined, since a red button per row
   * is a page of primary actions.
   */
  const toolsCell = (record) => (
    <div className="notificationChannelTable__tools">
      {actions.includes('add') && (
        <Button theme="outline" type="tertiary" size="small" icon={<IconPlus />} onClick={() => onAdd?.(record)}>
          {t('notification.channels.add')}
        </Button>
      )}
      {actions.includes('test') && (
        <Tooltip content={t('notification.channels.actionTest')}>
          <Button
            className="notificationChannelTable__icon"
            type="tertiary"
            theme="borderless"
            size="small"
            icon={<IconSendStroked />}
            aria-label={t('notification.channels.actionTest')}
            onClick={() => onTest?.(record)}
          />
        </Tooltip>
      )}
      {actions.includes('edit') && record.canEdit && (
        <Tooltip content={t('notification.channels.actionEdit')}>
          <Button
            className="notificationChannelTable__icon"
            type="tertiary"
            theme="borderless"
            size="small"
            icon={<IconEditStroked />}
            aria-label={t('notification.channels.actionEdit')}
            onClick={() => onEdit?.(record)}
          />
        </Tooltip>
      )}
      {actions.includes('clone') && (
        <Tooltip content={t('notification.channels.actionClone')}>
          <Button
            className="notificationChannelTable__icon"
            type="tertiary"
            theme="borderless"
            size="small"
            icon={<IconCopy />}
            aria-label={t('notification.channels.actionClone')}
            onClick={() => onClone?.(record)}
          />
        </Tooltip>
      )}
      {actions.includes('detach') && (
        <Tooltip content={t('notification.channels.actionDetach')}>
          <Button
            className="notificationChannelTable__icon"
            type="tertiary"
            theme="borderless"
            size="small"
            icon={<IconMinusCircleStroked />}
            aria-label={t('notification.channels.actionDetach')}
            onClick={() => onDetach?.(record)}
          />
        </Tooltip>
      )}
      {actions.includes('delete') && record.canEdit && (
        <Tooltip
          content={
            record.usedByJobs > 0 ? t('notification.channels.deleteBlocked') : t('notification.channels.actionDelete')
          }
        >
          {/* Wrapped in a span: a disabled Button swallows the events the Tooltip listens for,
              so the explanation for why Delete is greyed out would never appear. */}
          <span>
            <Button
              className="notificationChannelTable__icon"
              type="danger"
              theme="borderless"
              size="small"
              icon={<IconDeleteStroked />}
              aria-label={t('notification.channels.actionDelete')}
              disabled={record.usedByJobs > 0}
              onClick={() => onDelete?.(record)}
            />
          </span>
        </Tooltip>
      )}
    </div>
  );

  const narrowColumns = [
    {
      title: t('notification.channels.columnName'),
      dataIndex: 'name',
      render: (name, record) => (
        <div className="notificationChannelTable__stack">
          <div className="notificationChannelTable__stackHead">
            <span className="notificationChannelTable__stackName">{name}</span>
            <span className="notificationChannelTable__type">{record.adapterName}</span>
          </div>
          <div className="notificationChannelTable__destination">{record.destination ?? '-'}</div>
          {(showVisibility || showUsage) && (
            <div className="notificationChannelTable__stackMeta">
              {showVisibility && <span>{visibilityCell(record.visibility, record)}</span>}
              {showUsage && <span>{usageLabel(record.usedByJobs ?? 0)}</span>}
            </div>
          )}
          {toolsCell(record)}
        </div>
      ),
    },
  ];

  const wideColumns = [
    { title: t('notification.channels.columnName'), dataIndex: 'name' },
    {
      title: t('notification.channels.columnType'),
      dataIndex: 'adapterName',
      // The service's name as plain words. A grey chip around it made the type look like a status.
      render: (adapterName) => <span className="notificationChannelTable__type">{adapterName}</span>,
    },
    {
      title: t('notification.channels.columnDestination'),
      dataIndex: 'destination',
      render: (destination) => (
        <span
          className="notificationChannelTable__destination notificationChannelTable__destination--cell"
          title={destination ?? undefined}
        >
          {destination ?? '-'}
        </span>
      ),
    },
  ];

  if (showVisibility) {
    wideColumns.push({
      title: t('notification.channels.columnVisibility'),
      dataIndex: 'visibility',
      render: visibilityCell,
    });
  }

  if (showUsage) {
    wideColumns.push({
      title: t('notification.channels.columnUsage'),
      dataIndex: 'usedByJobs',
      render: (usedByJobs) => <span className="notificationChannelTable__usage">{usageLabel(usedByJobs ?? 0)}</span>,
    });
  }

  wideColumns.push({ title: '', dataIndex: 'tools', render: (_, record) => toolsCell(record) });

  return (
    <Table
      className="notificationChannelTable"
      pagination={false}
      rowKey="id"
      empty={<Empty description={emptyText ?? t('notification.channels.empty')} />}
      columns={isNarrow ? narrowColumns : wideColumns}
      dataSource={channels}
    />
  );
}
