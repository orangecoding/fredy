import markdown$0 from 'markdown';
import fs from 'fs';
const markdown = markdown$0.markdown;
export function markdown2Html(filePath) {
  return markdown.toHTML(fs.readFileSync(filePath, 'utf8'));
}
