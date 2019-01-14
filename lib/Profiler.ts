import * as qs from 'qs';

const profilerURL = 'https://attentionplz.herokuapp.com';

interface Opts {
  organization: string;
}

interface PushOpts {
  dataPoint: string;
  value?: any;
  contactRef?: string;
}

export interface RequestData {
  [key: string]: any;
}

class Profiler {
  private organization: string;

  constructor(opts: Opts) {
    this.organization = opts.organization;
  }

  public async push(opts: PushOpts) {
    try {
      const endpoint =
        'organizations/' +
        this.organization +
        '/data-points/' +
        opts.dataPoint +
        '/set';

      await this.network(endpoint, {
        ref: opts.contactRef,
        value: opts.value
      });
    } catch (error) {
      console.error(error);
    }
  }

  private async network(endpoint: string, data: RequestData) {
    try {
      const url = `${profilerURL}/${endpoint}?${qs.stringify(data)}`;

      await fetch(url, {
        method: 'POST'
      });
    } catch (error) {
      console.error(error);
    }
  }
}

export default Profiler;
