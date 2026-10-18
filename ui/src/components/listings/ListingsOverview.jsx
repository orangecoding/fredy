/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useUrlState, parseNumber, parseString, parseNullableBoolean } from '../../hooks/useSearchParamState.js';
import { Button, Pagination, Toast, Input, Select, Empty, Tooltip, Banner, Dropdown } from '@douyinfe/semi-ui-19';
import { IconSearch, IconArrowUp, IconArrowDown, IconDelete } from '@douyinfe/semi-icons';
import { IconMore } from '../icons/StrokeIcons.jsx';
import { useNavigate, useSearchParams } from 'react-router';
import ListingDeletionModal from '../ListingDeletionModal.jsx';
import ApplicationModal from '../../views/listings/components/ApplicationModal.jsx';
import { xhrDelete, xhrPost, errorMessage } from '../../services/xhr.js';
import { useActions, useSelector } from '../../services/state/store.js';
import { debounce, measuredPlaces } from '../../utils';
import FilterSelect from './FilterSelect.jsx';
import ListingsFilterPanel from './ListingsFilterPanel.jsx';
import ActiveFilterChips from '../filters/ActiveFilterChips.jsx';
import FilterButton from '../filters/FilterButton.jsx';
import {
  countActiveFilters,
  describeActiveFilters,
  clearFilter,
  clearAllFilters,
  toListingsQuery,
  QUICK_FILTERS,
  quickFilterKeys,
} from '../../services/listings/listingFilters.js';
import ListingsGrid from '../grid/listings/ListingsGrid.jsx';
import ListingsTable from '../table/ListingsTable.jsx';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';

import './ListingsOverview.less';
import { useTranslation, useLocale } from '../../services/i18n/i18n.jsx';
import { useFinanceProfile } from '../../hooks/useFinanceProfile.js';
import { useScrollRestoration } from '../../hooks/useScrollRestoration.js';
import { formatEuro } from '../cards/chartTheme.js';
import { affordabilityFilterHelp } from '../../services/finance/rentBasis.js';
import { subscribeJobEvents } from '../../services/sse/jobEvents.js';

/**
 * Listings fetched per page. Large enough that the grid fills a desktop screen without paging,
 * small enough that a page stays quick to render.
 * @type {number}
 */
const LISTINGS_PAGE_SIZE = 40;

/**
 * Every filter this page keeps in the URL, with its default and its codec.
 *
 * Module scope so its identity is stable: {@link useUrlState} memoizes on it.
 */
const LISTINGS_URL_STATE = {
  page: { defaultValue: 1, codec: parseNumber },
  sort: { defaultValue: 'published_at', codec: parseString },
  dir: { defaultValue: 'desc', codec: parseString },
  q: { defaultValue: null, codec: parseString },
  watch: { defaultValue: null, codec: parseNullableBoolean },
  job: { defaultValue: null, codec: parseString },
  active: { defaultValue: true, codec: parseNullableBoolean },
  provider: { defaultValue: null, codec: parseString },
  status: { defaultValue: null, codec: parseString },
  afford: { defaultValue: null, codec: parseString },
  // Mode and ceiling in one key, as `transit:30`. Two keys would let a bookmarked URL carry half a
  // filter, which the server would then have to guess the other half of.
  commute: { defaultValue: null, codec: parseString },
  down: { defaultValue: null, codec: parseNumber },
  fiber: { defaultValue: null, codec: parseNullableBoolean },
  // Technology and operator are two keys rather than one packed value, unlike the commute filter
  // above: the operator is optional here, so half of it is a complete filter on its own.
  mtech: { defaultValue: null, codec: parseString },
  mop: { defaultValue: null, codec: parseString },
  hidden: { defaultValue: false, codec: parseNullableBoolean },
};

