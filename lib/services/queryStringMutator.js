const queryString = require('query-string');

/**
 * for Fredy, it is important to sort search results by date, starting with the latest listing. if it is not sorted, we
 * might never actually find the newest results, no matter how many pages we crawl.
 * It has been written in the documentation, but obviously nobody reads docu theses days which is why it's been done
 * automagically now.
 *
 * @param _url actual provider url containing the searchParams
 * @param sortByDateParam param(s) indicating the correct sort order
 * @returns {`${string}?${string}`} correctly formatted url
 */
module.exports = (_url, sortByDateParam) => {
  //if no mutation is necessary, just return the original url
  if (sortByDateParam == null) {
    return _url;
  }

  const original = queryString.parseUrl(_url);
  const mutate = queryString.parse(sortByDateParam);
  return `${original.url}?${queryString.stringify({ ...original.query, ...mutate })}`;
};
