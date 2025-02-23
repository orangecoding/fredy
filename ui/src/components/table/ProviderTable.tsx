// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';

import { Empty, Table, Button } from '@douyinfe/semi-ui';
import { IconDelete } from '@douyinfe/semi-icons';

export default function ProviderTable({
  providerData = [],
  onRemove
}: any = {}) {
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Table
      pagination={false}
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      empty={<Empty description="No Provider available" />}
      columns={[
        {
          title: 'Provider Name',
          dataIndex: 'name',
        },
        {
          title: 'Provider Url',
          dataIndex: 'url',
          render: (_, data) => {
            return (
              // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
              <a href={data.url} target="_blank" rel="noopener noreferrer">
                Visit site
              // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
              </a>
            );
          },
        },
        {
          title: '',
          dataIndex: 'tools',
          render: (_, record) => {
            return (
              // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
              <div style={{ float: 'right' }}>
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <Button type="danger" icon={<IconDelete />} onClick={() => onRemove(record.id)} />
              // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
              </div>
            );
          },
        },
      ]}
      dataSource={providerData}
    />
  );
}
