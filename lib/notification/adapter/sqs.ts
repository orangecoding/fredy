import { markdown2Html } from '../../services/markdown.js';
import { NotifierAdapterConfig, SendRequest } from '../notify.js';

export const send = (sendRequest: SendRequest) => {
  // TODO - Add support for the AWS sdk
};

export const config: NotifierAdapterConfig = {
  id: 'sqs',
  name: 'sqs',
  readme: markdown2Html('lib/notification/adapter/sqs.md'),
  description: 'Fredy will send new listings to an sqs queue of your choice',
  fields: {
    accessKeyId: {
      type: 'text',
      label: 'Access Key Id',
      description: 'Access key id for an aws account/role',
    },
    secretAccessKey: {
      type: 'text',
      label: 'Secret Access Key',
      description: 'Secret access key of an aws account/role',
    },
    queueName: {
      type: 'text',
      label: 'Sqs Queue',
      description: 'The queue will all new listings will be pushed',
    },
  },
};
