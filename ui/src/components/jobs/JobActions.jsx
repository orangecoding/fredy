/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button, Dropdown, Tooltip } from '@douyinfe/semi-ui-19';
import { IconCopy, IconDelete, IconDescend2, IconEdit, IconMore, IconPlayCircle } from '@douyinfe/semi-icons';

import './JobActions.less';
import { useTranslation } from '../../services/i18n/i18n.jsx';

/**
 * Everything you can do to a job, in one place for both views.
 *
 * The grid and the table used to build these five buttons separately, with different components
 * for the hover hint and two parallel sets of translation keys. Two implementations of one meaning
 * is how the views drift apart, and the deletes are exactly where drifting is expensive.
 *
 * @param {Object} props
 * @param {Object} props.job
 * @param {'card'|'row'} props.density Which actions stay visible; the rest move into the menu.
 * @param {(id: string) => void} props.onRun
 * @param {(id: string) => void} props.onEdit
 * @param {(id: string) => void} props.onClone
 * @param {(id: string) => void} props.onDeleteListings
 * @param {(id: string) => void} props.onDeleteJob
 * @returns {React.ReactElement}
 */
const JobActions = ({ job, density, onRun, onEdit, onClone, onDeleteListings, onDeleteJob }) => {
  const t = useTranslation();

  /*
   * Duplicating is harmless, so where it sits is only a question of room: the card has it, the
   * row does not and folds it into the menu with the rest. Both deletes are in the menu either
   * way. Two red squares side by side, told apart by a 12px icon, were the page's most dangerous
   * control and its least legible one; below they are words, and a line keeps them off the end of
   * the harmless half.
   */
  const cloneIsHidden = density === 'row';

  const overflow = (
    <Dropdown.Menu className="jobActions__menu">
      {cloneIsHidden && (
        <>
          <Dropdown.Item icon={<IconCopy />} disabled={job.isOnlyShared} onClick={() => onClone(job.id)}>
            {t('jobs.popoverCloneJob')}
          </Dropdown.Item>
          {/* Only where there is something above it to separate. In the card the menu holds the
              two deletes and nothing else, and a line above the first item divides nothing. */}
          <Dropdown.Divider />
        </>
      )}
      {/* Not disabled for a shared job, unlike its neighbours: the listings of a shared job
          are the shared part, and the API has always let anyone the job was shared with
          delete them one by one from the overview. Greying this out only hid the faster
          route to the same thing. Deleting the job itself stays with its owner. */}
      <Dropdown.Item icon={<IconDescend2 />} type="danger" onClick={() => onDeleteListings(job.id)}>
        {t('jobs.popoverDeleteListings')}
      </Dropdown.Item>
      <Dropdown.Item
        icon={<IconDelete />}
        type="danger"
        disabled={job.isOnlyShared}
        onClick={() => onDeleteJob(job.id)}
      >
        {t('jobs.popoverDeleteJob')}
      </Dropdown.Item>
    </Dropdown.Menu>
  );

  return (
    <div className={`jobActions jobActions--${density}`}>
      <Tooltip content={t('jobs.popoverRunJob')}>
        <Button
          className="jobActions__run"
          type="tertiary"
          theme="outline"
          icon={<IconPlayCircle />}
          aria-label={t('jobs.actionRun')}
          disabled={job.isOnlyShared || job.running}
          onClick={() => onRun(job.id)}
        >
          {t('jobs.actionRun')}
        </Button>
      </Tooltip>

      <Tooltip content={t('jobs.popoverEditJob')}>
        <Button
          className="jobActions__icon"
          type="tertiary"
          theme="borderless"
          icon={<IconEdit />}
          aria-label={t('jobs.popoverEditJob')}
          disabled={job.isOnlyShared}
          onClick={() => onEdit(job.id)}
        />
      </Tooltip>

      {!cloneIsHidden && (
        <Tooltip content={t('jobs.popoverCloneJob')}>
          <Button
            className="jobActions__icon"
            type="tertiary"
            theme="borderless"
            icon={<IconCopy />}
            aria-label={t('jobs.popoverCloneJob')}
            disabled={job.isOnlyShared}
            onClick={() => onClone(job.id)}
          />
        </Tooltip>
      )}

      <Dropdown trigger="click" position="bottomRight" clickToHide className="jobActions__menuPopup" render={overflow}>
        <Button
          className="jobActions__icon"
          type="tertiary"
          theme="borderless"
          icon={<IconMore />}
          aria-label={t('jobs.moreActions')}
        />
      </Dropdown>
    </div>
  );
};

export default JobActions;
