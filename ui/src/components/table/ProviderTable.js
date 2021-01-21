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

const truncate = (str, n) => {
  return str.length > n ? str.substr(0, n - 1) + '…' : str;
};

const content = (providerData, onRemove) => {
  return (
    <Fragment>
      {providerData.map((data) => {
        return (
          <Table.Row key={data.id}>
            <Table.Cell>{data.name}</Table.Cell>
            <Table.Cell>{truncate(data.url, 60)}</Table.Cell>
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

export default function ProviderTable({ providerData = [], onRemove } = {}) {
  return (
    <Table singleLine inverted>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Provider Name</Table.HeaderCell>
          <Table.HeaderCell>Url</Table.HeaderCell>
          <Table.HeaderCell></Table.HeaderCell>
        </Table.Row>
      </Table.Header>

      <Table.Body>{providerData.length === 0 ? emptyTable() : content(providerData, onRemove)}</Table.Body>
    </Table>
  );
}
