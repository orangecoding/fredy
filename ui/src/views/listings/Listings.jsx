import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { Typography, Card, Space, Toast } from '@douyinfe/semi-ui';
import ListingsTable from '../../components/table/ListingsTable';

const { Title } = Typography;

export default function Listings() {
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('jobId');
  const { listings, loading, error } = useSelector((state) => state.listings);

  useEffect(() => {
    if (jobId) {
      dispatch.listings.getListingsByJob(jobId);
    } else {
      dispatch.listings.getListings();
    }
  }, [dispatch, jobId]);

  useEffect(() => {
    if (error) {
      Toast.error(`Error loading listings: ${error}`);
    }
  }, [error]);

  return (
    <div>
      <Space vertical style={{ width: '100%' }}>
        <Title heading={2}>{jobId ? `Listings for Job ${jobId}` : 'All Listings'}</Title>

        <Card>
          <ListingsTable listings={listings} loading={loading} />
        </Card>
      </Space>
    </div>
  );
}
