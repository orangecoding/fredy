/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Switch, Toast } from '@douyinfe/semi-ui-19';
import { IconAlertTriangle } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import SettingsSaveBar from '../../../components/settingsShell/SettingsSaveBar.jsx';
import { useUnsavedWarning } from '../../../hooks/useUnsavedWarning.js';
import { xhrGet, xhrPost, errorMessage } from '../../../services/xhr';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

import './McpServerPage.less';

/** Where the page reads and writes its settings. */
const ENDPOINT = '/api/user/mcp-server';

/**
 * Longer than this, a description is cut to two lines behind a "More" button. They are written for
 * the assistant, and the long ones explain paging and parameters nobody choosing a switch needs.
 * @type {number}
 */
const LONG_DESCRIPTION = 150;

/**
 * The two groups the tools fall into, keyed off the read-only hint each tool already declares.
 * @type {ReadonlyArray<{key: string, readOnly: boolean, labelKey: string, helpKey: string}>}
 */
const GROUPS = Object.freeze([
  { key: 'read', readOnly: true, labelKey: 'settings.mcp.groupRead', helpKey: 'settings.mcp.groupReadHelp' },
  { key: 'write', readOnly: false, labelKey: 'settings.mcp.groupWrite', helpKey: 'settings.mcp.groupWriteHelp' },
]);

/**
 * Whether two lists hold the same tool names, whatever the order.
 *
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
function sameNames(a, b) {
  return a.length === b.length && a.every((name) => b.includes(name));
}

/**
 * Whether Fredy's MCP server answers for this user at all, and which of its tools it offers.
 *
 * The tools are whatever the server reports. The page keeps no list of its own, so a tool added to
 * the server shows up here, with the title and description the server gives it, without a change in
 * the UI.
 *
 * With the server switched off the tools stay on screen, dimmed: what someone turned off before is
 * kept and is in force again once the server is back on, and hiding the list would hide that.
 *
 * Nothing is editable until the settings have loaded. A save made over a failed load would post an
 * empty list and turn every tool the user had switched off back on.
 *
 * @returns {React.ReactElement}
 */
