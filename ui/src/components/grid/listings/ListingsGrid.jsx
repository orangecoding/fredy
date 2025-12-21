/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Card, Col, Row, Image, Button, Space, Typography, Pagination, Toast, Divider } from '@douyinfe/semi-ui';
import {
  IconBriefcase,
  IconCart,
  IconClock,
  IconDelete,
  IconLink,
  IconMapPin,
  IconStar,
  IconStarStroked,
} from '@douyinfe/semi-icons';
import no_image from '../../../assets/no_image.jpg';
import * as timeService from '../../../services/time/timeService.js';
import { xhrDelete, xhrPost } from '../../../services/xhr.js';

import './ListingsGrid.less';

const { Text } = Typography;

const ListingsGrid = ({ data, total, page, pageSize, onPageChange, onReload }) => {
  const handleWatch = async (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await xhrPost('/api/listings/watch', { listingId: item.id });
      Toast.success(item.isWatched === 1 ? 'Listing removed from Watchlist' : 'Listing added to Watchlist');
      onReload();
    } catch (e) {
      console.error(e);
      Toast.error('Failed to operate Watchlist');
    }
  };

  return (
    <div className="listingsGrid">
      <Row gutter={[16, 16]}>
        {data.map((item) => (
          <Col key={item.id} xs={24} sm={12} md={8} lg={6} xl={4} xxl={6}>
            <Card
              className={`listingsGrid__card ${!item.is_active ? 'listingsGrid__card--inactive' : ''}`}
              cover={
                <div style={{ position: 'relative' }}>
                  <div className="listingsGrid__imageContainer">
                    <Image
                      src={item.image_url || no_image}
                      fallback={no_image}
                      width="100%"
                      height={180}
                      style={{ objectFit: 'cover' }}
                      preview={false}
                    />
                    <Button
                      icon={
                        item.isWatched === 1 ? (
                          <IconStar style={{ color: 'rgba(var(--semi-green-5), 1)' }} />
                        ) : (
                          <IconStarStroked />
                        )
                      }
                      theme="light"
                      shape="circle"
                      size="small"
                      className="listingsGrid__watchButton"
                      onClick={(e) => handleWatch(e, item)}
                    />
                  </div>
                  {!item.is_active && <div className="listingsGrid__inactiveOverlay">Inactive</div>}
                </div>
              }
              bodyStyle={{ padding: '12px' }}
            >
              <div className="listingsGrid__content">
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="listingsGrid__titleLink">
                  <Text strong ellipsis={{ showTooltip: true }} className="listingsGrid__title">
                    {item.title}
                  </Text>
                </a>
                <Space vertical align="start" spacing={2} style={{ width: '100%', marginTop: 8 }}>
                  <Text type="secondary" icon={<IconCart />} size="small">
                    {item.price} €
                  </Text>
                  <Text
                    type="secondary"
                    icon={<IconMapPin />}
                    size="small"
                    ellipsis={{ showTooltip: true }}
                    style={{ width: '100%' }}
                  >
                    {item.address || 'No address provided'}
                  </Text>
                  <Text type="tertiary" size="small" icon={<IconClock />}>
                    {timeService.format(item.created_at, false)}
                  </Text>
                  <Text type="tertiary" size="small" icon={<IconBriefcase />}>
                    {item.provider.charAt(0).toUpperCase() + item.provider.slice(1)}
                  </Text>
                </Space>
                <Divider margin=".6rem" />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Button
                    title="Linkt to listing"
                    type="primary"
                    size="small"
                    onClick={async () => {
                      window.open(item.link);
                    }}
                    icon={<IconLink />}
                  />

                  <Button
                    title="Remove"
                    type="danger"
                    size="small"
                    onClick={async () => {
                      try {
                        await xhrDelete('/api/listings/', { ids: [item.id] });
                        Toast.success('Listing(s) successfully removed');
                        onReload();
                      } catch (error) {
                        Toast.error(error);
                      }
                    }}
                    icon={<IconDelete />}
                  />
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
      <div className="listingsGrid__pagination">
        <Pagination
          currentPage={page}
          pageSize={pageSize}
          total={total}
          onPageChange={onPageChange}
          showSizeChanger={false}
        />
      </div>
    </div>
  );
};

export default ListingsGrid;
