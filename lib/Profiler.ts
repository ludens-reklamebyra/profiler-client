import * as qs from 'qs';
import * as Cookies from 'js-cookie';

const profilerURL = 'https://api.profiler.marketing';

interface Opts {
  organization: string;
  personalize?: boolean;
}

interface DataPoint {
  dataPoint: string;
  value?: any;
}

interface PushDataPointOpts extends DataPoint {
  contactRef?: string;
}

interface PushDataPointsOpts {
  dataPoints: DataPoint[];
  contactRef?: string;
}

interface PushActionOpts {
  category: string;
  action: string;
  label?: string;
  value?: number;
  contactRef?: string;
  contactData?: ContactData;
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

interface ContactData {
  name?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressZip?: string;
  addressCounty?: string;
  addressCity?: string;
  addressCountry?: string;
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
  private contactRef: string | undefined;
  private personalize: boolean;
  private hasPersonalized: boolean = false;
  private hasRegisteredSource: boolean = false;

  constructor(opts: Opts) {
    this.organization = opts.organization;
    this.personalize = opts.personalize || false;
    this.contactRef = Cookies.get('__profiler');

    if (this.personalize && this.contactRef) {
      this.handlePersonalizations();
    }

    this.registerSource();
    this.readMeta();
  }

  public async pushDataPoint(opts: PushDataPointOpts) {
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

  public async pushDataPoints(opts: PushDataPointsOpts) {
    try {
      const promises: Promise<any>[] = [];

      for (let i = 0; i < opts.dataPoints.length; i++) {
        const dp = opts.dataPoints[i];
        const endpoint =
          'organizations/' +
          this.organization +
          '/data-points/' +
          dp.dataPoint +
          '/set';

        promises.push(
          this.network(endpoint, {
            ref: opts.contactRef || this.contactRef,
            value: dp.value
          })
        );
      }

      await Promise.all(promises);
      await this.handlePersonalizations();
    } catch (error) {
      console.error(error);
    }
  }

  public async pushAction(opts: PushActionOpts) {
    try {
      const endpoint = 'organizations/' + this.organization + '/actions/push';

      await this.network(
        endpoint,
        {
          category: opts.category,
          action: opts.action,
          label: opts.label,
          value: opts.value,
          ref: opts.contactRef,
          contactData: opts.contactData
        },
        true
      );

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
      if (!this.contactRef) {
        return [];
      }

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

  public async readMeta() {
    if (window && document) {
      const metas = document.getElementsByTagName('meta');
      const dpsToPush: DataPoint[] = [];

      for (let i = 0; i < metas.length; i++) {
        const meta = metas[i];

        if (meta.getAttribute('name') === 'profiler:interests') {
          const contents = (meta.getAttribute('content') || '').split(',');

          for (let j = 0; j < contents.length; j++) {
            const contentArr = contents[j].split(':');

            if (contentArr.length > 0) {
              const ref = contentArr[0];
              const weight =
                contentArr.length > 1 ? parseInt(contentArr[1]) : undefined;

              dpsToPush.push({
                dataPoint: ref,
                value: weight
              });
            }
          }
        }
      }

      await this.pushDataPoints({ dataPoints: dpsToPush });
    }
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

    const internalResponse = response.clone();

    const json = (await internalResponse.json()) as ResponseBody;

    if (json.ref) {
      Cookies.set('__profiler', json.ref, { expires: 365 * 5 });
      this.contactRef = json.ref;

      if (this.personalize && !this.hasPersonalized && this.contactRef) {
        this.handlePersonalizations();
      }

      if (!this.hasRegisteredSource && this.contactRef) {
        this.registerSource();
      }
    }

    return response;
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
