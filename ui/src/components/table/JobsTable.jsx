/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button, Tag, Tooltip, Switch } from '@douyinfe/semi-ui-19';
import {
  IconAlertTriangle,
  IconBell,
  IconBriefcase,
  IconCopy,
  IconDelete,
  IconDescend2,
  IconEdit,
  IconHome,
  IconPlayCircle,
} from '@douyinfe/semi-icons';

import './JobsTable.less';

/**
 * @param {{ jobs: object[], onRun: Function, onEdit: Function, onClone: Function, onDeleteListings: Function, onDeleteJob: Function, onStatusChange: Function }} props
 */
const JobsTable = ({ jobs, onRun, onEdit, onClone, onDeleteListings, onDeleteJob, onStatusChange }) => (
  <div className="jobsTable">
    {jobs.map((job) => (
      <div key={job.id} className={`jobsTable__row${!job.enabled ? ' jobsTable__row--inactive' : ''}`}>
        <div className="jobsTable__row__dot">
          <span
            className={`jobsTable__row__dot__indicator${job.enabled ? ' jobsTable__row__dot__indicator--active' : ''}`}
          />
        </div>

        <div className="jobsTable__row__name" title={job.name}>
          {job.name}
        </div>

        <div className="jobsTable__row__stat jobsTable__row__stat--blue">
          <IconHome size="small" />
          {job.numberOfFoundListings || 0}
        </div>

        <div className="jobsTable__row__stat jobsTable__row__stat--orange">
          <IconBriefcase size="small" />
          {job.provider?.length || 0}
        </div>

        <div className="jobsTable__row__stat jobsTable__row__stat--purple">
          <IconBell size="small" />
          {job.notificationAdapter?.length || 0}
        </div>

        <div className="jobsTable__row__badges">
          <Switch
            size="small"
            checked={job.enabled}
            disabled={job.isOnlyShared}
            onChange={(checked) => onStatusChange(job.id, checked)}
          />
          {job.running && (
            <Tag color="green" variant="light" size="small">
              RUNNING
            </Tag>
          )}
          {job.isOnlyShared && (
            <Tooltip content="Shared with you - read only">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <IconAlertTriangle style={{ color: 'rgba(var(--semi-yellow-7), 1)' }} />
              </span>
            </Tooltip>
          )}
        </div>

        <div className="jobsTable__row__actions">
          <Tooltip content="Run Job">
            <Button
              type="primary"
              style={{ background: '#21aa21b5' }}
              size="small"
              theme="solid"
              icon={<IconPlayCircle />}
              disabled={job.isOnlyShared || job.running}
              onClick={() => onRun(job.id)}
            />
          </Tooltip>
          <Tooltip content="Edit Job">
            <Button
              type="secondary"
              size="small"
              icon={<IconEdit />}
              disabled={job.isOnlyShared}
              onClick={() => onEdit(job.id)}
            />
          </Tooltip>
          <Tooltip content="Clone Job">
            <Button
              type="tertiary"
              size="small"
              icon={<IconCopy />}
              disabled={job.isOnlyShared}
              onClick={() => onClone(job.id)}
            />
          </Tooltip>
          <Tooltip content="Delete all found Listings">
            <Button
              type="danger"
              size="small"
              icon={<IconDescend2 />}
              disabled={job.isOnlyShared}
              onClick={() => onDeleteListings(job.id)}
            />
          </Tooltip>
          <Tooltip content="Delete Job">
            <Button
              type="danger"
              size="small"
              icon={<IconDelete />}
              disabled={job.isOnlyShared}
              onClick={() => onDeleteJob(job.id)}
            />
          </Tooltip>
        </div>
      </div>
    ))}
  </div>
);

export default JobsTable;
