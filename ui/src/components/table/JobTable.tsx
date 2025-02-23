// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';

import { Button, Empty, Table, Switch } from '@douyinfe/semi-ui';
import { IconDelete, IconEdit, IconHistogram } from '@douyinfe/semi-icons';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';
const empty = (
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  <Empty
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    image={<IllustrationNoResult />}
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    darkModeImage={<IllustrationNoResultDark />}
    description={'No jobs available'}
  />
);

export default function JobTable({
  jobs = {},
  onJobRemoval,
  onJobStatusChanged,
  onJobEdit,
  onJobInsight
}: any = {}) {
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Table
      pagination={false}
      empty={empty}
      columns={[
        {
          title: '',
          dataIndex: '',
          render: (job) => {
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            return <Switch onChange={(checked) => onJobStatusChanged(job.id, checked)} checked={job.enabled} />;
          },
        },
        {
          title: 'Job Name',
          dataIndex: 'name',
        },
        {
          title: 'Number of findings',
          dataIndex: 'numberOfFoundListings',
          render: (value) => {
            return value || 0;
          },
        },
        {
          title: 'Active provider',
          dataIndex: 'provider',
          render: (value) => {
            return value.length || 0;
          },
        },
        {
          title: 'Active notification adapter',
          dataIndex: 'notificationAdapter',
          render: (value) => {
            return value.length || 0;
          },
        },
        {
          title: '',
          dataIndex: 'tools',
          render: (_, job) => {
            return (
              // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
              <div style={{ float: 'right' }}>
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <Button
                  type="primary"
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  icon={<IconHistogram />}
                  onClick={() => onJobInsight(job.id)}
                  style={{ marginRight: '1rem' }}
                />
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <Button
                  type="secondary"
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  icon={<IconEdit />}
                  onClick={() => onJobEdit(job.id)}
                  style={{ marginRight: '1rem' }}
                />
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <Button type="danger" icon={<IconDelete />} onClick={() => onJobRemoval(job.id)} />
              // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
              </div>
            );
          },
        },
      ]}
      dataSource={jobs}
    />
  );
}
