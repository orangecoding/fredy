import lodash from 'lodash';
import { LowSync, SyncAdapter } from 'lowdb';

export default class LowdashAdapter<T extends object> extends LowSync<T> {
  chain: lodash.ExpChain<this['data']>;

  constructor(adapter: SyncAdapter<T>, defaultData: T) {
    super(adapter, defaultData);
    this.chain = lodash.chain(this).get('data');
  }
}
