const {NoNewListingsError} = require('./errors');
const Store = require('./services/store');

const notify = require('./notification/notify');
const xray = require('./services/scraper');

class Fredy {
    constructor(source) {
        this._store = new Store(source.name);
        this._fullCrawl = true;
        this._source = source;
        this._stats = null;
    }

    run(stats) {

        if(!this._stats){
            this._stats = stats;
        }

        if (!this._source.enabled) return Promise.resolve();

        return Promise.resolve(this._source.url)
            .then(this._store.warmup)
            .then(this._getListings.bind(this))
            .then(this._normalize.bind(this))
            .then(this._filter.bind(this))
            .then(this._findNew.bind(this))
            .then(this._save.bind(this))
            .then(this._notify.bind(this))
            .then(this._updateStates.bind(this))
            .catch(this._handleError.bind(this))
    }

    _getListings(url) {
        return new Promise((resolve, reject) => {
            let x = xray(url, this._source.crawlContainer, [this._source.crawlFields]);

            if (this._source.paginage && this._fullCrawl) {
                this._fullCrawl = false;
                x = x.paginate(this._source.paginage)
            }

            x((err, listings) => {
                if (err) reject(err);
                else {
                    resolve(listings);
                }
            })
        })
    }

    _normalize(listings) {
        return listings.map(this._source.normalize)
    }

    _filter(listings) {
        return listings.filter(this._source.filter)
    }

    _findNew(listings) {
        const newListings = listings.filter(
            o => this._store.knownListings.indexOf(o.id) === -1
        );

        if (newListings.length === 0) {
            this._updateStates([]);
            throw new NoNewListingsError();
        }

        return newListings
    }

    _notify(newListings) {
        const sendNotifications = notify.send(this._source.name, newListings);
        return Promise.all(sendNotifications).then(() => newListings)
    }

    _updateStates(newListings){
        this._stats.setLastScrape(this._source.name, newListings.length);
        return newListings;
    }

    _save(newListings) {
        this._store.knownListings = [
            ...this._store.knownListings,
            ...newListings.map(l => l.id)
        ];
        return newListings;
    }

    _handleError(err) {
        if (err.name !== 'NoNewListingsError') console.error(err)
    }

    /**
     * for testing purposes only
     * @returns {Store}
     * @private
     */
    _getStore(){
        return this._store;
    }
}

module.exports = Fredy;
