import React from 'react';
import { Modal } from '@douyinfe/semi-ui';
import Logo from '../logo/Logo.jsx';
import { xhrPost } from '../../services/xhr.js';

import './TrackingModal.less';
import inDevelopment from '../../services/developmentMode.js';

const saveResponse = async (analyticsEnabled) => {
  await xhrPost('/api/admin/generalSettings', {
    analyticsEnabled,
  });
};

export default function TrackingModal() {
  if (inDevelopment()) {
    return null;
  }

  return (
    <Modal
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
      <Logo white />
      <div className="trackingModal__description">
        <p>Hey 👋</p>
        <p>Fed up with popups? Yeah, me too. But this one’s important, and I promise it will only appear once ;)</p>
        <p>
          Fredy is completely free (and will always remain free). If you’d like, you can support me by donating through
          my GitHub, but there’s absolutely no obligation to do so.
        </p>
        <p>
          However, it would be a huge help if you’d allow me to collect some analytical data. Wait, before you click
          "no", let me explain. If you agree, Fredy will send a ping to my Mixpanel project each time it runs.
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
