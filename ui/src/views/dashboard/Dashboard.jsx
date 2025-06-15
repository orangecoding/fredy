import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Typography, Select, Card, Button, Toast, Empty, Space, Tag, Banner } from '@douyinfe/semi-ui';
import { IconPlusCircle, IconInfoCircle } from '@douyinfe/semi-icons';
import { useHistory } from 'react-router-dom';
import './Dashboard.less';

const Dashboard = () => {
  const dispatch = useDispatch();
  const history = useHistory();
  const jobs = useSelector((state) => state.jobs.jobs);
  const listings = useSelector((state) => state.dashboard.listings);
  const [selectedJobId, setSelectedJobId] = React.useState('');

  useEffect(() => {
    if (jobs && jobs.length > 0 && !selectedJobId) {
      setSelectedJobId(jobs[0].id);
    }
  }, [jobs]);

  useEffect(() => {
    if (selectedJobId) {
      dispatch.dashboard.getListings(selectedJobId);
    }
  }, [selectedJobId, dispatch]);

  const handleJobChange = (value) => {
    setSelectedJobId(value);
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

      <div className="dashboard__grid">
        {listings.map((listing) => (
          <Card
            key={listing.url}
            className="dashboard__card"
            bodyStyle={{ padding: '12px' }}
          >
            <Typography.Title heading={6}>
              {listing.title}
            </Typography.Title>
            <Space wrap className="dashboard__tags">
              <Tag color="blue">{`${listing.price}€`}</Tag>
              <Tag>{`${listing.size}m²`}</Tag>
              <Tag>{`${listing.rooms} rooms`}</Tag>
            </Space>
            <Typography.Text type="secondary" paragraph>
              {listing.description}
            </Typography.Text>
            <a href={listing.url} target="_blank" rel="noopener noreferrer">
              View Original Listing
            </a>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Dashboard; 