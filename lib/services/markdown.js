import fs from 'fs';
export function markdown2Html(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}
