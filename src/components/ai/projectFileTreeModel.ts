import type { ProjectDirNode } from '../../../shared/types';

export type ProjectTreeRow = {
  key: string;
  depth: number;
  node?: ProjectDirNode;
  expanded?: boolean;
  childCount?: number;
  directoryPath?: string;
  kind: 'node' | 'loading' | 'error' | 'empty';
  message?: string;
};

export function flattenProjectTree(
  roots: ProjectDirNode[],
  directories: ReadonlyMap<string, ProjectDirNode[]>,
  expanded: ReadonlySet<string>,
  errors: ReadonlyMap<string, string>,
  searchCollapsed?: ReadonlySet<string>,
): ProjectTreeRow[] {
  const rows: ProjectTreeRow[] = [];
  const visit = (nodes: ProjectDirNode[], depth: number) => {
    for (const node of nodes) {
      const isFolder = node.type === 'directory';
      const isExpanded = isFolder && (searchCollapsed ? !searchCollapsed.has(node.path) : expanded.has(node.path));
      const children = searchCollapsed ? node.children : directories.get(node.path);
      rows.push({ key: node.path, kind: 'node', node, depth, expanded: isExpanded, childCount: children?.length });
      if (!isExpanded) continue;
      const error = !searchCollapsed && errors.get(node.path);
      if (error) {
        rows.push({ key: `${node.path}:error`, kind: 'error', depth: depth + 1, directoryPath: node.path, message: error });
      }
      if (children) {
        if (children.length) visit(children, depth + 1);
        else if (!error) rows.push({ key: `${node.path}:empty`, kind: 'empty', depth: depth + 1 });
      } else if (!error) {
        rows.push({ key: `${node.path}:loading`, kind: 'loading', depth: depth + 1 });
      }
    }
  };
  visit(roots, 0);
  return rows;
}

export function projectTreeWindow(rowCount: number, scrollTop: number, viewportHeight: number, rowHeight = 28) {
  const first = Math.min(Math.max(0, rowCount - 1), Math.floor(Math.max(0, scrollTop) / rowHeight));
  const start = Math.max(0, first - 8);
  const end = Math.min(rowCount, Math.max(first + 1, Math.ceil((Math.max(0, scrollTop) + viewportHeight) / rowHeight)) + 8);
  return { start, end, offset: start * rowHeight, totalHeight: rowCount * rowHeight };
}
