import * as FS from 'fs';
import * as Path from 'path';

import _ = require('lodash');
import {
  AbstractWalker,
  IRuleMetadata,
  Replacement,
  RuleFailure,
  Rules,
} from 'tslint';
import {isExportDeclaration, isImportDeclaration} from 'tsutils';
import * as Typescript from 'typescript';

import {Dict} from '../@lang';

const ERROR_MESSAGE_BANNED_IMPORT =
  "This module can not be imported, because it contains internal module with prefix '@' under a parallel directory.";
const ERROR_MESSAGE_BANNED_EXPORT =
  "This module can not be exported, because it contains internal module with prefix '@' under a parallel directory.";
const ERROR_MESSAGE_MISSING_EXPORTS =
  'Missing modules expected to be exported.';

const INDEX_FILE_REGEX = /(?:^|[\\/])index\.((?:js|ts)x?)$/;

const BannedPattern = {
  import: /^(?!(?:\.{1,2}[\\/])+@(?!.*[\\/]@)).*[\\/]@/,
  export: /[\\/]@/,
};

type BannedPatternName = keyof typeof BannedPattern;

/** 根据不同的 tag 返回不同的 fixer */
const fixerBuilder: Dict<(...args: any[]) => Replacement> = {
  removeNotExportFixer: node =>
    new Replacement(node.getStart(), node.getWidth(), ''),
  autoExportModuleFixer: (
    sourceFile: Typescript.SourceFile,
    exportNodesPath: string[],
  ) =>
    new Replacement(
      sourceFile.getStart(),
      sourceFile.getFullWidth(),
      `${[
        sourceFile.getText().trimRight(),
        ...exportNodesPath.map(
          value => `export * from './${removeFileNameExtension(value)}';`,
        ),
      ].join('\n')}\n`,
    ),
};

interface NodeInfo {
  node: Typescript.Node;
  type: 'import' | 'export';
}

/** 需要添加错误的项目 */
interface FailureItem {
  message: string;
  node: Typescript.Node | undefined;
  fixer?: Replacement;
}

export class Rule extends Rules.AbstractRule {
  apply(sourceFile: Typescript.SourceFile): RuleFailure[] {
    return this.applyWithWalker(
      new ScopesModulesWalker(sourceFile, Rule.metadata.ruleName, undefined),
    );
  }

  static metadata: IRuleMetadata = {
    ruleName: 'scoped-modules',
    description: 'No additional parameters are required',
    optionsDescription: '',
    options: undefined,
    type: 'maintainability',
    hasFix: true,
    typescriptOnly: false,
  };
}

class ScopesModulesWalker extends AbstractWalker<undefined> {
  private nodeInfos: NodeInfo[] = [];
  private failureManager = new FailureManager(this);

  walk(sourceFile: Typescript.SourceFile): void {
    for (let statement of sourceFile.statements) {
      if (isImportDeclaration(statement)) {
        this.nodeInfos.push({
          node: statement.moduleSpecifier,
          type: 'import',
        });
      }

      if (isExportDeclaration(statement)) {
        this.nodeInfos.push({
          node: statement.moduleSpecifier!,
          type: 'export',
        });
      }
    }

    this.validate();
  }

  private validateExportsAndImport(
    message: string,
    text: string,
    node: Typescript.Node,
    tag: BannedPatternName,
  ) {
    if (BannedPattern[tag].test(text)) {
      this.failureManager.appendFailure({
        message,
        node,
        fixer: fixerBuilder.removeNotExportFixer(node),
      });
    }
  }

  private validateExports(text: string, node: Typescript.Node) {
    this.validateExportsAndImport(
      ERROR_MESSAGE_BANNED_EXPORT,
      text,
      node,
      'export',
    );
  }

  private validateImport(text: string, node: Typescript.Node) {
    this.validateExportsAndImport(
      ERROR_MESSAGE_BANNED_IMPORT,
      text,
      node,
      'import',
    );
  }

  private validateIndexFile(exportIds: string[]) {
    let fileName = this.sourceFile.fileName;

    if (!INDEX_FILE_REGEX.test(fileName)) {
      return;
    }

    let dirName = getDirnameFromPath(fileName);

    let entryNames = FS.readdirSync(dirName);

    let expectedExportIds = entryNames
      .map(
        (entryName): string | undefined => {
          let entryFullPath = Path.join(dirName, entryName);
          let stats = FS.statSync(entryFullPath);

          if (stats.isFile()) {
            if (INDEX_FILE_REGEX.test(entryName)) {
              return undefined;
            }

            let entryModuleId = `./${removeModuleFileExtension(entryName)}`;

            if (BannedPattern.export.test(entryModuleId)) {
              return undefined;
            }

            return entryModuleId;
          } else if (stats.isDirectory()) {
            let entryNamesInFolder = FS.readdirSync(entryFullPath);

            let hasIndexFile = entryNamesInFolder.some(entryNameInFolder =>
              INDEX_FILE_REGEX.test(entryNameInFolder),
            );

            if (!hasIndexFile) {
              return undefined;
            }

            return `./${entryName}`;
          } else {
            return undefined;
          }
        },
      )
      .filter((entryName): entryName is string => !!entryName);

    let missingExportIds = _.difference(expectedExportIds, exportIds);

    if (missingExportIds.length) {
      this.failureManager.appendFailure({
        node: undefined,
        message: ERROR_MESSAGE_MISSING_EXPORTS,
        fixer: fixerBuilder.autoExportModuleFixer(
          this.sourceFile,
          missingExportIds,
        ),
      });
    }
  }

  private validate() {
    let infos = this.nodeInfos;

    for (let info of infos) {
      if (info.type === 'export') {
        this.validateExports(
          removeQuotes(info.node.getText()),
          info.node.parent!,
        );
      } else if (info.type === 'import') {
        this.validateImport(
          removeQuotes(info.node.getText()),
          info.node.parent!,
        );
      }
    }

    let exportIds = infos
      .filter(info => info.type === 'export')
      .map(info => removeQuotes(info.node.getText()));

    this.validateIndexFile(exportIds);

    this.failureManager.throwFailures();
  }
}

class FailureManager {
  private failureItems: FailureItem[] = [];

  constructor(private ctx: ScopesModulesWalker) {}

  appendFailure(item: FailureItem) {
    this.failureItems.push(item);
  }

  throwFailures() {
    if (this.failureItems.length) {
      for (let item of this.failureItems) {
        if (item.node) {
          let {node, message} = item;
          this.ctx.addFailureAtNode(node, message, item.fixer);
        } else {
          let sourceFile = this.ctx.getSourceFile();
          this.ctx.addFailure(
            sourceFile.getStart(),
            sourceFile.getEnd(),
            ERROR_MESSAGE_MISSING_EXPORTS,
            item.fixer,
          );
        }
      }
    }
  }
}

function removeQuotes(value: string): string {
  let groups = /^(['"])(.*)\1$/.exec(value);
  return groups ? groups[2] : '';
}

function getDirnameFromPath(path: string): string {
  return Path.dirname(path);
}

function removeModuleFileExtension(fileName: string): string {
  return fileName.replace(/\.(?:(?:js|ts)x?|d\.ts)?$/i, '');
}

function removeFileNameExtension(fileName: string) {
  return Path.basename(fileName, Path.extname(fileName));
}