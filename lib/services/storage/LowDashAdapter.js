import lodash from 'lodash';
import { LowSync } from 'lowdb';
export default class LowdashAdapter extends LowSync {
  constructor(adapter, defaultData = {}) {
    super(adapter, defaultData);
    this.chain = lodash.chain(this).get('data');
  }
}
