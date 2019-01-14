import * as qs from 'qs';

const profilerURL = 'http://localhost:3001';

interface Opts {
  organization: string;
}

interface PushOpts {
  dataPoint: string;
  value?: any;
  contactRef?: string;
}

interface RequestData {
  [key: string]: any;
}

interface ResponseBody {
  message: string;
  ref: string;
}

class Profiler {
  private organization: string;
  private contactRef: string | null;

  constructor(opts: Opts) {
    this.organization = opts.organization;

    if (window && 'localStorage' in window) {
      this.contactRef = window.localStorage.getItem('profilerRef');
    }
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
        ref: opts.contactRef || this.contactRef,
        value: opts.value
      });
    } catch (error) {
      console.error(error);
    }
  }

  private async network(endpoint: string, data: RequestData) {
    try {
      const url = `${profilerURL}/${endpoint}?${qs.stringify(data)}`;

      const response = await fetch(url, {
        method: 'POST'
      });

      const json = (await response.json()) as ResponseBody;

      if (json.ref && window && 'localStorage' in window) {
        window.localStorage.setItem('profilerRef', json.ref);
        this.contactRef = json.ref;
      }
    } catch (error) {
      console.error(error);
    }
  }
}

export default Profiler;