const ListingsOverview = () => {
  const t = useTranslation();
  const locale = useLocale();
  const listingsData = useSelector((state) => state.listingsData);
  const providers = useSelector((state) => state.provider);
  const pois = useSelector((state) => state.tracking.pois);
  const jobs = useSelector((state) => state.jobsData.jobs);
  const userSettings = useSelector((state) => state.userSettings.settings);
  const generalSettings = useSelector((state) => state.generalSettings.settings);
  const actions = useActions();
  const navigate = useNavigate();
  const sp = useSearchParams();
  const { anyComplete: financeComplete, thresholds: financeThresholds } = useFinanceProfile();

  const viewMode = userSettings?.listings_view_mode ?? 'grid';
  const listingDeletionPref = userSettings?.listing_deletion_preference;
  const defaultDeleteType = listingDeletionPref?.hardDelete ? 'hard' : 'soft';

  // One source of truth for the page size: it is sent with the query and drives the pagination
  // control, and those two disagreeing would silently misreport how many pages there are.
  const pageSize = LISTINGS_PAGE_SIZE;

  // One piece of state for every filter. Each control here changes two params at once (its own,
  // plus the page reset), and separate per-key setters would race each other into the URL.
  const { values, setValue, setValues } = useUrlState(sp, LISTINGS_URL_STATE);
  // The filters themselves reach the request through `toListingsQuery(values)` below; only what this
  // component reads on its own is named here.
  const { page, sort: sortField, dir: sortDir, q: freeTextFilter, hidden: hiddenOnly } = values;
  const setPage = (value) => setValue('page', value);
  const setSortField = (value) => setValue('sort', value);
  const setSortDir = (value) => setValue('dir', value);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  // The id of the listing whose application letter is open. One dialog for the whole page rather
  // than one per row: only ever one is open, and a modal per card would mount hundreds of them.
  const [applicationListingId, setApplicationListingId] = useState(null);
  const [listingToDelete, setListingToDelete] = useState(null);
  const [bulkDeleteVisible, setBulkDeleteVisible] = useState(false);
  const [newAvailableCount, setNewAvailableCount] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const isHiddenView = hiddenOnly === true;

  // A commute filter without a reference address would return an empty page and look broken, so the
  // control is not offered at all until there is something to measure from.
  // Place types count: somebody whose only entry is "a supermarket" still has travel times to
  // filter by, and hiding the control from them would be hiding their own data.
  const hasAddresses = measuredPlaces(userSettings).length > 0;

  const activeFilterCount = countActiveFilters(values);

  // The filter says nothing about *why* a listing lands in a band, so its tooltip names the
  // ceilings it is measured against - both halves when the user set up both, because a mixed
  // listings page is judged by two different yardsticks at once, and for rents the warm ceiling
  // beside the cold one, which is what a rent quoted with the charges in it is held against.
  const affordabilityHelp = useMemo(
    () => affordabilityFilterHelp(financeThresholds, { t, locale, formatEuro }),
    [financeThresholds, locale, t],
  );

  // The one payload the page is described by. The bulk delete sends the same object, which is the
  // only reason the button can honestly claim to remove what is on screen.
  const listingsQuery = toListingsQuery(values);

  const loadData = () => {
    actions.listingsData.getListingsData({
      ...listingsQuery,
      page,
      pageSize,
      sortfield: sortField,
      sortdir: sortDir,
    });
  };

  // Keyed on the request itself rather than on a hand-kept list of filters: the list missed the four
  // connectivity filters, so setting one changed the chips but not the listings, and a bulk delete
  // then went out with a query the visible page had never been loaded with.
  const requestKey = JSON.stringify({ ...listingsQuery, page, sortField, sortDir });
  useEffect(() => {
    loadData();
    setNewAvailableCount(0);
  }, [requestKey]);

  const loadDataRef = useRef(loadData);
  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  // SSE connection for live listings updates
  useEffect(() => {
    const onNewListings = (e) => {
      try {
        const data = JSON.parse(e.data || '{}');
        if (data && data.count) {
          setNewAvailableCount((prev) => prev + data.count);
        }
      } catch {
        // ignore malformed events
      }
    };

    return subscribeJobEvents('listings:new', onNewListings);
  }, [t]);

  const handleFilterChange = useMemo(
    () =>
      debounce((value) => {
        setValues({ q: value || null, page: 1 });
      }, 500),
    [],
  );

  useEffect(() => {
    return () => {
      handleFilterChange.cancel?.();
    };
  }, [handleFilterChange]);

  const handleWatch = async (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await xhrPost('/api/listings/watch', { listingId: item.id });
      Toast.success(
        item.isWatched === 1 ? t('listings.toastRemovedFromWatchlist') : t('listings.toastAddedToWatchlist'),
      );
      loadData();
    } catch (e) {
      console.error(e);
      Toast.error(t('listings.toastWatchlistError'));
    }
  };

  const handleStatusChange = async (item, nextStatus) => {
    try {
      await actions.listingsData.setListingStatus(item.id, nextStatus);
      Toast.success(nextStatus ? `Marked as ${nextStatus}` : t('listings.toastStatusCleared'));
      loadData();
    } catch (e) {
      console.error(e);
      Toast.error(t('listings.toastStatusUpdateError'));
    }
  };

  const handleDelete = (id) => {
    if (listingDeletionPref?.skipPrompt) {
      confirmDeletion(listingDeletionPref.hardDelete, false, id);
      return;
    }
    setListingToDelete(id);
    setDeleteModalVisible(true);
  };

  const handleRestore = async (id) => {
    try {
      await actions.listingsData.restoreListings([id]);
      Toast.success(t('listings.toastRestored'));
      loadData();
    } catch (e) {
      console.error(e);
      Toast.error(t('listings.toastRestoreError'));
    }
  };

  const handleReactivate = async (id) => {
    try {
      await actions.listingsData.reactivateListings([id]);
      Toast.success(t('listings.toastReactivated'));
      loadData();
    } catch (e) {
      console.error(e);
      Toast.error(t('listings.toastReactivateError'));
    }
  };

  const handleNavigate = (id) => {
    if (isHiddenView) return;
    navigate(`/listings/listing/${id}`);
  };

  // The store re-throws so a caller can react. These two buttons had no catch at all, so a
  // refused write (a 403 on a locked-down instance) became an unhandled rejection: the toggle
  // silently snapped back and nothing said why.
  const switchViewMode = (mode) => {
    actions.userSettings.setListingsViewMode(mode).catch((error) => {
      Toast.error(errorMessage(error, t('common.settingSaveError')));
    });
  };

  /**
   * Delete everything the current filter matches, not just the page on screen.
   *
   * Deliberately ignores `listingDeletionPref.skipPrompt`. That preference was made for the
   * per-row delete, where one unwanted click costs one listing; here it would cost the whole
   * filtered set without ever saying how large that was.
   *
   * @param {boolean} hardDelete
   */
  const confirmBulkDeletion = async (hardDelete) => {
    try {
      const deleted = await actions.listingsData.deleteFilteredListings({ ...listingsQuery, hardDelete });
      Toast.success(t('listings.toastBulkDeleted', { count: deleted }));
      // Whatever page the user was on may no longer exist, and an out-of-range page renders empty
      // rather than snapping back on its own.
      setPage(1);
      loadData();
    } catch (error) {
      Toast.error(errorMessage(error, t('listings.toastBulkDeleteError')));
    } finally {
      setBulkDeleteVisible(false);
    }
  };

  const confirmDeletion = async (hardDelete, remember, id = listingToDelete) => {
    try {
      if (remember) {
        await actions.userSettings.setListingDeletionPreference({ skipPrompt: true, hardDelete });
      }
      await xhrDelete('/api/listings/', { ids: [id], hardDelete });
      Toast.success(t('listings.toastDeleted'));
      loadData();
    } catch (error) {
      Toast.error(errorMessage(error, t('listings.toastDeleteError')));
    } finally {
      setDeleteModalVisible(false);
      setListingToDelete(null);
    }
  };

  const listings = listingsData?.result || [];

  // Opening a listing and coming back must land where the user left off - the overview is the
  // one view people page through item by item, and starting at the top every time means finding
  // your place by hand on every return.
  useScrollRestoration('listings', listings.length > 0);

  // The filters the quick chips already show as switched on, so the removable chips below do not
  // repeat them.
  const shownAsQuickFilter = quickFilterKeys(values);

  return (
    <div className="listingsOverview">
      <div className="listingsOverview__toolbar">
        <div className="listingsOverview__topbar">
          <Tooltip content={t('listings.filterSearchHelp')} trigger="hover" position="top">
            <span className="listingsOverview__search">
              <Input
                size="large"
                prefix={<IconSearch />}
                showClear
                placeholder={t('listings.searchPlaceholder')}
                defaultValue={freeTextFilter ?? ''}
                onChange={handleFilterChange}
              />
            </span>
          </Tooltip>

          <FilterButton activeCount={activeFilterCount} onClick={() => setFiltersOpen(true)} />

          <FilterSelect
            help={t('listings.filterSortHelp')}
            className="listingsOverview__sort"
            prefix={t('listings.sortPrefix')}
            size="large"
            value={sortField}
            onChange={(val) => setSortField(val)}
          >
            <Select.Option value="job_name">{t('listings.sortByJobName')}</Select.Option>
            {/* The date the portal states, falling back to the day Fredy found the listing - the
                order the list reads in by default. "created_at" alone is the other thing entirely:
                the moment Fredy first saw the advert, whatever the portal says. */}
            <Select.Option value="published_at">{t('listings.sortByListingDate')}</Select.Option>
            <Select.Option value="created_at">{t('listings.sortByDateAdded')}</Select.Option>
            <Select.Option value="price">{t('listings.sortByPrice')}</Select.Option>
            <Select.Option value="provider">{t('listings.sortByProvider')}</Select.Option>
          </FilterSelect>

          <Tooltip
            content={sortDir === 'asc' ? t('listings.sortAscending') : t('listings.sortDescending')}
            trigger="hover"
            position="top"
          >
            <Button
              size="large"
              icon={sortDir === 'asc' ? <IconArrowUp /> : <IconArrowDown />}
              onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
              aria-label={sortDir === 'asc' ? t('listings.sortAscending') : t('listings.sortDescending')}
            />
          </Tooltip>

          {/* Deleting everything the filter matches is rare and cannot be undone, so it sits behind
              the overflow menu instead of as a red bin beside the controls used every day. */}
          <Dropdown
            trigger="click"
            position="bottomRight"
            clickToHide
            render={
              <Dropdown.Menu>
                <Dropdown.Item
                  type="danger"
                  icon={<IconDelete />}
                  disabled={(listingsData?.totalNumber || 0) === 0}
                  onClick={() => setBulkDeleteVisible(true)}
                >
                  {t('listings.bulkDelete')}
                </Dropdown.Item>
              </Dropdown.Menu>
            }
          >
            <Button size="large" icon={<IconMore />} aria-label={t('listings.moreActions')} />
          </Dropdown>

          <div className="listingsOverview__viewToggle" role="group" aria-label={t('listings.viewLabel')}>
            <button
              type="button"
              className={`listingsOverview__viewOption${viewMode === 'grid' ? ' listingsOverview__viewOption--on' : ''}`}
              aria-pressed={viewMode === 'grid'}
              onClick={() => switchViewMode('grid')}
            >
              {t('listings.viewGrid')}
            </button>
            <button
              type="button"
              className={`listingsOverview__viewOption${viewMode === 'table' ? ' listingsOverview__viewOption--on' : ''}`}
              aria-pressed={viewMode === 'table'}
              onClick={() => switchViewMode('table')}
            >
              {t('listings.viewTable')}
            </button>
          </div>
        </div>

        {/* The filters people reach for daily, one click each. Every chip sets the same URL value
            the drawer would; a lit chip is left out of the removable row below, so no filter is
            named twice. */}
        <div className="listingsOverview__quick" role="group" aria-label={t('listings.quickFilters')}>
          {QUICK_FILTERS.map((filter) => {
            const on = filter.isOn(values);
            return (
              <button
                type="button"
                key={filter.id}
                className={`listingsOverview__chip${on ? ' listingsOverview__chip--on' : ''}`}
                aria-pressed={on}
                onClick={() => setValues(filter.toggle(values))}
              >
                {t(filter.labelKey)}
              </button>
            );
          })}
        </div>

        <ActiveFilterChips
          chips={describeActiveFilters(values, { t, jobs, providers }).filter(
            (chip) => !shownAsQuickFilter.has(chip.key),
          )}
          onRemove={(key) => setValues(clearFilter(key))}
          onClearAll={() => setValues(clearAllFilters())}
        />
      </div>

      <ListingsFilterPanel
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        values={values}
        onChange={setValues}
        jobs={jobs}
        providers={providers}
        availableProviders={listingsData?.availableProviders}
        financeComplete={financeComplete}
        affordabilityHelp={affordabilityHelp}
        hasAddresses={hasAddresses}
        connectivityEnabled={generalSettings?.connectivityEnabled === true}
        onAffordabilityUsed={() => actions.tracking.trackPoi(pois.FINANCE_AFFORDABILITY_FILTER_USED)}
        onConnectivityFilterUsed={(kind) =>
          actions.tracking.trackPoi(
            {
              downstream: pois.CONNECTIVITY_FILTER_DOWNSTREAM,
              fiber: pois.CONNECTIVITY_FILTER_FIBER,
              mobile: pois.CONNECTIVITY_FILTER_MOBILE,
            }[kind],
          )
        }
      />

      {newAvailableCount > 0 && (
        <Banner
          type="info"
          fullMode={false}
          closeIcon={null}
          description={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>{t('listings.newAvailableBanner', { count: newAvailableCount })}</span>
              <Button
                size="small"
                theme="solid"
                type="primary"
                onClick={() => {
                  loadDataRef.current();
                  setNewAvailableCount(0);
                }}
                style={{ marginLeft: 16 }}
              >
                {t('listings.reloadButton')}
              </Button>
            </div>
          }
          style={{ marginBottom: 12 }}
        />
      )}

      {isHiddenView && (
        <Banner
          type="info"
          fullMode={false}
          closeIcon={null}
          description={t('listings.hiddenViewBanner')}
          style={{ marginBottom: 12 }}
        />
      )}

      {listings.length === 0 && (
        <Empty
          image={<IllustrationNoResult />}
          darkModeImage={<IllustrationNoResultDark />}
          description={t('listings.empty')}
        />
      )}

      {viewMode === 'grid' ? (
        <ListingsGrid
          listings={listings}
          onWatch={handleWatch}
          onNavigate={handleNavigate}
          onDelete={handleDelete}
          onRestore={handleRestore}
          onReactivate={handleReactivate}
          isHiddenView={isHiddenView}
          onStatusChange={handleStatusChange}
          onApplication={(item) => setApplicationListingId(item.id)}
        />
      ) : (
        <ListingsTable
          listings={listings}
          onWatch={handleWatch}
          onNavigate={handleNavigate}
          onDelete={handleDelete}
          onRestore={handleRestore}
          onReactivate={handleReactivate}
          isHiddenView={isHiddenView}
          onStatusChange={handleStatusChange}
          onApplication={(item) => setApplicationListingId(item.id)}
        />
      )}

      {listings.length > 0 && (
        <div className="listingsOverview__pagination">
          <Pagination
            currentPage={page}
            pageSize={pageSize}
            total={listingsData?.totalNumber || 0}
            onPageChange={setPage}
            showSizeChanger={false}
          />
        </div>
      )}

      {/* The same modal the per-row delete opens, with the count spelled out. In the hidden view the
          rows are soft-deleted already, so a soft delete would do nothing and the modal is reduced
          to its confirm-only form, which means "remove for good". */}
      <ListingDeletionModal
        visible={bulkDeleteVisible}
        defaultDeleteType={defaultDeleteType}
        showOptions={!isHiddenView}
        showRemember={false}
        title={t('listings.bulkDeleteTitle')}
        message={
          isHiddenView
            ? t('listings.bulkDeleteHiddenMessage', { count: listingsData?.totalNumber || 0 })
            : t('listings.bulkDeleteMessage', { count: listingsData?.totalNumber || 0 })
        }
        onConfirm={confirmBulkDeletion}
        onCancel={() => setBulkDeleteVisible(false)}
      />

      <ListingDeletionModal
        visible={deleteModalVisible}
        defaultDeleteType={defaultDeleteType}
        onConfirm={confirmDeletion}
        onCancel={() => {
          setDeleteModalVisible(false);
          setListingToDelete(null);
        }}
      />

      <ApplicationModal
        visible={applicationListingId != null}
        listingId={applicationListingId}
        onCancel={() => setApplicationListingId(null)}
        // Copying the letter sets the status, so the row's status control has to follow it.
        onApplied={loadData}
      />
    </div>
  );
};

export default ListingsOverview;
