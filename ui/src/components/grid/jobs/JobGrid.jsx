/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Card, Col, Row, Button, Space, Typography, Divider, Switch, Popover, Tag } from '@douyinfe/semi-ui';
import {
  IconAlertTriangle,
  IconDelete,
  IconDescend2,
  IconEdit,
  IconPlayCircle,
  IconBriefcase,
  IconBell,
  IconSearch,
} from '@douyinfe/semi-icons';

import './JobGrid.less';

const { Text, Title } = Typography;

const getPopoverContent = (text) => <article className="jobPopoverContent">{text}</article>;

const JobGrid = ({ jobs = [], onJobRemoval, onJobStatusChanged, onJobEdit, onListingRemoval, onJobRun }) => {
  return (
    <div className="jobGrid">
      <Row gutter={[16, 16]}>
        {jobs.map((job) => (
          <Col key={job.id} xs={24} sm={12} md={8} lg={6} xl={4} xxl={6}>
            <Card
              className="jobGrid__card"
              bodyStyle={{ padding: '16px' }}
              headerLine={false}
              title={
                <div className="jobGrid__header">
                  <Switch
                    onChange={(checked) => onJobStatusChanged(job.id, checked)}
                    checked={job.enabled}
                    disabled={job.isOnlyShared}
                    size="small"
                  />
                  {job.isOnlyShared && (
                    <Popover
                      content={getPopoverContent(
                        'This job has been shared with you by another user, therefor it is read-only.',
                      )}
                    >
                      <IconAlertTriangle style={{ color: 'rgba(var(--semi-yellow-7), 1)', marginLeft: '8px' }} />
                    </Popover>
                  )}
                </div>
              }
            >
              <div className="jobGrid__content">
                <Title heading={5} ellipsis={{ showTooltip: true }} className="jobGrid__title">
                  {job.name}
                </Title>

                <Space vertical align="start" spacing={4} style={{ width: '100%', marginTop: 12 }}>
                  <div className="jobGrid__infoItem">
                    <Text type="secondary" icon={<IconSearch />} size="small">
                      Listings:
                    </Text>
                    <Tag color="blue" size="small" style={{ marginLeft: 'auto' }}>
                      {job.numberOfFoundListings || 0}
                    </Tag>
                  </div>
                  <div className="jobGrid__infoItem">
                    <Text type="secondary" icon={<IconBriefcase />} size="small">
                      Providers:
                    </Text>
                    <Tag color="cyan" size="small" style={{ marginLeft: 'auto' }}>
                      {job.provider.length || 0}
                    </Tag>
                  </div>
                  <div className="jobGrid__infoItem">
                    <Text type="secondary" icon={<IconBell />} size="small">
                      Adapters:
                    </Text>
                    <Tag color="purple" size="small" style={{ marginLeft: 'auto' }}>
                      {job.notificationAdapter.length || 0}
                    </Tag>
                  </div>
                </Space>

                <Divider margin="12px" />

                <div className="jobGrid__actions">
                  <Popover content={getPopoverContent('Run Job')}>
                    <Button
                      type="primary"
                      theme="light"
                      icon={<IconPlayCircle />}
                      disabled={job.isOnlyShared || job.running}
                      onClick={() => onJobRun && onJobRun(job.id)}
                      size="small"
                    />
                  </Popover>
                  <Popover content={getPopoverContent('Edit a Job')}>
                    <Button
                      type="secondary"
                      theme="light"
                      icon={<IconEdit />}
                      disabled={job.isOnlyShared}
                      onClick={() => onJobEdit(job.id)}
                      size="small"
                    />
                  </Popover>
                  <Popover content={getPopoverContent('Delete all found Listings of this Job')}>
                    <Button
                      type="danger"
                      theme="light"
                      icon={<IconDescend2 />}
                      disabled={job.isOnlyShared}
                      onClick={() => onListingRemoval(job.id)}
                      size="small"
                    />
                  </Popover>
                  <Popover content={getPopoverContent('Delete Job')}>
                    <Button
                      type="danger"
                      theme="light"
                      icon={<IconDelete />}
                      disabled={job.isOnlyShared}
                      onClick={() => onJobRemoval(job.id)}
                      size="small"
                    />
                  </Popover>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default JobGrid;
