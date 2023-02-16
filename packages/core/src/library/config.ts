import * as Path from 'path';

import resolve from 'enhanced-resolve';
import _ from 'lodash';
import {__importDefault} from 'tslib';
import * as x from 'x-value';

import type {
  Boilerplate,
  BoilerplateComposable,
  BoilerplateModule,
  BoilerplateScriptsLifecycleName,
} from './boilerplate';

const hasOwnProperty = Object.prototype.hasOwnProperty;

export const MagicspaceBoilerplateConfig = x.object({
  boilerplate: x.string,
  options: x.object({}),
});

export type MagicspaceBoilerplateConfig = x.TypeOf<
  typeof MagicspaceBoilerplateConfig
>;

export interface MagicspaceConfig {
  /**
   * Composable file entries to be resolved.
   */
  composables: BoilerplateComposable[];
  /**
   * Boilerplate lifecycle scripts.
   */
  scripts: MagicspaceConfigScripts;
}

export interface MagicspaceConfigScripts {
  postgenerate: MagicspaceConfigScript[];
}

export interface MagicspaceConfigScript {
  source: string;
  script: string;
}

export function resolveMagicspaceBoilerplateModule(magicspaceDir: string): {
  path: string;
  module: MagicspaceBoilerplateConfig | MagicspaceBoilerplateConfig[];
} {
  const path = require.resolve(Path.join(magicspaceDir, 'boilerplate'));
  return {path, module: __importDefault(require(path)).default};
}

export function resolveBoilerplateModule(
  specifier: string,
  dir: string,
): BoilerplateModule {
  const boilerplateModulePath =
    resolve.sync(dir, specifier) ||
    // Fallback to magicspace installation location.
    resolve.sync(__dirname, specifier);

  if (!boilerplateModulePath) {
    throw new Error(
      `Cannot resolve boilerplate ${JSON.stringify(
        specifier,
      )} from ${JSON.stringify(Path.relative(process.cwd(), dir))}`,
    );
  }

  return __importDefault(require(boilerplateModulePath));
}

export async function resolveMagicspaceConfig(
  magicspaceDir: string,
): Promise<MagicspaceConfig> {
  const {path: configPath, module: configExport} =
    resolveMagicspaceBoilerplateModule(magicspaceDir);

  const configs = Array.isArray(configExport) ? configExport : [configExport];

  const boilerplates: Boilerplate[] = [];

  const configDir = Path.dirname(configPath);

  for (const config of configs) {
    MagicspaceBoilerplateConfig.asserts(config);

    const {boilerplate: boilerplateSpecifier, options} = config;

    const {default: boilerplateBuilder, Options} = resolveBoilerplateModule(
      boilerplateSpecifier,
      configDir,
    );

    if (Options) {
      Options.asserts(options);
    }

    boilerplates.push(await boilerplateBuilder(options));
  }

  const aggregatedBoilerplateComposables: BoilerplateComposable[] = [];

  const aggregatedScriptsEntries = Object.entries({
    postgenerate: [],
  } satisfies MagicspaceConfigScripts) as [
    BoilerplateScriptsLifecycleName,
    MagicspaceConfigScript[],
  ][];

  for (const boilerplate of boilerplates) {
    extractBoilerplates(boilerplate);
  }

  const composables = _.uniqBy(
    aggregatedBoilerplateComposables,
    composable => `${composable.source}:${composable.target}`,
  );

  const scripts = Object.fromEntries(
    aggregatedScriptsEntries.map(([name, entries]) => [name, _.uniq(entries)]),
  ) as unknown as MagicspaceConfigScripts;

  return {
    composables,
    scripts,
  };

  function extractBoilerplates({
    extends: extendedBoilerplates,
    composables: boilerplateComposables,
    scripts: boilerplateScripts,
    filename,
  }: Boilerplate): void {
    if (extendedBoilerplates) {
      extendedBoilerplates = Array.isArray(extendedBoilerplates)
        ? extendedBoilerplates
        : [extendedBoilerplates];

      for (const extendedBoilerplate of extendedBoilerplates) {
        extractBoilerplates(extendedBoilerplate);
      }
    }

    if (boilerplateComposables) {
      aggregatedBoilerplateComposables.push(...boilerplateComposables);
    }

    if (boilerplateScripts) {
      for (const [name, aggregatedScriptEntries] of aggregatedScriptsEntries) {
        if (hasOwnProperty.call(boilerplateScripts, name)) {
          const script = boilerplateScripts[name];

          if (typeof script === 'string') {
            aggregatedScriptEntries.push({
              source: filename,
              script,
            });
          }
        }
      }
    }
  }
}