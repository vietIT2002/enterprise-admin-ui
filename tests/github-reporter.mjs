// A node:test reporter that turns each failing test into a GitHub Actions error annotation, so failures show on
// the pull request next to the file. CI uses it beside the spec reporter (see "test:ci" in package.json).
import { relative } from 'node:path';

// Workflow commands need %, CR and LF escaped in the message, and also : and , in properties.
const escapeData = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escapeProperty = (s) => escapeData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

export default async function* githubReporter(source) {
  for await (const event of source) {
    if (event.type !== 'test:fail') continue;
    const { name, file, line, details } = event.data;
    const error = details && details.error;
    if (error && error.failureType === 'subtestsFailed') continue; // the failing subtest reports itself
    const cause = (error && error.cause) || error;
    const message = (cause && (cause.message || String(cause))) || 'Test failed';
    const props = [file && `file=${escapeProperty(relative(process.cwd(), file).replace(/\\/g, '/'))}`, line && `line=${line}`, `title=${escapeProperty(name)}`]
      .filter(Boolean)
      .join(',');
    yield `::error ${props}::${escapeData(message)}\n`;
  }
}
