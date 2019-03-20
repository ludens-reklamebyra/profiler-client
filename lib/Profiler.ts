import * as qs from 'qs';

const profilerURL = 'https://api.profiler.marketing';

interface Opts {
  organization: string;
  personalize?: boolean;
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

interface Personalization {
  _id: string;
  name: string;
  js: string | null;
  html: string | null;
  htmlQuerySelector: string | null;
  htmlPlacement: string | null;
}

interface CollectOpts {
  campaign: string;
  collector: string;
  data: RequestData;
}

const PERSONALIZATION_CLASS_NAME = '__prfPrs';

class Profiler {
  private organization: string;
  private contactRef: string | null;
  private personalize: boolean;
  private hasPersonalized: boolean = false;
  private hasRegisteredSource: boolean = false;

  constructor(opts: Opts) {
    this.organization = opts.organization;
    this.personalize = opts.personalize || false;

    if (window && 'localStorage' in window) {
      this.contactRef = window.localStorage.getItem('profilerRef');
    }

    if (this.personalize && this.contactRef) {
      this.handlePersonalizations();
    }

    this.registerSource();
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

      this.handlePersonalizations();
    } catch (error) {
      console.error(error);
    }
  }

  public async updateContact(opts: UpdateContactOpts) {
    try {
      const endpoint = 'contacts/' + (opts.contactRef || this.contactRef);

      await this.network(endpoint, opts.data, true);

      this.handlePersonalizations();
    } catch (error) {
      console.error(error);
    }
  }

  public async getPersonalizations(): Promise<Personalization[]> {
    try {
      const query = {
        organization: this.organization,
        contactRef: this.contactRef
      };

      const response = await fetch(
        `${profilerURL}/personalization?${qs.stringify(query)}`,
        {
          mode: 'cors'
        }
      );

      if (response.status === 200) {
        return (await response.json()) as Personalization[];
      }

      return [];
    } catch (error) {
      console.error(error);
    }

    return [];
  }

  public async registerSource() {
    try {
      if (
        document &&
        'referrer' in document &&
        window &&
        'location' in window &&
        this.contactRef
      ) {
        const firstParty = window.location.href;
        const thirdParty = document.referrer;

        this.hasRegisteredSource = true;

        await this.network(
          'contacts/' + this.contactRef + '/sources',
          {
            firstParty,
            thirdParty
          },
          true
        );

        this.handlePersonalizations();
      }
    } catch (error) {
      console.error(error);
    }
  }

  public async collect(opts: CollectOpts): Promise<Response> {
    return await this.network(
      'campaigns/' +
        opts.campaign +
        '/collectors/' +
        opts.collector +
        '/collect',
      opts.data,
      true
    );
  }

  private async handlePersonalizations() {
    try {
      if (window) {
        const personalizations = await this.getPersonalizations();

        this.removePersonalizations();

        for (let i = 0; i < personalizations.length; i++) {
          const ps = personalizations[i];

          if (ps.html) {
            const elems = document.querySelectorAll(
              ps.htmlQuerySelector ? ps.htmlQuerySelector : 'body'
            );

            for (let j = 0; j < elems.length; j++) {
              const elem = elems[j];

              if (ps.htmlPlacement === 'replace') {
                elem.innerHTML = this.wrapDom(ps.html);
              } else {
                elem.insertAdjacentHTML(
                  //@ts-ignore How to fix this?
                  ps.htmlPlacement || 'beforeend',
                  this.wrapDom(ps.html)
                );
              }
            }
          }

          if (ps.js) {
            const scriptTag = document.createElement('script');
            scriptTag.innerHTML = ps.js;
            document.body.appendChild(scriptTag);
          }
        }

        this.hasPersonalized = true;
      }
    } catch (error) {
      console.error(error);
    }
  }

  private async network(
    endpoint: string,
    data: RequestData,
    asJSON?: boolean
  ): Promise<Response> {
    let url = `${profilerURL}/${endpoint}`;

    if (!asJSON) {
      url = url + `?${qs.stringify(data)}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json'
      },
      body: asJSON ? JSON.stringify(data) : null
    });

    const json = (await response.json()) as ResponseBody;

    if (json.ref && window && 'localStorage' in window) {
      window.localStorage.setItem('profilerRef', json.ref);
      this.contactRef = json.ref;

      if (this.personalize && !this.hasPersonalized && this.contactRef) {
        this.handlePersonalizations();
      }

      if (!this.hasRegisteredSource && this.contactRef) {
        this.registerSource();
      }
    }

    return response.clone();
  }

  private wrapDom(html: string): string {
    return (
      '<span class="' + PERSONALIZATION_CLASS_NAME + '">' + html + '</span>'
    );
  }

  private removePersonalizations() {
    const elements = document.getElementsByClassName(
      PERSONALIZATION_CLASS_NAME
    );

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      element.remove();
    }
  }
}

export default Profiler;
