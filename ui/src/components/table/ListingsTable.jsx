import React, { useState, useMemo } from 'react';
import {
  Button,
  Empty,
  Table,
  Tag,
  Typography,
  Input,
  Select,
  Space,
  Card,
  Collapsible,
  InputNumber,
} from '@douyinfe/semi-ui';
import { IconExternalOpen, IconSearch, IconFilter, IconClose } from '@douyinfe/semi-icons';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';

const { Text } = Typography;
const { Option } = Select;

const empty = (
  <Empty
    image={<IllustrationNoResult />}
    darkModeImage={<IllustrationNoResultDark />}
    description={'No listings available.'}
  />
);

const parsePrice = (priceStr) => {
  if (!priceStr) return 0;
  const numStr = priceStr.toString().replace(/[^\d]/g, '');
  return parseInt(numStr) || 0;
};

const parseSize = (sizeStr) => {
  if (!sizeStr) return 0;
  const numStr = sizeStr.toString().replace(/[^\d]/g, '');
  return parseInt(numStr) || 0;
};

const formatPrice = (price) => {
  if (!price) return 'N/A';
  // Remove any existing currency symbols and format
  const cleanPrice = price.toString().replace(/[€$,]/g, '').trim();
  if (!cleanPrice || isNaN(cleanPrice)) return price; // Return original if can't parse
  return cleanPrice.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' €';
};

