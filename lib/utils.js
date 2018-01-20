function isOneOf (word, arr) {
  const expression = String.raw`\b(${arr.join('|')})\b`;
  const blacklist = new RegExp(expression, 'ig');

  return blacklist.test(word)
}

module.exports = { isOneOf };
