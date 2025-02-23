import queryString from 'query-string';
export default (_url: any, sortByDateParam: any) => {
  //if no mutation is necessary, just return the original url
  if (sortByDateParam == null) {
    return _url;
  }
  const original = queryString.parseUrl(_url);
  const mutate = queryString.parse(sortByDateParam);
  return `${original.url}?${queryString.stringify({ ...original.query, ...mutate })}`;
};
