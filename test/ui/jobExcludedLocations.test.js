/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import { isJobDirty } from '../../ui/src/services/jobs/jobDirty.js';
import { resolveJobFormSource } from '../../ui/src/services/jobs/jobFormSource.js';
import { loadDraft, saveDraft } from '../../ui/src/services/jobs/jobDraft.js';

// As in the settings-hook tests, only browser/network APIs and UI children are stubbed. The real
// job form controls its state, creates its payload, and saves/restores its real session draft.
const harness = vi.hoisted(() => ({ cells: [], cursor: 0, effects: [], storage: new Map() }));
const io = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn(), channels: vi.fn(), navigate: vi.fn() }));
const state = vi.hoisted(() => ({
  jobsData: { jobs: [], shareableUserList: [] },
  notificationChannels: { channels: [] },
}));
const actions = vi.hoisted(() => ({
  jobsData: { getJobs: io.refresh },
  notificationChannels: { getChannels: io.channels },
}));

vi.mock('react', async (original) => ({
  ...(await original()),
  useState(initial) {
    const index = harness.cursor++;
    if (!(index in harness.cells)) harness.cells[index] = initial;
    return [
      harness.cells[index],
      (value) => {
        harness.cells[index] = typeof value === 'function' ? value(harness.cells[index]) : value;
      },
    ];
  },
  useRef(initial) {
    const index = harness.cursor++;
    return (harness.cells[index] ??= { current: initial });
  },
  useCallback: (fn) => fn,
  useEffect(effect, deps) {
    const index = harness.cursor++;
    const previous = harness.cells[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) {
      harness.cells[index] = deps;
      harness.effects.push(effect);
    }
  },
}));
vi.mock('@douyinfe/semi-ui-19', () => ({
  Input: function Input() {},
  Switch: function Switch() {},
  Button: function Button() {},
  TagInput: function TagInput() {},
  Select: { Option: function Option() {} },
  Banner: function Banner() {},
  Collapse: { Panel: function Panel() {} },
  Toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@douyinfe/semi-icons', () => ({
  IconArrowLeft: function IconArrowLeft() {},
  IconBell: function IconBell() {},
  IconBriefcase: function IconBriefcase() {},
  IconPlus: function IconPlus() {},
}));
vi.mock('react-router', () => ({
  useNavigate: () => io.navigate,
  useParams: () => ({}),
  useLocation: () => ({ pathname: '/jobs/new', search: '' }),
}));
vi.mock('../../ui/src/services/state/store', () => ({
  useActions: () => actions,
  useSelector: (selector) => selector(state),
}));
vi.mock('../../ui/src/services/xhr', () => ({ xhrPost: io.post, errorMessage: () => 'error' }));
vi.mock('../../ui/src/services/i18n/i18n.jsx', () => ({ useTranslation: () => (key) => key, useLocale: () => 'en' }));
vi.mock('../../ui/src/hooks/useUnsavedWarning.js', () => ({ useUnsavedWarning: () => {} }));
vi.mock('../../ui/src/components/cards/chartTheme.js', () => ({ formatEuro: (value) => String(value) }));
vi.mock('../../ui/src/components/segment/SegmentPart', () => ({ SegmentPart: function SegmentPart() {} }));
vi.mock('../../ui/src/components/headline/Headline', () => ({ default: function Headline() {} }));
vi.mock('../../ui/src/components/settingsShell/SettingsEmptyState', () => ({
  default: function SettingsEmptyState() {},
}));
vi.mock('../../ui/src/components/settingsShell/SettingsSaveBar.jsx', () => ({
  default: function SettingsSaveBar() {},
}));
vi.mock('../../ui/src/views/admin/components/AdminField.jsx', () => ({ default: function AdminField() {} }));
vi.mock('../../ui/src/components/table/NotificationChannelTable', () => ({
  default: function NotificationChannelTable() {},
}));
vi.mock('../../ui/src/components/table/ProviderTable', () => ({ default: function ProviderTable() {} }));
vi.mock('../../ui/src/views/jobs/mutation/JobReadinessBar.jsx', () => ({ default: function JobReadinessBar() {} }));
vi.mock('../../ui/src/views/jobs/mutation/components/notificationAdapter/NotificationChannelPicker', () => ({
  default: function NotificationChannelPicker() {},
}));
vi.mock('../../ui/src/views/jobs/mutation/components/notificationAdapter/NotificationChannelEditor', () => ({
  default: function NotificationChannelEditor() {},
}));
vi.mock('../../ui/src/views/jobs/mutation/components/provider/ProviderMutator', () => ({
  default: function ProviderMutator() {},
}));
vi.mock('../../ui/src/views/jobs/mutation/components/areaFilter/AreaFilter', () => ({
  default: function AreaFilter() {},
}));
vi.mock('../../ui/src/views/jobs/mutation/components/CommuteFilter.jsx', () => ({
  default: function CommuteFilter() {},
}));

const { default: JobMutation } = await import('../../ui/src/views/jobs/mutation/JobMutation.jsx');
// Obtain the form that the public route renders without adding a test-only production export.
const JobForm = JobMutation().type;

