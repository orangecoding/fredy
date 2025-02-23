// @ts-expect-error TS(7016): Could not find a declaration file for module 'mark... Remove this comment to see the full error message
import markdown$0 from 'markdown';
import fs from 'fs';
const markdown = markdown$0.markdown;
export function markdown2Html(filePath: any) {
  return markdown.toHTML(fs.readFileSync(filePath, 'utf8'));
}