export default function ListingsTable({ listings = [], loading = false }) {
  // Filter states
  const [searchText, setSearchText] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedJob, setSelectedJob] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minSize, setMinSize] = useState('');
  const [maxSize, setMaxSize] = useState('');

  // Ensure listings is always an array
  const safeListings = Array.isArray(listings) ? listings : [];

  // Get unique providers and jobs for filter dropdowns
  const uniqueProviders = useMemo(() => {
    const providers = [...new Set(safeListings.map((item) => item.serviceName).filter(Boolean))];
    return providers.sort();
  }, [safeListings]);

  const uniqueJobs = useMemo(() => {
    const jobs = [...new Set(safeListings.map((item) => item.jobKey).filter(Boolean))];
    return jobs.sort();
  }, [safeListings]);

  // Filter and search logic
  const filteredListings = useMemo(() => {
    return safeListings.filter((listing) => {
      // Global search
      if (searchText) {
        const searchLower = searchText.toLowerCase();
        const searchableText = [
          listing.title,
          listing.address,
          listing.price,
          listing.size,
          listing.rooms,
          listing.serviceName,
          listing.jobKey,
        ]
          .join(' ')
          .toLowerCase();

        if (!searchableText.includes(searchLower)) {
          return false;
        }
      }

      // Provider filter
      if (selectedProvider && listing.serviceName !== selectedProvider) {
        return false;
      }

      // Job filter
      if (selectedJob && listing.jobKey !== selectedJob) {
        return false;
      }

      // Price range filter
      const listingPrice = parsePrice(listing.price);
      if (minPrice && listingPrice < parseInt(minPrice)) {
        return false;
      }
      if (maxPrice && listingPrice > parseInt(maxPrice)) {
        return false;
      }

      // Size range filter
      const listingSize = parseSize(listing.size);
      if (minSize && listingSize < parseInt(minSize)) {
        return false;
      }
      if (maxSize && listingSize > parseInt(maxSize)) {
        return false;
      }

      return true;
    });
  }, [safeListings, searchText, selectedProvider, selectedJob, minPrice, maxPrice, minSize, maxSize]);

  // Clear all filters
  const clearFilters = () => {
    setSearchText('');
    setSelectedProvider('');
    setSelectedJob('');
    setMinPrice('');
    setMaxPrice('');
    setMinSize('');
    setMaxSize('');
  };

  // Check if any filters are active
  const hasActiveFilters = searchText || selectedProvider || selectedJob || minPrice || maxPrice || minSize || maxSize;

  const columns = [
    {
      title: 'Title',
      dataIndex: 'title',
      width: 300,
      sorter: (a, b) => (a.title || '').localeCompare(b.title || ''),
      render: (title, record) => (
        <div>
          <Text strong>{title || 'N/A'}</Text>
          {record.link && (
            <div style={{ marginTop: 4 }}>
              <Button
                type="tertiary"
                size="small"
                icon={<IconExternalOpen />}
                onClick={() => window.open(record.link, '_blank')}
              >
                View Listing
              </Button>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Address',
      dataIndex: 'address',
      width: 200,
      sorter: (a, b) => (a.address || '').localeCompare(b.address || ''),
      render: (address) => <Text>{address || 'N/A'}</Text>,
    },
    {
      title: 'Price',
      dataIndex: 'price',
      width: 120,
      sorter: (a, b) => parsePrice(a.price) - parsePrice(b.price),
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
        <div style={{ padding: 8 }}>
          <Space direction="vertical">
            <InputNumber
              placeholder="Min €"
              value={selectedKeys[0]}
              onChange={(value) => setSelectedKeys(value ? [value] : [])}
              style={{ width: 120 }}
            />
            <InputNumber
              placeholder="Max €"
              value={selectedKeys[1]}
              onChange={(value) => setSelectedKeys([selectedKeys[0], value])}
              style={{ width: 120 }}
            />
            <Space>
              <Button type="primary" onClick={() => confirm()} size="small" style={{ width: 90 }}>
                Filter
              </Button>
              <Button onClick={() => clearFilters()} size="small" style={{ width: 90 }}>
                Reset
              </Button>
            </Space>
          </Space>
        </div>
      ),
      onFilter: (value, record) => {
        const price = parsePrice(record.price);
        const [min, max] = value;
        if (min && max) return price >= min && price <= max;
        if (min) return price >= min;
        if (max) return price <= max;
        return true;
      },
      render: (price) => <Text strong>{formatPrice(price)}</Text>,
    },
    {
      title: 'Size',
      dataIndex: 'size',
      width: 100,
      sorter: (a, b) => parseSize(a.size) - parseSize(b.size),
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
        <div style={{ padding: 8 }}>
          <Space direction="vertical">
            <InputNumber
              placeholder="Min m²"
              value={selectedKeys[0]}
              onChange={(value) => setSelectedKeys(value ? [value] : [])}
              style={{ width: 120 }}
            />
            <InputNumber
              placeholder="Max m²"
              value={selectedKeys[1]}
              onChange={(value) => setSelectedKeys([selectedKeys[0], value])}
              style={{ width: 120 }}
            />
            <Space>
              <Button type="primary" onClick={() => confirm()} size="small" style={{ width: 90 }}>
                Filter
              </Button>
              <Button onClick={() => clearFilters()} size="small" style={{ width: 90 }}>
                Reset
              </Button>
            </Space>
          </Space>
        </div>
      ),
      onFilter: (value, record) => {
        const size = parseSize(record.size);
        const [min, max] = value;
        if (min && max) return size >= min && size <= max;
        if (min) return size >= min;
        if (max) return size <= max;
        return true;
      },
      render: (size) => <Text>{size || 'N/A'}</Text>,
    },
    {
      title: 'Provider',
      dataIndex: 'serviceName',
      width: 120,
      sorter: (a, b) => (a.serviceName || '').localeCompare(b.serviceName || ''),
      render: (serviceName) => <Tag color="blue">{serviceName || 'N/A'}</Tag>,
    },
    {
      title: 'Job',
      dataIndex: 'jobKey',
      width: 150,
      sorter: (a, b) => (a.jobKey || '').localeCompare(b.jobKey || ''),
      render: (jobKey) => (
        <Text type="secondary" size="small">
          {jobKey || 'N/A'}
        </Text>
      ),
    },
  ];

  return (
    <div>
      {/* Global Search - Always Visible */}
      <Card style={{ marginBottom: 16 }}>
        <Input
          prefix={<IconSearch />}
          placeholder="Search all listings (title, address, price, etc.)..."
          value={searchText}
          onChange={setSearchText}
          style={{ width: '100%' }}
          size="large"
        />
      </Card>

      <Collapsible
        header={
          <Space>
            <IconFilter />
            <Text>Advanced Filters</Text>
            {(selectedProvider || selectedJob || minPrice || maxPrice || minSize || maxSize) && (
              <Tag color="blue" size="small">
                {filteredListings.length} of {safeListings.length} listings
              </Tag>
            )}
          </Space>
        }
        defaultIsOpen={false}
      >
        <Card style={{ marginBottom: 16 }}>
          <Space wrap>
            <Select
              placeholder="Filter by Provider"
              value={selectedProvider}
              onChange={setSelectedProvider}
              style={{ width: 150 }}
              allowClear
            >
              {uniqueProviders.map((provider) => (
                <Option key={provider} value={provider}>
                  {provider}
                </Option>
              ))}
            </Select>

            <Select
              placeholder="Filter by Job"
              value={selectedJob}
              onChange={setSelectedJob}
              style={{ width: 150 }}
              allowClear
            >
              {uniqueJobs.map((job) => (
                <Option key={job} value={job}>
                  {job}
                </Option>
              ))}
            </Select>

            <Space>
              <Text>Price:</Text>
              <InputNumber placeholder="Min €" value={minPrice} onChange={setMinPrice} style={{ width: 100 }} />
              <Text>-</Text>
              <InputNumber placeholder="Max €" value={maxPrice} onChange={setMaxPrice} style={{ width: 100 }} />
            </Space>

            <Space>
              <Text>Size:</Text>
              <InputNumber placeholder="Min m²" value={minSize} onChange={setMinSize} style={{ width: 100 }} />
              <Text>-</Text>
              <InputNumber placeholder="Max m²" value={maxSize} onChange={setMaxSize} style={{ width: 100 }} />
            </Space>

            {hasActiveFilters && (
              <Button type="tertiary" icon={<IconClose />} onClick={clearFilters}>
                Clear Filters
              </Button>
            )}
          </Space>
        </Card>
      </Collapsible>

      <Table
        loading={loading}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} listings`,
        }}
        empty={empty}
        columns={columns}
        dataSource={filteredListings}
        rowKey={(record) => record.id || record.rowid}
        scroll={{ x: 1000 }}
      />
    </div>
  );
}
