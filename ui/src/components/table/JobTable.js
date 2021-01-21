import React, { Fragment } from 'react';

import { Table, Button } from 'semantic-ui-react';
import Switch from 'react-switch';

const emptyTable = () => {
  return (
    <Table.Row>
      <Table.Cell collapsing colSpan={6} style={{ textAlign: 'center' }}>
        No Data
      </Table.Cell>
    </Table.Row>
  );
};

const content = (jobs, onJobRemoval, onJobStatusChanged, onJobEdit, onJobInsight) => {
  return (
    <Fragment>
      {Object.keys(jobs).map((jobKey) => {
        const job = jobs[jobKey];

        return (
          <Table.Row key={jobKey}>
            <Table.Cell collapsing>
              <Switch onChange={(checked) => onJobStatusChanged(job.id, checked)} checked={job.enabled} />
            </Table.Cell>
            <Table.Cell>{job.name}</Table.Cell>
            <Table.Cell>{job.numberOfFoundListings || 0}</Table.Cell>
            <Table.Cell>{job.provider.length || 0}</Table.Cell>
            <Table.Cell>{job.notificationAdapter.length || 0}</Table.Cell>
            <Table.Cell>
              <div style={{ float: 'right' }}>
                <Button circular color="teal" icon="chart line" onClick={() => onJobInsight(job.id)} />
                <Button circular color="red" icon="trash" onClick={() => onJobRemoval(job.id)} />
                <Button circular color="blue" icon="edit" onClick={() => onJobEdit(job.id)} />
              </div>
            </Table.Cell>
          </Table.Row>
        );
      })}
    </Fragment>
  );
};

export default function JobTable({ jobs = {}, onJobRemoval, onJobStatusChanged, onJobEdit, onJobInsight } = {}) {
  return (
    <Table singleLine inverted>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell />
          <Table.HeaderCell>Job Name</Table.HeaderCell>
          <Table.HeaderCell>Number of findings</Table.HeaderCell>
          <Table.HeaderCell>Active provider</Table.HeaderCell>
          <Table.HeaderCell>Active notification adapter</Table.HeaderCell>
          <Table.HeaderCell></Table.HeaderCell>
        </Table.Row>
      </Table.Header>

      <Table.Body>
        {Object.keys(jobs).length === 0
          ? emptyTable()
          : content(jobs, onJobRemoval, onJobStatusChanged, onJobEdit, onJobInsight)}
      </Table.Body>
    </Table>
  );
}
