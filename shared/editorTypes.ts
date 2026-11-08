export interface ProjectTextFile {
  path: string;
  relativePath: string;
  content: string;
  lineEnding: '\n' | '\r\n';
  revision: string;
}
