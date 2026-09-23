/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useUrlState, parseNumber, parseString, parseBoolean } from '../../hooks/useSearchParamState.js';
import { getAddresses } from '../../utils.js';
import maplibregl from '../../components/map/maplibre.js';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useActions, useSelector } from '../../services/state/store.js';
import {
  distanceMeters,
  generateCircleCoords,
  getBoundsFromCenter,
  getBoundsFromCoords,
  groupListingsByPosition,
} from './mapUtils.js';
import { Select, Switch, Toast, Typography } from '@douyinfe/semi-ui-19';

import _RangeSlider from 'react-range-slider-input';
import 'react-range-slider-input/dist/style.css';
import './Map.less';
import { xhrDelete, errorMessage } from '../../services/xhr.js';
import { Link, useNavigate, useSearchParams } from 'react-router';
import ListingDeletionModal from '../../components/ListingDeletionModal.jsx';
import { createListingPopupContent, escapeHtml } from './listingPopupContent.jsx';
// Not imported as `Map`. This module is itself called Map.jsx, and a component of that name shadows
// the global `Map` constructor for the whole file: `new Map()` then invokes a React function
// component with no props, which fails somewhere inside it rather than where it was written.
import MapCanvas, { isDarkBasemap } from '../../components/map/Map.jsx';
import MapLegend from '../../components/map/MapLegend.jsx';
import { MARKER_COLORS } from '../../components/map/markerColors.js';
import { useProviderCountries } from '../../hooks/useProviderCountries.js';
import Headline from '../../components/headline/Headline.jsx';
import { useTranslation, useLocale } from '../../services/i18n/i18n.jsx';
import { keepPopupInView, mountPopupNode } from '../../components/map/popupContent.jsx';
import NearbyStops from '../../components/transit/NearbyStops.jsx';
import { COMMUTE_OPTIONS, parseCommuteFilter } from '../../components/transit/travelTimeFormat.js';
import { formatEuroCompact } from '../../components/cards/chartTheme.js';
import { normalizeTheme } from '../../services/theme/theme.js';

/**
 * The map's URL-backed view state: which job, the distance ring, the basemap and the optional
 * overlays (3D buildings, public transport).
 *
 * Module scope so its identity is stable for the hook's memo.
 */
const MAP_URL_STATE = {
  job: { defaultValue: null, codec: parseString },
  distance: { defaultValue: 0, codec: parseNumber },
  // Mode and ceiling in one key, as `transit:30`, so a bookmarked URL can never carry half a filter.
  commute: { defaultValue: null, codec: parseString },
  style: { defaultValue: 'STANDARD', codec: parseString },
  buildings: { defaultValue: false, codec: parseBoolean },
  // On by default: "how do I get out of here?" is asked about every flat, so the answer should be
  // on screen without switching anything on first. `?transit=false` turns it off.
  transit: { defaultValue: true, codec: parseBoolean },
  // Which listing's popup is open, by id. Here rather than in component state because the popup is
  // where the trip to a detail page starts: opening the details and coming back used to land on a
  // map with nothing open, and the pin you were looking at had to be found again. The id, not the
  // pin, because it also says which page of a stacked popup was showing.
  popup: { defaultValue: null, codec: parseString },
};

/**
 * Upper bound for a listing popup. It carries an image, five rows of details and the nearby stops,
 * which MapLibre's 240px default squeezes into an unreadable column; the stylesheet narrows it
 * again on phones.
 */
const LISTING_POPUP_MAX_WIDTH = '380px';

const RangeSlider = _RangeSlider?.default ?? _RangeSlider;

const { Text } = Typography;

