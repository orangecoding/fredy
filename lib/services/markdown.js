const markdown = require('markdown').markdown;
const fs = require('fs');

exports.markdown2Html = function markdown2Html(filePath) {
  return markdown.toHTML(fs.readFileSync(filePath, 'utf8'));
};
