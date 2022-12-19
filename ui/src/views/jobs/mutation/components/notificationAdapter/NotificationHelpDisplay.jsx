import React from 'react';
import { Accordion, Icon } from 'semantic-ui-react';

export default function Help({ readme }) {
  const [active, setActive] = React.useState(false);

  return (
    <Accordion>
      <Accordion.Title active={active} index={0} onClick={() => setActive(!active)}>
        <React.Fragment>
          <Icon name="dropdown" /> <span className="providerMutator__helpLink"> More information</span>
        </React.Fragment>
      </Accordion.Title>
      <Accordion.Content active={active} className="providerMutator__helpBox">
        <p dangerouslySetInnerHTML={{ __html: readme }} />
      </Accordion.Content>
    </Accordion>
  );
}
