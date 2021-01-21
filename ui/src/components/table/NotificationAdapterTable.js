import React, { Fragment } from 'react';

import { Table, Button } from 'semantic-ui-react';

const emptyTable = () => {
  return (
    <Table.Row>
      <Table.Cell collapsing colSpan="3" style={{ textAlign: 'center' }}>
        No Data
      </Table.Cell>
    </Table.Row>
  );
};

const content = (adapterData, onRemove) => {
  return (
    <Fragment>
      {adapterData.map((data) => {
        return (
          <Table.Row key={data.id}>
            <Table.Cell>{data.name}</Table.Cell>
            <Table.Cell>
              <div style={{ float: 'right' }}>
                <Button circular color="red" icon="trash" onClick={() => onRemove(data.id)} />
              </div>
            </Table.Cell>
          </Table.Row>
        );
      })}
    </Fragment>
  );
};

export default function NotificationAdapterTable({ notificationAdapter = [], onRemove } = {}) {
  return (
    <Table singleLine inverted>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Notification Adapter Name</Table.HeaderCell>
          <Table.HeaderCell></Table.HeaderCell>
        </Table.Row>
      </Table.Header>

      <Table.Body>
        {notificationAdapter.length === 0 ? emptyTable() : content(notificationAdapter, onRemove)}
      </Table.Body>
    </Table>
  );
}
