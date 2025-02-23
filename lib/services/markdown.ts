import markdown$0 from 'markdown';
import fs from 'fs';
const markdown = markdown$0.markdown;
export function markdown2Html(filePath: string): string {
  try {
    const fileContent: string = fs.readFileSync(filePath, 'utf8');
    return markdown.toHTML(fileContent);
  } catch (error: unknown) {
    throw new Error(`Failed to convert markdown file: ${error instanceof Error ? error.message : String(error)}`);
  }
}
