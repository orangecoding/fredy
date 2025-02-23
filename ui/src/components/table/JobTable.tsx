import React from 'react';
import { Empty, Table, Button, Switch } from '@douyinfe/semi-ui';
import { IconDelete, IconEdit, IconHistogram } from '@douyinfe/semi-icons';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';
import { Job } from '#types/Jobs.ts';
import { Provider } from 'ui/src/types';
import { NotificationAdapterConfig } from '#types/NotificationAdapter.ts';

interface JobTableProps {
  jobs: Job[];
  onJobRemoval: (jobId: string) => void;
  onJobStatusChanged: (jobId: string, enabled: boolean) => void;
  onJobEdit: (jobId: string) => void;
  onJobInsight: (jobId: string) => void;
}

const empty = (
  <Empty image={<IllustrationNoResult />} darkModeImage={<IllustrationNoResultDark />} description={'No Data'} />
);

export default function JobTable({
  jobs = [],
  onJobRemoval,
  onJobStatusChanged,
  onJobEdit,
  onJobInsight,
}: JobTableProps) {
  return (
    <Table
      pagination={false}
      empty={empty}
      columns={[
        {
          title: '',
          dataIndex: 'enabled',
          key: 'enabled',
          render: (value: unknown, record: Job) => (
            <Switch checked={record.enabled} onChange={(checked: boolean) => onJobStatusChanged(record.id, checked)} />
          ),
        },
        {
          title: 'Job Name',
          dataIndex: 'name',
          key: 'name',
        },
        {
          title: 'Number of findings',
          dataIndex: 'numberOfFoundListings',
          key: 'numberOfFoundListings',
        },
        {
          title: 'Active provider',
          dataIndex: 'provider',
          key: 'provider',
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          render: (value: Provider[], record: Job) => value.length || 0,
        },
        {
          title: 'Active notification adapter',
          dataIndex: 'notificationAdapter',
          key: 'notificationAdapter',
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          render: (value: NotificationAdapterConfig[], record: Job) => value.length || 0,
        },
        {
          title: '',
          dataIndex: 'tools',
          render: (_, job: Job) => {
            return (
              <div style={{ float: 'right' }}>
                <Button
                  type="primary"
                  icon={<IconHistogram />}
                  onClick={() => onJobInsight(job.id)}
                  style={{ marginRight: '1rem' }}
                />
                <Button
                  type="secondary"
                  icon={<IconEdit />}
                  onClick={() => onJobEdit(job.id)}
                  style={{ marginRight: '1rem' }}
                />
                <Button type="danger" icon={<IconDelete />} onClick={() => onJobRemoval(job.id)} />
              </div>
            );
          },
        },
      ]}
      dataSource={jobs}
    />
  );
}
