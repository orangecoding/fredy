import lodash from 'lodash';
import { LowSync } from 'lowdb';
export default class LowdashAdapter extends LowSync {
  constructor(adapter) {
    super(adapter);
    this.chain = lodash.chain(this).get('data');
  }
}
