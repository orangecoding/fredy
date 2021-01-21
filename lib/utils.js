function isOneOf(word, arr) {
  if (arr == null || arr.length === 0) {
    return false;
  }
  const expression = String.raw`\b(${arr.join('|')})\b`;
  const blacklist = new RegExp(expression, 'ig');

  return blacklist.test(word);
}

module.exports = { isOneOf };
