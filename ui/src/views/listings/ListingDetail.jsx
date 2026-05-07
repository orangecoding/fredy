/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useActions } from '../../services/state/store.js';
import {
  Typography,
  Button,
  Space,
  Card,
  Row,
  Col,
  Image,
  Tag,
  Divider,
  Descriptions,
  Banner,
  Spin,
  Toast,
} from '@douyinfe/semi-ui-19';
import {
  IconArrowLeft,
  IconMapPin,
  IconCart,
  IconClock,
  IconBriefcase,
  IconActivity,
  IconLink,
  IconStar,
  IconStarStroked,
  IconDelete,
  IconExpand,
  IconGridView,
} from '@douyinfe/semi-icons';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import no_image from '../../assets/no_image.png';
import * as timeService from '../../services/time/timeService.js';
import { distanceMeters, getBoundsFromCoords } from './mapUtils.js';
import { xhrPost, xhrDelete } from '../../services/xhr.js';
import ListingDeletionModal from '../../components/ListingDeletionModal.jsx';

import Headline from '../../components/headline/Headline.jsx';
import './ListingDetail.less';

const { Title, Text } = Typography;

const STYLES = {
  STANDARD: 'https://tiles.openfreemap.org/styles/bright',
};

export default function ListingDetail() {
  const { listingId } = useParams();
  const navigate = useNavigate();
  const actions = useActions();
  const listing = useSelector((state) => state.listingsData.currentListing);
  const homeAddress = useSelector((state) => state.userSettings.settings.home_address);
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [loading, setLoading] = useState(true);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  useEffect(() => {
    async function fetchListing() {
      try {
        setLoading(true);
        await actions.listingsData.getListing(listingId);
      } catch (e) {
        console.error('Failed to load listing details:', e);
        Toast.error('Failed to load listing details');
        navigate('/listings');
      } finally {
        setLoading(false);
      }
    }
    fetchListing();
  }, [listingId]);

  const hasGeo =
    listing?.latitude != null && listing?.longitude != null && listing?.latitude !== -1 && listing?.longitude !== -1;

  useEffect(() => {
    if (loading || !listing || !mapContainer.current || !hasGeo) return;

    if (map.current) {
      map.current.remove();
    }

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: STYLES.STANDARD,
      center: [listing.longitude, listing.latitude],
      zoom: 14,
      cooperativeGestures: true,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    new maplibregl.Marker({ color: '#3FB1CE' })
      .setLngLat([listing.longitude, listing.latitude])
      .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`<h4>Listing Location</h4><p>${listing.address}</p>`))
      .addTo(map.current);

    if (homeAddress?.coords) {
      new maplibregl.Marker({ color: 'red' })
        .setLngLat([homeAddress.coords.lng, homeAddress.coords.lat])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`<h4>Home Address</h4><p>${homeAddress.address}</p>`))
        .addTo(map.current);

      const bounds = getBoundsFromCoords([
        [listing.longitude, listing.latitude],
        [homeAddress.coords.lng, homeAddress.coords.lat],
      ]);

      map.current.fitBounds(bounds, {
        padding: 50,
        maxZoom: 15,
      });

      const drawLine = () => {
        if (!map.current || !map.current.isStyleLoaded()) return;

        const distance = distanceMeters(
          listing.latitude,
          listing.longitude,
          homeAddress.coords.lat,
          homeAddress.coords.lng,
        );

        const midpoint = [
          (listing.longitude + homeAddress.coords.lng) / 2,
          (listing.latitude + homeAddress.coords.lat) / 2,
        ];

        if (map.current.getSource('route')) {
          map.current.getSource('route').setData({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [listing.longitude, listing.latitude],
                    [homeAddress.coords.lng, homeAddress.coords.lat],
                  ],
                },
              },
              {
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: midpoint,
                },
                properties: {
                  distance: `${Math.round(distance)} m`,
                },
              },
            ],
          });
        } else {
          map.current.addSource('route', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  geometry: {
                    type: 'LineString',
                    coordinates: [
                      [listing.longitude, listing.latitude],
                      [homeAddress.coords.lng, homeAddress.coords.lat],
                    ],
                  },
                },
                {
                  type: 'Feature',
                  geometry: {
                    type: 'Point',
                    coordinates: midpoint,
                  },
                  properties: {
                    distance: `${Math.round(distance)} m`,
                  },
                },
              ],
            },
          });

          map.current.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#3FB1CE',
              'line-width': 4,
              'line-dasharray': [2, 1],
            },
            filter: ['==', '$type', 'LineString'],
          });

          map.current.addLayer({
            id: 'route-distance',
            type: 'symbol',
            source: 'route',
            layout: {
              'text-field': ['get', 'distance'],
              'text-size': 14,
              'text-offset': [0, -1],
              'text-allow-overlap': true,
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': '#3FB1CE',
              'text-halo-width': 2,
            },
            filter: ['==', '$type', 'Point'],
          });
        }
      };

      if (map.current.isStyleLoaded()) {
        drawLine();
      } else {
        map.current.on('load', drawLine);
      }
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [listing, loading, homeAddress]);

  const confirmDeletion = async (hardDelete) => {
    try {
      await xhrDelete('/api/listings/', { ids: [listing.id], hardDelete });
      Toast.success('Listing successfully removed');
      navigate('/listings');
    } catch (e) {
      Toast.error(e.message || 'Error deleting listing');
    } finally {
      setDeleteModalVisible(false);
    }
  };

  const handleWatch = async () => {
    try {
      await xhrPost('/api/listings/watch', { listingId: listing.id });
      Toast.success(listing.isWatched === 1 ? 'Removed from Watchlist' : 'Added to Watchlist');
      actions.listingsData.getListing(listingId);
    } catch (e) {
      console.error('Failed to operate Watchlist:', e);
      Toast.error('Failed to operate Watchlist');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!listing) return null;

  const data = [
    { key: 'Price', value: `${listing.price} €`, Icon: <IconCart /> },
    {
      key: 'Size',
      value: listing.size ? `${listing.size} m²` : 'N/A',
      Icon: <IconExpand />,
    },
    {
      key: 'Rooms',
      value: listing.rooms ? `${listing.rooms} Rooms` : 'N/A',
      Icon: <IconGridView />,
    },
    {
      key: 'Job',
      value: listing.job_name,
      Icon: <IconBriefcase />,
    },
    {
      key: 'Provider',
      value: listing.provider ? listing.provider.charAt(0).toUpperCase() + listing.provider.slice(1) : 'Unknown',
      Icon: <IconBriefcase />,
    },
    {
      key: 'Added',
      value: timeService.format(listing.created_at),
      Icon: <IconClock />,
    },
  ];

  return (
    <div className="listing-detail">
      <Headline
        text={listing?.title || 'Listing Detail'}
        actions={
          <Button icon={<IconArrowLeft />} onClick={() => navigate(-1)} theme="borderless" style={{ color: '#909090' }}>
            Back
          </Button>
        }
      />

      <Card className="listing-detail__card">
        <div className="listing-detail__header">
          <Space align="center">
            <IconMapPin style={{ fontSize: '18px', color: 'var(--semi-color-primary)' }} />
            {listing.address ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(listing.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="listing-detail__address-link"
              >
                {listing.address}
              </a>
            ) : (
              <Text type="secondary">No address provided</Text>
            )}
          </Space>
          <Space wrap className="listing-detail__header-actions">
            <Button
              icon={listing.isWatched === 1 ? <IconStar /> : <IconStarStroked />}
              onClick={handleWatch}
              theme="borderless"
              className={`listing-detail__watch-btn${listing.isWatched === 1 ? ' listing-detail__watch-btn--active' : ''}`}
            >
              {listing.isWatched === 1 ? 'Watched' : 'Watch'}
            </Button>
            <a href={listing.link} target="_blank" rel="noopener noreferrer" className="listing-detail__open-btn">
              <IconLink style={{ marginRight: 6 }} />
              Open listing
            </a>
            <Button
              icon={<IconDelete />}
              onClick={() => setDeleteModalVisible(true)}
              theme="light"
              type="danger"
            >
              Delete
            </Button>
          </Space>
        </div>

        <Row>
          <Col span={24} lg={12}>
            <div
              className={`listing-detail__image-container${!listing.image_url ? ' listing-detail__image-container--placeholder' : ''}`}
            >
              <Image
                src={listing.image_url ?? no_image}
                fallback={<img src={no_image} alt="No image available" />}
                style={{ width: '100%', height: '100%' }}
                preview={!!listing.image_url}
              />
            </div>
          </Col>
          <Col span={24} lg={12}>
            <div className="listing-detail__info-section">
              <Title heading={4} style={{ marginBottom: '1rem' }}>
                Details
              </Title>
              <Descriptions column={1}>
                {data.map((item, index) => (
                  <Descriptions.Item key={index}>
                    <Space>
                      {item.Icon}
                      {item.value}
                    </Space>
                  </Descriptions.Item>
                ))}
              </Descriptions>
              <Divider margin="1.5rem" />
              <Title heading={4} style={{ marginBottom: '1rem' }}>
                Description
              </Title>
              <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
                {listing.description || 'No description available.'}
              </Text>

              {listing.distance_to_destination && (
                <>
                  <Divider margin="1.5rem" />
                  <Space align="center">
                    <IconActivity style={{ fontSize: '18px', color: 'var(--semi-color-primary)' }} />
                    <Text strong>Distance to home:</Text>
                    <Tag color="blue">{listing.distance_to_destination} m</Tag>
                  </Space>
                </>
              )}
            </div>
          </Col>
        </Row>
      </Card>

      <div className="listing-detail__map-wrapper">
        <Title heading={3}>Location</Title>
        {!hasGeo ? (
          <Banner
            type="warning"
            bordered
            description="This listing has no valid geocoordinates, so we cannot show it on the map."
            style={{ marginTop: '1rem' }}
          />
        ) : (
          <div ref={mapContainer} className="listing-detail__map-container" />
        )}
      </div>

      <ListingDeletionModal
        visible={deleteModalVisible}
        onConfirm={confirmDeletion}
        onCancel={() => setDeleteModalVisible(false)}
      />
    </div>
  );
}
