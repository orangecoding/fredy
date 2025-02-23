// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';
import {Modal} from '@douyinfe/semi-ui';
// @ts-expect-error TS(6142): Module '../logo/Logo.jsx' was resolved to 'C:/Prog... Remove this comment to see the full error message
import Logo from '../logo/Logo.jsx';
import {xhrPost} from '../../services/xhr.js';

import './TrackingModal.less';

const saveResponse = async (analyticsEnabled: any) => {
    await xhrPost('/api/admin/generalSettings', {
        analyticsEnabled
    });
};

export default function TrackingModal() {

    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return <Modal
        visible={true}
        onOk={async () => {
            await saveResponse(true);
            location.reload();
        }}
        onCancel={async () => {
            await saveResponse(false);
            location.reload();
        }}
        maskClosable={false}
        closable={false}
        okText="Yes! I want to help"
        cancelText="No, thanks"
    >
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Logo white/>
        // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
        <div className="trackingModal__description">
            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
            <p>Hey 👋</p>
            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
            <p>Fed up with popups? Yeah, me too. But this one’s important, and I promise it will only appear once ;)</p>
            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
            <p>Fredy is completely free (and will always remain free). If you’d like, you can support me by donating
                // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                through my GitHub, but there’s absolutely no obligation to do so.</p>
            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
            <p>However, it would be a huge
                help if you’d allow me to collect some analytical data. Wait, before you click "no", let me explain. If
                you
                // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                agree, Fredy will send a ping to my Mixpanel project each time it runs.</p>
            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
            <p>The data includes: names of
                active adapters/providers, OS, architecture, Node version, and language. The information is entirely
                // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                anonymous and helps me understand which adapters/providers are most frequently used.</p>
            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
            <p>Thanks🤘</p>
        // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
        </div>
    </Modal>;

}