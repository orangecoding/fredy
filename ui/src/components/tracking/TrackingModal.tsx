import React from 'react';
import { Modal } from '@douyinfe/semi-ui';
import Logo from '../logo/Logo.jsx';
import { xhrPost } from '#ui_services/xhr';

import './TrackingModal.less';
import { GeneralSettings } from '#types/GeneralSettings.ts';

const saveResponse = async (analyticsEnabled: boolean) => {
  await xhrPost<Pick<GeneralSettings, 'analyticsEnabled'>>('/api/admin/generalSettings', {
    analyticsEnabled,
  });
};

export default function TrackingModal() {
  return (
    <Modal
      visible={true}
      onOk={async () => {
        await saveResponse(true);
        window.location.reload();
      }}
      onCancel={async () => {
        await saveResponse(false);
        window.location.reload();
      }}
      maskClosable={false}
      closable={false}
      okText="Yes! I want to help"
      cancelText="No, thanks"
    >
      <Logo white />
      <div className="trackingModal__description">
        <p>Hey 👋</p>
        <p>
          Fed up with popups? Yeah, me too. But this one&rsquo;s important, and I promise it will only appear once ;)
        </p>
        <p>
          Fredy is completely free (and will always remain free). If you&rsquo;d like, you can support me by donating
          through my GitHub, but there&rsquo;s absolutely no obligation to do so.
        </p>
        <p>
          However, it would be a huge help if you&rsquo;d allow me to collect some analytical data. Wait, before you
          click &quot;no&quot;, let me explain. If you agree, Fredy will send a ping to my Mixpanel project each time it
          runs.
        </p>
        <p>
          The data includes: names of active adapters/providers, OS, architecture, Node version, and language. The
          information is entirely anonymous and helps me understand which adapters/providers are most frequently used.
        </p>
        <p>Thanks🤘</p>
      </div>
    </Modal>
  );
}