function find(node, predicate) {
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  if (node == null || typeof node !== 'object') return undefined;
  return predicate(node) ? node : find(node.props?.children, predicate);
}

function render(source) {
  harness.cursor = 0;
  let tree = JobForm({ source });
  while (harness.effects.length) {
    harness.effects.splice(0).forEach((effect) => effect());
    harness.cursor = 0;
    tree = JobForm({ source });
  }
  return {
    locations: find(tree, (node) => node.props?.['aria-label'] === 'jobs.mutation.excludedLocations'),
    saveBar: find(tree, (node) => node.type?.name === 'SettingsSaveBar'),
  };
}

describe('excluded locations belong to the job form', () => {
  beforeEach(() => {
    harness.cells = [];
    harness.cursor = 0;
    harness.effects = [];
    harness.storage.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (key) => harness.storage.get(key) ?? null,
      setItem: (key, value) => harness.storage.set(key, value),
      removeItem: (key) => harness.storage.delete(key),
    });
    io.post.mockReset();
    io.post.mockResolvedValue(undefined);
    io.refresh.mockReset();
    io.refresh.mockResolvedValue(undefined);
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each([{}, { jobId: 'job-1' }])('defaults to [] for new and existing jobs without the field: %o', (params) => {
    const source = resolveJobFormSource({ jobs: [{ id: 'job-1' }], ...params });
    expect(render(source).locations?.props.value).toEqual([]);
  });

  it.each(['edit', 'clone'])('saves exclusions in %s mode', async (mode) => {
    const job = { id: 'job-1', name: 'Berlin', excludedLocations: ['Neukölln', 'Spandau'] };
    const source = resolveJobFormSource({
      jobs: [job],
      ...(mode === 'edit' ? { jobId: job.id } : { cloneFrom: job.id }),
    });
    expect(render(source).locations?.props.value).toEqual(job.excludedLocations);
    if (mode === 'edit') render(source).locations.props.onChange(['Wedding']);
    await render(source).saveBar.props.onSave();
    expect(io.post).toHaveBeenCalledWith(
      '/api/jobs',
      expect.objectContaining({
        excludedLocations: mode === 'edit' ? ['Wedding'] : job.excludedLocations,
        jobId: mode === 'edit' ? job.id : null,
      }),
    );
  });

  it('saves a new job with the exclusions entered in its TagInput', async () => {
    const source = resolveJobFormSource({ jobs: [] });
    const form = render(source);
    expect(form.locations?.type.name).toBe('TagInput');
    form.locations.props.onChange(['Neukölln']);
    expect(render(source).saveBar.props.dirty).toBe(true);
    expect(loadDraft(source.draftId).excludedLocations).toEqual(['Neukölln']);
    await render(source).saveBar.props.onSave();
    expect(io.post).toHaveBeenCalledWith('/api/jobs', expect.objectContaining({ excludedLocations: ['Neukölln'] }));
  });

  it('restores a job draft, detects the change, and discards back to stored exclusions', () => {
    const source = resolveJobFormSource({ jobs: [{ id: 'job-1', excludedLocations: ['Spandau'] }], jobId: 'job-1' });
    saveDraft(source.draftId, { excludedLocations: ['Neukölln'] });
    const restored = render(source);
    expect(restored.locations?.props.value).toEqual(['Neukölln']);
    expect(restored.saveBar.props.dirty).toBe(true);
    restored.saveBar.props.onDiscard();
    const discarded = render(source);
    expect(discarded.locations?.props.value).toEqual(['Spandau']);
    expect(discarded.saveBar.props.dirty).toBe(false);
    expect(loadDraft(source.draftId)).toBeNull();
  });

  it('tracks exclusions in dirty-state detection while old missing values equal []', () => {
    expect(isJobDirty({ excludedLocations: ['Neukölln'] }, { excludedLocations: [] })).toBe(true);
    expect(isJobDirty({ excludedLocations: [] }, {})).toBe(false);
  });

  it('restores an older draft without replacing the job’s exclusions', () => {
    const source = resolveJobFormSource({
      jobs: [{ id: 'job-1', name: 'Berlin', excludedLocations: ['Neukölln'] }],
      jobId: 'job-1',
    });
    saveDraft(source.draftId, { name: 'Updated Berlin search' });
    expect(render(source).locations.props.value).toEqual(['Neukölln']);
  });

  it.each(['de', 'en', 'es', 'fr', 'it', 'tr'])(
    'moves the translated control and summary into job settings in %s',
    (locale) => {
      const translations = JSON.parse(fs.readFileSync(new URL(`../../ui/src/locales/${locale}.json`, import.meta.url)));
      for (const key of [
        'excludedLocations',
        'excludedLocationsHelp',
        'excludedLocationsPlaceholder',
        'summaryExcludedLocations',
      ]) {
        expect(translations[`jobs.mutation.${key}`], key).toBeTypeOf('string');
      }
      expect(translations).not.toHaveProperty(['settings.excludedLocations']);
    },
  );
});
