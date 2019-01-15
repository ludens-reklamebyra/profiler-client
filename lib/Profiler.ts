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

interface UpdateContactData {
  name?: string;
  email?: string;
}

interface UpdateContactOpts {
  data: UpdateContactData;
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

  public async updateContact(opts: UpdateContactOpts) {
    try {
      const endpoint = 'contacts/' + (opts.contactRef || this.contactRef);

      await this.network(endpoint, opts.data, true);
    } catch (error) {
      console.error(error);
    }
  }

  private async network(endpoint: string, data: RequestData, asJSON?: boolean) {
    try {
      let url = `${profilerURL}/${endpoint}`;

      if (!asJSON) {
        url = url + `?${qs.stringify(data)}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        cache: 'no-cache',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json'
        },
        body: asJSON ? JSON.stringify(data) : null
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
