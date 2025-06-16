import React from 'react';
import { Table, Button, Input, Select, Banner } from '@douyinfe/semi-ui';
import { IconDelete, IconPlusCircle } from '@douyinfe/semi-icons';
import './Waypoints.less';

const TRANSPORT_MODES = [
  { value: 'transit', label: 'Public Transport' },
  { value: 'driving', label: 'Car' },
  { value: 'walking', label: 'Walking' },
  { value: 'bicycling', label: 'Cycling' },
];

export default function Waypoints({ value = [], onChange }) {
  const handleAddWaypoint = () => {
    const newWaypoints = [...value, { id: Date.now(), name: '', location: '', transportMode: 'transit' }];
    onChange(newWaypoints);
  };

  const handleRemoveWaypoint = (id) => {
    const newWaypoints = value.filter((waypoint) => waypoint.id !== id);
    onChange(newWaypoints);
  };

  const handleWaypointChange = (id, field, fieldValue) => {
    const newWaypoints = value.map(w =>
      w.id === id ? { ...w, [field]: fieldValue } : w
    );
    onChange(newWaypoints);
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      className: 'waypoints__col--name',
      render: (text, record) => (
        <Input
          className="waypoints__input waypoints__input--name"
          value={record.name}
          onChange={val => handleWaypointChange(record.id, 'name', val)}
          placeholder="Waypoint name"
        />
      ),
    },
    {
      title: 'Location',
      dataIndex: 'location',
      className: 'waypoints__col--location',
      render: (text, record) => (
        <Input
          className="waypoints__input waypoints__input--location"
          value={record.location}
          onChange={val => handleWaypointChange(record.id, 'location', val)}
          placeholder="Address or coordinates"
        />
      ),
    },
    {
      title: 'Transport Mode',
      dataIndex: 'transportMode',
      className: 'waypoints__col--transport',
      render: (text, record) => (
        <Select
          className="waypoints__input waypoints__input--transport"
          value={record.transportMode}
          onChange={val => handleWaypointChange(record.id, 'transportMode', val)}
          optionList={TRANSPORT_MODES}
        />
      ),
    },
    {
      title: '',
      dataIndex: 'actions',
      className: 'waypoints__col--actions',
      render: (_, record) => (
        <Button
          type="danger"
          icon={<IconDelete />}
          onClick={() => handleRemoveWaypoint(record.id)}
        />
      ),
    },
  ];

  return (
    <div className="waypoints__container">
      <Banner
        fullMode={false}
        type="info"
        closeIcon={null}
        title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Waypoints Information</div>}
        description="Define important locations and how you want to travel to them. Fredy will calculate travel times from each listing to these locations."
      />
      <div className="waypoints__addBtnRow">
        <Button
          type="primary"
          icon={<IconPlusCircle />}
          className="waypoints__addBtn"
          onClick={handleAddWaypoint}
        >
          Add Waypoint
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={value}
        pagination={false}
        emptyContent="No Waypoints"
        rowKey="id"
      />
    </div>
  );
} 