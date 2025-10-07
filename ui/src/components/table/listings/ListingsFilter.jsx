import { Card, Checkbox, Descriptions, Divider, Select } from '@douyinfe/semi-ui';
import React from 'react';
import { useSelector } from '../../../services/state/store.js';
import { Typography } from '@douyinfe/semi-ui';

import './ListingsFilter.less';

export default function ListingsFilter({ onWatchListFilter, onActivityFilter, onJobNameFilter, onProviderFilter }) {
  const jobs = useSelector((state) => state.jobs.jobs);
  const provider = useSelector((state) => state.provider);
  const { Title } = Typography;
  return (
    <Card className="listingsFilter">
      <Title heading={6}>Filter by:</Title>
      <Divider />
      <br />
      <Descriptions row>
        <Descriptions.Item itemKey="Watch List">
          <Checkbox onChange={(e) => onWatchListFilter(e.target.checked)}>Only Watch List</Checkbox>
        </Descriptions.Item>
        <Descriptions.Item itemKey="Activity status">
          <Checkbox onChange={(e) => onActivityFilter(e.target.checked)}>Only Active Listings</Checkbox>
        </Descriptions.Item>
        <Descriptions.Item itemKey="Job Name">
          <Select showClear placeholder="Select Job to Filter" onChange={(val) => onJobNameFilter(val)}>
            {jobs != null &&
              jobs.length > 0 &&
              jobs.map((job) => {
                return (
                  <Select.Option value={job.id} key={job.id}>
                    {job.name}
                  </Select.Option>
                );
              })}
          </Select>
        </Descriptions.Item>
        <Descriptions.Item itemKey="Provider">
          <Select showClear placeholder="Select Provider to Filter" onChange={(val) => onProviderFilter(val)}>
            {provider != null &&
              provider.length > 0 &&
              provider.map((prov) => {
                return (
                  <Select.Option value={prov.id} key={prov.id}>
                    {prov.name}
                  </Select.Option>
                );
              })}
          </Select>
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
