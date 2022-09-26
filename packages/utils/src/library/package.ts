import latestVersion from 'latest-version';
import _ from 'lodash';
import type {Dict} from 'tslang';

import {logger} from './@logger';

export interface FetchPackageVersionsOptions {
  /**
   * Defaults to '^'.
   */
  rangePrefix?: string;
}

export async function fetchPackageVersions(
  versionRangeDict: Dict<string>,
): Promise<Dict<string>> {
  logger.info('fetching package versions...');
  logger.info(
    Object.entries(versionRangeDict)
      .map(([name, versionRange]) => `  - ${name}: ${versionRange}`)
      .join('\n'),
  );

  return _.fromPairs(
    await Promise.all(
      Object.entries(versionRangeDict).map(async ([name, versionRange]) => [
        name,
        `^${await latestVersion(name, {version: versionRange})}`,
      ]),
    ),
  );
}
