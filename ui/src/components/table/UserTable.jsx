import React from 'react';

import { Table, Button } from 'semantic-ui-react';
import { format } from '../../services/time/timeService';

const emptyTable = () => {
  return (
    <Table.Row>
      <Table.Cell collapsing colSpan={4} style={{ textAlign: 'center' }}>
        No Data
      </Table.Cell>
    </Table.Row>
  );
};

const content = (user, onUserRemoval, onUserEdit) => {
  return user.map((user) => {
    return (
      <Table.Row key={user.id}>
        <Table.Cell>{user.username}</Table.Cell>
        <Table.Cell>{user.lastLogin == null ? '---' : format(user.lastLogin)}</Table.Cell>
        <Table.Cell>{user.numberOfJobs}</Table.Cell>
        <Table.Cell>
          <div style={{ float: 'right' }}>
            <Button circular color="red" icon="trash" onClick={() => onUserRemoval(user.id)} />
            <Button circular color="blue" icon="edit" onClick={() => onUserEdit(user.id)} />
          </div>
        </Table.Cell>
      </Table.Row>
    );
  });
};

export default function UserTable({ user = [], onUserRemoval, onUserEdit } = {}) {
  return (
    <Table inverted>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Username</Table.HeaderCell>
          <Table.HeaderCell>Last login</Table.HeaderCell>
          <Table.HeaderCell>Number of jobs</Table.HeaderCell>
          <Table.HeaderCell></Table.HeaderCell>
        </Table.Row>
      </Table.Header>

      <Table.Body>{user.length === 0 ? emptyTable() : content(user, onUserRemoval, onUserEdit)}</Table.Body>
    </Table>
  );
}
