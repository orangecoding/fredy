import React, { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Typography, Select, Button, Toast, Empty, Space, Tag, Banner, Table } from '@douyinfe/semi-ui';
import { IconPlusCircle, IconInfoCircle } from '@douyinfe/semi-icons';
import { useHistory } from 'react-router-dom';
import './Dashboard.less';

const flattenListing = (listing, schema) => {
  // Copy all top-level fields
  const flat = { ...listing };
  if (schema?.waypoints && listing.travelTimes) {
    schema.waypoints.forEach(wp => {
      const wpId = wp.id;
      const wpName = wp.name;
      const travel = listing.travelTimes?.[wpId] || {};
      flat[`travelTime_${wpId}`] = travel.duration && travel.duration !== 'N/A' ? travel.duration : '';
      flat[`travelDistance_${wpId}`] = travel.distance && travel.distance !== 'N/A' ? travel.distance : '';
    });
  }
  return flat;
};

const Dashboard = () => {
  const dispatch = useDispatch();
  const history = useHistory();
  const jobs = useSelector((state) => state.jobs.jobs);
  const listings = useSelector((state) => state.dashboard.listings);
  const schema = useSelector((state) => state.dashboard.schema);
  const [selectedJobId, setSelectedJobId] = React.useState('');

  useEffect(() => {
    if (jobs && jobs.length > 0 && !selectedJobId) {
      setSelectedJobId(jobs[0].id);
    }
  }, [jobs]);

  useEffect(() => {
    if (selectedJobId) {
      dispatch.dashboard.getListings(selectedJobId);
      dispatch.dashboard.getSchema(selectedJobId);
    }
  }, [selectedJobId, dispatch]);

  const handleJobChange = (value) => {
    setSelectedJobId(value);
  };

  // Preprocess listings to flatten travelTimes
  const flattenedListings = useMemo(() => {
    if (!listings || !schema) return [];
    return listings.map(l => flattenListing(l, schema));
  }, [listings, schema]);

  const getColumns = () => {
    if (!schema) return [];

    return schema
      .filter(col => col.visible !== false) // Optionally filter hidden columns
      .map(col => ({
        title: col.display_name,
        dataIndex: col.id,
        width: 200,
        // Optionally add custom renderers for certain types
        render: (text) => {
          if (col.type === 'waypoint' && col.id.startsWith('travelTime_')) {
            return text ? `${text} min` : '-';
          }
          if (col.type === 'waypoint' && col.id.startsWith('travelDistance_')) {
            return text ? `${text} km` : '-';
          }
          return text ?? '-';
        }
      }));
  };

  if (!jobs || jobs.length === 0) {
    return (
      <div className="dashboard__empty">
        <Banner
          fullMode={false}
          type="info"
          closeIcon={null}
          icon={<IconInfoCircle size="extra-large" />}
          title={
            <Typography.Title heading={2} style={{ margin: 0 }}>
              No Jobs Created
            </Typography.Title>
          }
          description={
            <div className="dashboard__empty-content">
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: '16px' }}>
                Create your first job to start tracking listings and get enhanced insights about properties.
              </Typography.Text>
              <div className="dashboard__empty-actions">
                <Button
                  type="primary"
                  theme="solid"
                  size="large"
                  icon={<IconPlusCircle />}
                  onClick={() => history.push('/jobs/new')}
                >
                  Create New Job
                </Button>
              </div>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="dashboard">
      <Typography.Title heading={4}>
        Enhanced Listings
      </Typography.Title>

      <div className="dashboard__selector">
        <Select
          value={selectedJobId}
          onChange={handleJobChange}
          style={{ width: 200 }}
        >
          {jobs.map((job) => (
            <Select.Option key={job.id} value={job.id}>
              {job.name}
            </Select.Option>
          ))}
        </Select>
      </div>

      <div className="dashboard__table">
        <Table
          columns={getColumns()}
          dataSource={flattenedListings}
          pagination={{
            pageSize: 10,
            showTotal: true,
            showSizeChanger: true,
          }}
          scroll={{ x: 'max-content' }}
          rowKey="url"
          loading={!listings}
          empty={
            <Empty
              image={<IconInfoCircle size="extra-large" />}
              description="No enhanced listings found for this job"
            />
          }
        />
      </div>
    </div>
  );
};

export default Dashboard; 