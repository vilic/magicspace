import {BinaryFile, JSONFile, TextFile} from '../@files';
import {resolveTemplateConfig} from '../config/config';

import {FileObjectCreator, Project} from './project';

export const DEFAULT_FILE_OBJECT_CREATOR_MAP = new Map<
  string | undefined,
  FileObjectCreator
>([
  [
    undefined,
    (path, possiblePathInProject) => new TextFile(path, possiblePathInProject),
  ],
  [
    'text',
    (path, possiblePathInProject) => new TextFile(path, possiblePathInProject),
  ],
  [
    'binary',
    (path, possiblePathInProject) =>
      new BinaryFile(path, possiblePathInProject),
  ],
  [
    'json',
    (path, possiblePathInProject) => new JSONFile(path, possiblePathInProject),
  ],
]);

export const DEFAULT_EXTENSION_TO_FILE_TYPE_MAP = new Map<string, string>([
  ['.json', 'json'],
]);

export function createDefaultProject(
  projectDir: string,
  templateDir?: string,
): Project {
  let config =
    typeof templateDir === 'string'
      ? resolveTemplateConfig(templateDir)
      : undefined;

  return new Project(
    DEFAULT_FILE_OBJECT_CREATOR_MAP,
    DEFAULT_EXTENSION_TO_FILE_TYPE_MAP,
    projectDir,
    config,
  );
}