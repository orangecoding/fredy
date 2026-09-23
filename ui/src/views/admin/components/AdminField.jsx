/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Popover } from '@douyinfe/semi-ui-19';
import { IconHelpCircle } from '@douyinfe/semi-icons';

import './AdminField.less';

/**
 * One setting: its name, its explanation behind a mark, and the control.
 *
 * Replaces a whole card per value. The System page carried ten cards, seven of which held a single
 * input and together some 450 words of permanently visible help - read once by whoever set the
 * instance up, and in the way on every visit afterwards. `SegmentPart` already made that argument
 * for the job form and grew `helpMode="popover"` out of it; this is the same move one level down.
 *
 * Defined at module scope, not inside the page. A component declared in a render body is a new type
 * on every render, so React unmounts and remounts it and the input loses focus after each keystroke
 * - which is exactly what RoutingPage did, see step 7.
 *
 * @param {Object} props
 * @param {string} props.label
 * @param {string} [props.help] Behind the mark. Omitted where the label says it all.
 * @param {string} [props.htmlFor] Id of the control, so the label actually labels something.
 * @param {string} [props.labelId] Id for the label itself, for a control that cannot be pointed at
 *   with `htmlFor` and takes `aria-labelledby` instead - Semi's Select ignores `aria-label`.
 * @param {boolean} [props.wide=false] Label above the control rather than beside it, for a value as
 *   long as a URL. The Routing page used to write this markup out by hand to get it, and lost the
 *   help mark on the way.
 * @param {boolean} [props.grow=false] Whether the control takes the rest of the row instead of
 *   sitting at its own width. For a free text field, where the value is as long as it is - the
 *   job's name, a path - rather than a number that reads as a column.
 * @param {React.ReactNode} props.children
 * @returns {React.ReactElement}
 */
export default function AdminField({ label, help, htmlFor, labelId, wide = false, grow = false, children }) {
  return (
    <div className={`adminField${wide ? ' adminField--wide' : ''}`}>
      <span className="adminField__label">
        <label htmlFor={htmlFor} id={labelId}>
          {label}
        </label>
        {help && (
          <Popover content={<div className="adminField__help">{help}</div>} position="right" showArrow>
            <span className="adminField__mark" tabIndex={0} role="note" aria-label={help}>
              <IconHelpCircle size="small" />
            </span>
          </Popover>
        )}
      </span>
      <span className={`adminField__control${grow ? ' adminField__control--grow' : ''}`}>{children}</span>
    </div>
  );
}

AdminField.displayName = 'AdminField';
