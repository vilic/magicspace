import {Options, option} from 'clime';

import {DEFAULT_MAGICSPACE_TEMPLATE_DIRNAME} from './@constants';

export class CommonOptions extends Options {
  @option({
    placeholder: 'template-dir',
    default: DEFAULT_MAGICSPACE_TEMPLATE_DIRNAME,
  })
  template!: string;

  @option({
    toggle: true,
    description: 'Force operation under dirty working directory',
    default: false,
  })
  force!: boolean;
}