export default function MapView() {
  const t = useTranslation();
  const locale = useLocale();
  const map = useRef(null);
  const markers = useRef([]);
  const homeMarkers = useRef([]);
  // Every React tree mounted into a popup, so they can be torn down with their markers.
  const popupRoots = useRef([]);
  const actions = useActions();
  const navigate = useNavigate();
  const sp = useSearchParams();
  const [searchParams, setSearchParams] = sp;
  const listings = useSelector((state) => state.listingsData.mapListings);
  const userSettings = useSelector((state) => state.userSettings.settings);
  const homeAddresses = useMemo(() => getAddresses(userSettings), [userSettings]);
  const hasHome = homeAddresses.length > 0;

  const language = userSettings?.language ?? 'en';
  // Absent means off, which is why this needed no migration.
  const transitHoverPopups = userSettings?.transit_hover_popups === true;
  const listingDeletionPref = userSettings?.listing_deletion_preference;
  const defaultDeleteType = listingDeletionPref?.hardDelete ? 'hard' : 'soft';

  const jobs = useSelector((state) => state.jobsData.jobs);
  // No job is selected here by default and a listing carries no provider into this view, so the
  // reach of the map is the union across everything the user searches.
  const countries = useProviderCountries();

  // One grouped state rather than four independent setters: two of these can change in the same
  // tick, and separate setSearchParams calls overwrite each other.
  const { values: urlState, setValue: setUrlValue, setValues } = useUrlState(sp, MAP_URL_STATE);
  const {
    job: jobId,
    distance: distanceFilter,
    commute: commuteFilter,
    style,
    buildings: show3dBuildings,
    transit: showTransit,
    popup: openListingId,
  } = urlState;
  // Read the same way `components/map/Map.jsx` reads it, so the ring drawn on top of the basemap
  // and the basemap itself can never disagree about how dark the map is.
  const theme = normalizeTheme(useSelector((state) => state.userSettings.settings.theme));
  const isDark = isDarkBasemap(style, theme);

  const setJobId = (value) => setUrlValue('job', value);
  const setDistanceFilter = (value) => setUrlValue('distance', value);
  const setCommuteFilter = (value) => setUrlValue('commute', value);

  /*
   * The open popup, read and written through refs.
   *
   * Both directions have to stay out of the marker effect's dependencies. Reading it as a value
   * would rebuild every marker each time a popup opens, which would tear down the popup that was
   * just opened; writing through a value captured at build time would let a marker built before
   * the last filter change write a stale id. So the effect reads the current id and the current
   * setter from refs that every render refreshes, and never re-runs for either.
   */
  const openListingIdRef = useRef(openListingId);
  openListingIdRef.current = openListingId;

  const setOpenListingRef = useRef(null);
  setOpenListingRef.current = (id) => {
    // Same value means nothing to write, and writing it anyway is a navigation per popup open.
    if ((id ?? null) === (openListingIdRef.current ?? null)) return;
    // Recorded at once, not on the next render. A click from one pin straight onto another opens
    // the new popup and closes the old one in the same tick; without this the old one's close
    // handler still saw itself as the open one and wrote `popup` away again, last write winning.
    openListingIdRef.current = id ?? null;
    setUrlValue('popup', id ?? null);
  };

  /*
   * Set while something other than a person is closing a popup.
   *
   * MapLibre reports `close` the same way whoever caused it: a user dismissing the popup, the
   * marker effect removing its markers to rebuild them, or the map being destroyed because the
   * page is going away. Only the first of those means "no popup is open any more", and the other
   * two are exactly the moments the open popup has to survive - a filter change, and the trip to a
   * detail page and back.
   *
   * Getting this wrong is not subtle: without the unmount half, clicking through to a listing
   * cleared the param, and because that write is a `replace` it overwrote the detail page's own
   * history entry with the map's.
   */
  const isTearingDownRef = useRef(false);

  /** Set while the marker effect reopens the popup the URL names, which is not a person opening it. */
  const reopeningRef = useRef(false);

  // The unmount half. Declared before the map is rendered and therefore torn down before it: React
  // destroys a deleted subtree from the top, so this runs while the map below still exists and is
  // about to take its popups with it.
  useEffect(
    () => () => {
      isTearingDownRef.current = true;
      // The popups' own React roots live outside this tree and do not go with it. The marker effect
      // only unmounts them when it rebuilds, so leaving the page kept every one alive - and an open
      // departure board polling - for as long as the tab was.
      popupRoots.current.forEach((unmount) => unmount());
      popupRoots.current = [];
    },
    [],
  );

  // Price range: stored as priceMin/priceMax URL params; default max derived from loaded listings
  const urlPriceMin = searchParams.has('priceMin') ? Number(searchParams.get('priceMin')) : null;
  const urlPriceMax = searchParams.has('priceMax') ? Number(searchParams.get('priceMax')) : null;
  const [priceRange, setPriceRange] = useState([urlPriceMin ?? 0, urlPriceMax ?? 0]);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [listingToDelete, setListingToDelete] = useState(null);
  const deleteListingRef = useRef(null);

  const confirmListingDeletion = async (hardDelete, remember, id = listingToDelete) => {
    try {
      if (remember) {
        await actions.userSettings.setListingDeletionPreference({ skipPrompt: true, hardDelete });
      }
      await xhrDelete('/api/listings/', { ids: [id], hardDelete });
      Toast.success(t('map.toastDeleted'));
      fetchListings();
    } catch (error) {
      Toast.error(errorMessage(error, t('map.toastDeleteError')));
    } finally {
      setDeleteModalVisible(false);
      setListingToDelete(null);
    }
  };

  deleteListingRef.current = (id) => {
    if (listingDeletionPref?.skipPrompt) {
      confirmListingDeletion(listingDeletionPref.hardDelete, false, id);
      return;
    }
    setListingToDelete(id);
    setDeleteModalVisible(true);
  };

  useEffect(() => {
    // The open end is what the loaded listings fill in: until they arrive there is no ceiling to
    // put on the slider. The lower end belongs to the user, so it is taken from the URL rather
    // than zeroed - a bookmarked `?priceMin=300000` used to arrive here as no filter at all,
    // because this reset both ends whenever `priceMax` happened to be absent.
    if (urlPriceMax === null) {
      setPriceRange([urlPriceMin ?? 0, getMaxPrice()]);
    }
  }, [listings]);

  const getMaxPrice = () => {
    return listings.reduce((acc, item) => {
      const price = Number(item.price);
      return Number.isFinite(price) && price > acc ? price : acc;
    }, 0);
  };

  const filterListings = () => {
    const min = priceRange[0];
    const max = priceRange[1] && priceRange[1] > 0 ? priceRange[1] : getMaxPrice();

    return listings
      .filter((listing) => listing.price && listing.price >= min && listing.price <= max)
      .filter(withinCommute);
  };

  /**
   * Whether a listing is reachable within the selected ceiling.
   *
   * Unlike the distance ring, which only recolours pins, this one hides them: a commute ceiling is
   * asked as "show me only what I could actually live with", and a pin that fails it is noise.
   *
   * A listing that has not been routed yet has nothing to answer with and drops out, which is why
   * this is off until it is asked for rather than on by default.
   *
   * @param {Object} listing
   * @returns {boolean}
   */
  function withinCommute(listing) {
    const parsed = parseCommuteFilter(commuteFilter);
    if (parsed == null) {
      return true;
    }
    return (Array.isArray(listing.travelTimes) ? listing.travelTimes : []).some(
      (entry) => entry?.[parsed.mode]?.minutes != null && entry[parsed.mode].minutes <= parsed.maxMinutes,
    );
  }

  // Whether any pin stands for more than one listing, which is the only thing the "stack" entry in
  // the legend explains. Computed from the same grouping the markers are built from, so the legend
  // cannot claim a stack that is not on the map.
  const hasStacks = useMemo(
    () => groupListingsByPosition(filterListings()).some((group) => group.listings.length > 1),
    [listings, priceRange, commuteFilter],
  );

  const handleMapReady = (mapInstance) => {
    map.current = mapInstance;
  };

  /**
   * The map's own controls report one patch per user action; write it straight into the URL.
   *
   * `setValues` drops any value equal to its declared default, so a pristine view keeps a clean
   * address, and the map already clears the 3D buildings flag when the basemap goes to satellite.
   *
   * @param {{style?: string, show3dBuildings?: boolean, showTransit?: boolean}} patch
   */
  const handleControlsChange = (patch) => {
    setValues({
      ...('style' in patch ? { style: patch.style } : {}),
      ...('show3dBuildings' in patch ? { buildings: patch.show3dBuildings } : {}),
      ...('showTransit' in patch ? { transit: patch.showTransit } : {}),
    });
  };

  const handlePriceRange = (val) => {
    const maxPrice = getMaxPrice();
    if (maxPrice <= 0) return; // skip until listings are loaded
    setPriceRange(val);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (val[0] === 0) {
          next.delete('priceMin');
        } else {
          next.set('priceMin', String(val[0]));
        }
        if (val[1] === 0 || val[1] >= maxPrice) {
          next.delete('priceMax');
        } else {
          next.set('priceMax', String(val[1]));
        }
        return next;
      },
      { replace: true },
    );
  };

  const fetchListings = async () => {
    actions.listingsData.getListingsForMap({
      jobId,
    });
  };

  useEffect(() => {
    fetchListings();
  }, [jobId]);

  useEffect(() => {
    if (!map.current) return;

    // Use duration: 0 so the map jumps straight to the target view instead of
    // animating from the zoomed-out initial state. This effect re-runs whenever
    // listings/filters change, and the fly/zoom animation was distracting on
    // every refresh.
    if (homeAddresses.length > 0) {
      if (distanceFilter > 0) {
        const corners = homeAddresses.flatMap((home) =>
          getBoundsFromCenter([home.coords.lng, home.coords.lat], distanceFilter),
        );
        map.current.fitBounds(getBoundsFromCoords(corners), {
          padding: 20,
          maxZoom: 15,
          duration: 0,
        });
      } else if (homeAddresses.length === 1) {
        map.current.flyTo({
          center: [homeAddresses[0].coords.lng, homeAddresses[0].coords.lat],
          zoom: 12,
          duration: 0,
        });
      } else {
        const bounds = getBoundsFromCoords(homeAddresses.map((home) => [home.coords.lng, home.coords.lat]));
        map.current.fitBounds(bounds, {
          padding: 50,
          maxZoom: 15,
          duration: 0,
        });
      }
    } else {
      const filtered = filterListings();
      const coords = filtered
        .filter((l) => l.latitude != null && l.longitude != null && l.latitude !== -1 && l.longitude !== -1)
        .map((l) => [l.longitude, l.latitude]);

      if (coords.length > 0) {
        const bounds = getBoundsFromCoords(coords);
        map.current.fitBounds(bounds, {
          padding: 50,
          maxZoom: 15,
          duration: 0,
        });
      }
    }
  }, [homeAddresses, distanceFilter, commuteFilter, listings]);

  useEffect(() => {
    if (!map.current) return;

    // Removing a marker fires its popup's `close`; see isTearingDownRef.
    isTearingDownRef.current = true;
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];

    homeMarkers.current.forEach((marker) => marker.remove());
    homeMarkers.current = [];

    popupRoots.current.forEach((unmount) => unmount());
    popupRoots.current = [];
    isTearingDownRef.current = false;

    homeAddresses.forEach((home) => {
      const marker = new maplibregl.Marker({ color: MARKER_COLORS.home })
        .setLngLat([home.coords.lng, home.coords.lat])
        .setPopup(
          // Escaped: `setHTML` is `innerHTML`, and a label or an address picked from the
          // OpenStreetMap suggestions is text somebody else wrote.
          new maplibregl.Popup({ offset: 25 }).setHTML(
            `<div class="map-popup-content"><h4>${escapeHtml(home.label || t('map.popupHomeAddress'))}</h4><p>${escapeHtml(home.address ?? '')}</p></div>`,
          ),
        )
        .addTo(map.current);
      homeMarkers.current.push(marker);
    });

    const mapInstance = map.current;
    const wantsRing = distanceFilter > 0 && homeAddresses.length > 0;

    const addCircleLayer = () => {
      if (!map.current || !map.current.isStyleLoaded()) return;
      if (map.current.getLayer('distance-circle')) map.current.removeLayer('distance-circle');
      if (map.current.getLayer('distance-circle-outline')) map.current.removeLayer('distance-circle-outline');
      if (map.current.getSource('distance-circle-source')) map.current.removeSource('distance-circle-source');
      drawRing();
    };

    function drawRing() {
      if (wantsRing) {
        map.current.addSource('distance-circle-source', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: homeAddresses.map((home) => ({
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [generateCircleCoords([home.coords.lng, home.coords.lat], distanceFilter)],
              },
            })),
          },
        });

        // The ring over a near-black basemap needs less of everything: lime at 0.3 turns into a wash
        // there, and the dark outline disappears. Map layer literals, like the marker colours.
        const ring = isDark
          ? { fill: '#6fbf95', fillOpacity: 0.16, line: '#6fbf95' }
          : { fill: '#90EE90', fillOpacity: 0.3, line: '#006400' };

        map.current.addLayer({
          id: 'distance-circle',
          type: 'fill',
          source: 'distance-circle-source',
          paint: {
            'fill-color': ring.fill,
            'fill-opacity': ring.fillOpacity,
          },
        });

        map.current.addLayer({
          id: 'distance-circle-outline',
          type: 'line',
          source: 'distance-circle-source',
          paint: {
            'line-color': ring.line,
            'line-width': 1,
          },
        });
      }
    }

    const updateLayers = () => {
      addCircleLayer();
    };

    // A basemap switch loads a new style, and applying it drops every source and layer the old one
    // did not have - the ring included, which then stayed gone. Put back on `styledata`, the way the
    // detail page redraws its route, and only when it is missing.
    const restoreRing = () => {
      if (!wantsRing || !map.current || map.current.getSource('distance-circle-source')) return;
      try {
        drawRing();
      } catch {
        // The new style is not far enough along to take a source yet; the next `styledata` is.
      }
    };

    if (mapInstance.isStyleLoaded()) {
      updateLayers();
    } else {
      mapInstance.on('load', updateLayers);
    }
    mapInstance.on('styledata', restoreRing);

    // The marker carrying the listing the URL says is open, filled in below and opened once every
    // marker is on the map. Opening it inside the loop would work too, but this keeps the reopen
    // in one place next to the comment that explains it.
    let reopen = null;

    // One marker per position rather than per listing: listings that share an address (a whole
    // house, or a town that could only be geocoded to its centre) used to stack invisibly, with
    // only the topmost one reachable.
    groupListingsByPosition(filterListings()).forEach(({ lat, lng, listings: grouped }) => {
      let popup = null;
      let stopFit = null;

      // Paging changes the popup's height, so it has to be fitted into the map again.
      const refit = () => {
        if (!popup || !map.current) return;
        stopFit?.();
        stopFit = keepPopupInView(map.current, popup);
      };

      // Whether the id in the address bar belongs to this group, which is what makes this the pin
      // to reopen and this the popup allowed to clear the param again.
      const holdsOpenListing = () => grouped.some((listing) => listing.id === openListingIdRef.current);

      const { element, transitMount, unmount, currentId } = createListingPopupContent({
        listings: grouped,
        t,
        locale,
        language,
        onDelete: (id) => deleteListingRef.current(id),
        onNavigate: (id) => navigate(`/listings/listing/${id}`),
        // Opens on the listing the URL names, so a stacked popup comes back on the page it was
        // left on rather than at the top of its group.
        initialId: holdsOpenListing() ? openListingIdRef.current : null,
        onPageChange: (id) => {
          refit();
          setOpenListingRef.current(id);
        },
      });
      popupRoots.current.push(unmount);

      popup = new maplibregl.Popup({
        offset: 25,
        maxWidth: LISTING_POPUP_MAX_WIDTH,
        // MapLibre otherwise focuses the first `a[href]` in the popup, which since the redesign is
        // the title, and a heading wearing a focus ring on every open reads as a stray border
        // rather than as focus. The popup's own container is focused instead, on open below - it
        // has to be something, because a popup is appended after every marker in the DOM and is
        // otherwise a few hundred Tab presses away.
        focusAfterOpen: false,
      }).setDOMContent(element);

      // The stop list is only worth a request once the popup is actually opened, and it is the
      // same for the whole group, so it is mounted once and survives paging.
      popup.on('open', () => {
        refit();
        setOpenListingRef.current(currentId());
        // The container, not the title: see `focusAfterOpen` above. `preventScroll`, because the
        // popup is its own scroll box and focusing it must not jump it away from the top. Not for
        // the reopen after a rebuild: that follows a filter change, and taking the focus there
        // pulled it out of the slider or select the user was operating.
        if (!reopeningRef.current) {
          element.focus({ preventScroll: true });
        }

        if (!transitMount || transitMount.dataset.mounted === 'true') return;
        transitMount.dataset.mounted = 'true';

        const unmount = mountPopupNode(
          transitMount,
          <NearbyStops lat={lat} lng={lng} limit={3} departureLimit={5} />,
          language,
        );
        popupRoots.current.push(unmount);
      });

      // Only this group's own popup may clear the param, and only when a person closed it: a
      // filter change removes the marker and MapLibre reports that as a close too.
      popup.on('close', () => {
        if (isTearingDownRef.current || !holdsOpenListing()) return;
        setOpenListingRef.current(null);
      });

      // The commute verdict is drawn as the shape underneath rather than onto the pin, so the only
      // thing left that recolours a pin is the distance ring, which is asked for explicitly.
      let color = MARKER_COLORS.listing;
      if (distanceFilter > 0 && homeAddresses.length > 0) {
        const inRange = homeAddresses.some(
          (home) => distanceMeters(home.coords.lat, home.coords.lng, lat, lng) <= distanceFilter * 1000,
        );
        if (inRange) {
          color = MARKER_COLORS.inRing;
        }
      }

      const marker = new maplibregl.Marker({ color }).setLngLat([lng, lat]).setPopup(popup).addTo(map.current);

      if (grouped.length > 1) {
        // Says how many listings hide behind this pin, so a stack is recognisable before opening it.
        const badge = document.createElement('span');
        badge.className = 'map-marker-badge';
        badge.textContent = String(grouped.length);
        badge.title = t('map.popupSameAddress', { count: grouped.length });
        marker.getElement().appendChild(badge);
      }

      if (holdsOpenListing()) {
        reopen = marker;
      }

      markers.current.push(marker);
    });

    // Reopen whatever the address bar says was open, once every marker exists - this is what makes
    // the back button from a detail page land on the popup it was opened from, and a bookmarked
    // map address open on that listing.
    //
    // Nothing happens when the id is no longer among the pins, which a tightened filter can do.
    // The param is deliberately left alone in that case rather than cleared: widening the filter
    // again brings the pin back, and with it the popup.
    if (reopen != null) {
      reopeningRef.current = true;
      try {
        reopen.togglePopup();
      } finally {
        reopeningRef.current = false;
      }
    }

    return () => {
      mapInstance.off('load', updateLayers);
      mapInstance.off('styledata', restoreRing);
    };
    // `isDark` because the ring is painted with a literal that the effect reads, so a theme switch
    // has to redraw it. Without it the dark variant would only appear the next time one of the
    // others changed. The open popup is deliberately *not* in here - it is read through a ref, see
    // openListingIdRef, because rebuilding the markers would close the popup that just opened.
  }, [listings, priceRange, homeAddresses, distanceFilter, commuteFilter, isDark]);

  return (
    <>
      {/* The address caveat is a standing fact about this page, not something that just happened,
          so it reads as a line under the title rather than as an info Banner competing with the
          map for attention every single visit. */}
      <Headline text={t('map.title')} subtitle={t('map.onlyValidAddresses')} />
      <div className="map-view-container">
        <div className="map-view-container__map-wrapper">
          <MapCanvas
            countries={countries}
            style={style}
            show3dBuildings={show3dBuildings}
            showTransit={showTransit}
            onControlsChange={handleControlsChange}
            controlsMode="always"
            // This is the map where an address search earns its place: the pins are spread over
            // whole cities, and "is there anything near here" is the question the page is for.
            searchable
            transitExtra={
              /* Only offered while the layer it belongs to is on, and indented under it: on its own
                 it describes nothing. Unlike the switches around it, this one is a preference rather
                 than a view state, so it is stored per user instead of living in the URL. */
              <div className="map-panel__row map-panel__row--nested">
                <Text size="small" className="map-panel__label">
                  {t('map.filterTransitHover')}
                </Text>
                <Switch
                  size="small"
                  checked={transitHoverPopups}
                  onChange={async (value) => {
                    try {
                      await actions.userSettings.setTransitHoverPopups(value);
                    } catch (error) {
                      Toast.error(errorMessage(error, t('map.filterTransitHoverError')));
                    }
                  }}
                />
              </div>
            }
            onMapReady={handleMapReady}
            controlsInPanels
            panels={(controls, expandButton) => (
              /* One box, two named groups. The map's own rows and this view's filters all answer
                 what the map is showing, so they read as one panel with a line between them rather
                 than as two identical boxes four pixels apart, neither of them with a heading. */
              <div className="map-panel">
                {/* The fullscreen toggle rides on this heading rather than floating above the
                    panel: it is a control over the map as a whole, and this is the line that names
                    the map. */}
                <div className="map-panel__groupTitle">
                  {t('map.groupMap')}
                  {expandButton}
                </div>
                {controls}

                <div className="map-panel__divider" />

                <div className="map-panel__groupTitle">{t('map.groupListings')}</div>

                <div className="map-panel__row">
                  <Text size="small" strong className="map-panel__label">
                    {t('map.filterJobLabel')}
                  </Text>
                  <Select
                    placeholder={t('map.filterJobPlaceholder')}
                    showClear
                    size="small"
                    onChange={(val) => setJobId(val)}
                    value={jobId}
                    style={{ width: 160 }}
                  >
                    {jobs?.map((j) => (
                      <Select.Option key={j.id} value={j.id}>
                        {j.name}
                      </Select.Option>
                    ))}
                  </Select>
                </div>

                {/* Disabled rather than hidden, and it says why one line below. A control that
                    cannot work is the honest place for that sentence - it used to be a full-width
                    banner above the map, on every visit, for a fact that never changes. */}
                <div className="map-panel__row">
                  <Text size="small" strong className="map-panel__label">
                    {t('map.filterDistanceLabel')}
                  </Text>
                  <Select
                    placeholder={t('map.filterDistanceNone')}
                    size="small"
                    disabled={!hasHome}
                    onChange={(val) => setDistanceFilter(val)}
                    value={distanceFilter}
                    style={{ width: 100 }}
                  >
                    <Select.Option value={0}>{t('map.filterDistanceNone')}</Select.Option>
                    <Select.Option value={5}>5 km</Select.Option>
                    <Select.Option value={10}>10 km</Select.Option>
                    <Select.Option value={15}>15 km</Select.Option>
                    <Select.Option value={20}>20 km</Select.Option>
                    <Select.Option value={25}>25 km</Select.Option>
                  </Select>
                </div>

                {/* Locked rather than hidden, for the same reason as the ring above. Unlike the
                    distance ring, which recolours pins, this one hides them: a commute ceiling is
                    asked as "show me only what I could live with". */}
                <div className="map-panel__row">
                  <Text size="small" strong className="map-panel__label">
                    {t('map.filterCommuteLabel')}
                  </Text>
                  <Select
                    placeholder={t('map.filterCommuteNone')}
                    showClear
                    size="small"
                    disabled={!hasHome}
                    onChange={(val) => setCommuteFilter(val ?? null)}
                    value={commuteFilter}
                    style={{ width: 150 }}
                  >
                    {COMMUTE_OPTIONS.map(({ mode, minutes }) =>
                      minutes.map((max) => (
                        <Select.Option key={`${mode}:${max}`} value={`${mode}:${max}`}>
                          {t('listings.filterCommuteOption', { mode: t(`travelTime.mode.${mode}`), minutes: max })}
                        </Select.Option>
                      )),
                    )}
                  </Select>
                </div>

                <div className="map-panel__row">
                  <Text size="small" strong className="map-panel__label">
                    {t('map.filterPriceLabel')}
                  </Text>
                  <div className="map-view-container__price-slider">
                    <div className="map__rangesliderLabels">
                      <span>{formatEuroCompact(priceRange[0], locale)}</span>
                      <span>{formatEuroCompact(priceRange[1] || getMaxPrice(), locale)}</span>
                    </div>
                    <RangeSlider min={0} max={getMaxPrice()} step={100} value={priceRange} onInput={handlePriceRange} />
                  </div>
                </div>

                {!hasHome && (
                  <div className="map-panel__hint">
                    {t('map.noHomeAddressBefore')}
                    <Link to="/settings/travel-time">{t('map.noHomeAddressLink')}</Link>
                    {t('map.noHomeAddressAfter')}
                  </div>
                )}

                <div className="map-panel__divider" />
                <MapLegend hasStacks={hasStacks} hasRing={distanceFilter > 0 && hasHome} hasHome={hasHome} />
              </div>
            )}
          />
        </div>

        <ListingDeletionModal
          visible={deleteModalVisible}
          defaultDeleteType={defaultDeleteType}
          onConfirm={confirmListingDeletion}
          onCancel={() => {
            setDeleteModalVisible(false);
            setListingToDelete(null);
          }}
        />
      </div>
    </>
  );
}
