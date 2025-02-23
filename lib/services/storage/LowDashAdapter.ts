// @ts-expect-error TS(7016): Could not find a declaration file for module 'loda... Remove this comment to see the full error message
import lodash from 'lodash';
import { LowSync } from 'lowdb';
export default class LowdashAdapter extends LowSync {
  chain: any;
  constructor(adapter: any, defaultData = {}) {
    super(adapter, defaultData);
    this.chain = lodash.chain(this).get('data');
  }
}