export default function McpServerPage() {
  const t = useTranslation();
  const [tools, setTools] = useState([]);
  const [saved, setSaved] = useState({ enabled: true, disabledTools: [] });
  const [enabled, setEnabled] = useState(true);
  const [disabledTools, setDisabledTools] = useState([]);
  const [expanded, setExpanded] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * Take what the server answered as both the stored state and the form.
   *
   * @param {{enabled: boolean, disabledTools: string[], tools: Array<{name: string, title: string, description: string, readOnly: boolean}>}} answer
   * @returns {void}
   */
  const take = useCallback((answer) => {
    setTools(answer.tools ?? []);
    setSaved({ enabled: answer.enabled, disabledTools: answer.disabledTools });
    setEnabled(answer.enabled);
    setDisabledTools(answer.disabledTools);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const response = await xhrGet(ENDPOINT);
        take(response.json);
        setLoaded(true);
      } catch (error) {
        Toast.error(errorMessage(error, t('settings.mcp.loadError')));
      }
    })();
  }, [take, t]);

  const dirty = enabled !== saved.enabled || !sameNames(disabledTools, saved.disabledTools);
  useUnsavedWarning(dirty);

  /**
   * @param {string[]} names
   * @param {boolean} on
   * @returns {void}
   */
  const setToolsOn = (names, on) =>
    setDisabledTools((current) =>
      on ? current.filter((name) => !names.includes(name)) : [...new Set([...current, ...names])],
    );

  const discard = () => {
    setEnabled(saved.enabled);
    setDisabledTools(saved.disabledTools);
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await xhrPost(ENDPOINT, { enabled, disabledTools });
      take(response.json);
      Toast.success(t('settings.toastSaved'));
    } catch (error) {
      Toast.error(errorMessage(error, t('settings.userSettingsSaveError')));
    } finally {
      setSaving(false);
    }
  };

  // The status flag in the server section reads `saved`, not the switch: it says what the server
  // does right now, and an unsaved flip of the switch has not changed that yet.
  const toolsLocked = !loaded || !enabled;
  const onCount = tools.filter((tool) => !disabledTools.includes(tool.name)).length;

  return (
    <div className="settingsShell__page">
      <SegmentPart
        name={t('settings.mcp.serverTitle')}
        helpText={t('settings.mcp.serverHelp')}
        action={
          <span className="mcpServerPage__switch">
            <span aria-hidden="true">{t(enabled ? 'settings.mcp.on' : 'settings.mcp.off')}</span>
            <Switch
              checked={enabled}
              disabled={!loaded}
              aria-label={t('settings.mcp.serverTitle')}
              onChange={(checked) => setEnabled(checked)}
            />
          </span>
        }
      >
        <div className="mcpServerPage__status">
          <span className="settingsShell__cardFlag">
            <span
              className={`settingsShell__cardFlagDot${saved.enabled ? ' settingsShell__cardFlagDot--ok' : ''}`}
              aria-hidden="true"
            />
            {t(saved.enabled ? 'settings.mcp.accepting' : 'settings.mcp.refusing')}
          </span>
          <Link to="/settings/connections" className="mcpServerPage__link">
            {t('settings.mcp.connectionsLink')}
          </Link>
        </div>
      </SegmentPart>

      <SegmentPart
        name={t('settings.mcp.toolsTitle')}
        helpText={t('settings.mcp.toolsHelp')}
        action={
          loaded ? (
            <span className="settingsShell__cardFlag">
              {enabled ? t('settings.mcp.toolsCount', { on: onCount, total: tools.length }) : t('settings.mcp.noTools')}
            </span>
          ) : null
        }
      >
        {loaded && !enabled && (
          <p className="settingsShell__helpWarning mcpServerPage__offNotice">
            <IconAlertTriangle size="small" />
            {t('settings.mcp.serverOffNotice')}
          </p>
        )}

        <div className={`mcpServerPage__groups${loaded && !enabled ? ' mcpServerPage__groups--off' : ''}`}>
          {GROUPS.map((group) => {
            const members = tools.filter((tool) => tool.readOnly === group.readOnly);
            if (members.length === 0) {
              return null;
            }
            const names = members.map((tool) => tool.name);
            const groupOn = names.filter((name) => !disabledTools.includes(name)).length;
            const allOn = groupOn === names.length;
            return (
              <section key={group.key} className="mcpServerPage__group" aria-labelledby={`mcp-group-${group.key}`}>
                <div className="mcpServerPage__groupHead">
                  <div className="mcpServerPage__groupText">
                    <h3 id={`mcp-group-${group.key}`} className="mcpServerPage__groupTitle">
                      {t(group.labelKey)}
                      <span className="mcpServerPage__groupCount">
                        {t('settings.mcp.groupCount', { on: groupOn, total: names.length })}
                      </span>
                      {!group.readOnly && <span className="mcpServerPage__writeTag">{t('settings.mcp.writeTag')}</span>}
                    </h3>
                    <p className="mcpServerPage__groupHelp">{t(group.helpKey)}</p>
                  </div>
                  <button
                    type="button"
                    className="mcpServerPage__textButton"
                    disabled={toolsLocked}
                    onClick={() => setToolsOn(names, !allOn)}
                  >
                    {t(allOn ? 'settings.mcp.allOff' : 'settings.mcp.allOn')}
                  </button>
                </div>

                <ul className="mcpServerPage__tools">
                  {members.map((tool) => {
                    const long = tool.description.length > LONG_DESCRIPTION;
                    const open = expanded.includes(tool.name);
                    return (
                      <li key={tool.name} className="mcpServerPage__tool">
                        <div className="mcpServerPage__toolText">
                          <div className="mcpServerPage__toolHead">
                            <span id={`mcp-tool-${tool.name}`} className="mcpServerPage__toolTitle">
                              {tool.title}
                            </span>
                            <code className="mcpServerPage__toolName">{tool.name}</code>
                          </div>
                          <p
                            className={`mcpServerPage__toolDesc${long && !open ? ' mcpServerPage__toolDesc--clamped' : ''}`}
                          >
                            {tool.description}
                          </p>
                          {long && (
                            <button
                              type="button"
                              className="mcpServerPage__textButton"
                              aria-expanded={open}
                              onClick={() =>
                                setExpanded((current) =>
                                  open ? current.filter((name) => name !== tool.name) : [...current, tool.name],
                                )
                              }
                            >
                              {t(open ? 'settings.mcp.less' : 'settings.mcp.more')}
                            </button>
                          )}
                        </div>
                        <Switch
                          checked={!disabledTools.includes(tool.name)}
                          disabled={toolsLocked}
                          aria-labelledby={`mcp-tool-${tool.name}`}
                          onChange={(checked) => setToolsOn([tool.name], checked)}
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </SegmentPart>

      <SettingsSaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={discard} />
    </div>
  );
}

McpServerPage.displayName = 'McpServerPage';
