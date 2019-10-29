import * as qs from 'qs';
import * as cookies from 'js-cookie';

interface Opts {
  organization: string;
  personalize?: boolean;
  dataPointSetDelay?: number;
  contactEmail?: string;
}

interface UpdateProfileOpts {
  data: {
    name?: string;
    email?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    addressZip?: string;
    addressCity?: string;
    addressCounty?: string;
    addressCountry?: string;
  };
}

interface DataPoint {
  dataPoint: string;
  value?: any;
}

interface PushDataPointOpts extends DataPoint {
  contactEmail?: string;
}

interface PushDataPointsOpts {
  dataPoints: DataPoint[];
  contactEmail?: string;
}

interface PushActionOpts {
  category: string;
  action: string;
  label?: string;
  value?: number;
  contactEmail?: string;
  contactData?: ContactData;
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

interface PageViewOpts {
  url?: string;
}

interface PageView {
  url: string;
  enter: string;
  exit?: string;
}

const PROFILER_URL = 'https://api.profiler.marketing';
const PERSONALIZATION_CLASS_NAME = '__prfPrs';
const COOKIE_PID_KEY = '__pid';
const COOKIE_SID_KEY = '__psid';
const DEFAULT_DP_DELAY = 10000;

class Profiler {
  private organization: string;
  private personalize: boolean;
  private dpDelay: number;
  private pid?: string;
  private sid?: string;
  private pageView?: PageView;
  private dpDelayTimerId?: number;
  private contactEmail?: string;

  constructor(opts: Opts) {
    this.organization = opts.organization;
    this.personalize = opts.personalize || false;
    this.dpDelay = opts.dataPointSetDelay || DEFAULT_DP_DELAY;
    this.contactEmail = opts.contactEmail;
    this.readPidFromCookie();
    this.readSidFromCookie();
    this.handlePersonalizations();
    this.newSession();
    this.newPageView();
    this.listenForPageUnload();
  }

  public async updateProfile(opts: UpdateProfileOpts) {
    try {
      const endpoint = 'contacts/update';

      await this.network(endpoint, opts.data, true);

      this.handlePersonalizations();
    } catch (error) {
      console.error(error);
    }
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
        value: opts.value,
        email: opts.contactEmail || this.contactEmail
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
            value: dp.value,
            email: opts.contactEmail || this.contactEmail
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
          email: opts.contactEmail || this.contactEmail,
          contactData: opts.contactData
        },
        true
      );

      this.handlePersonalizations();
    } catch (error) {
      console.error(error);
    }
  }

  public async getPersonalizations(): Promise<Personalization[]> {
    try {
      const query = {
        organization: this.organization,
        ref: this.pid
      };

      const response = await fetch(
        `${PROFILER_URL}/personalization?${qs.stringify(query)}`,
        {
          mode: 'cors',
          credentials: 'include'
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

  public async newSession() {
    try {
      if (
        document &&
        'referrer' in document &&
        window &&
        'location' in window &&
        !this.sid
      ) {
        const firstParty = window.location.href;
        const thirdParty = document.referrer;

        const json = await this.network(
          'contacts/new-session',
          {
            organization: this.organization,
            email: this.contactEmail,
            firstParty,
            thirdParty
          },
          true
        );

        this.handlePersonalizations();

        if (json && 'sessionId' in json) {
          this.setSid(json.sessionId);
        }
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

  public readMeta() {
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

      if (dpsToPush.length > 0 && window) {
        this.dpDelayTimerId = window.setTimeout(() => {
          this.pushDataPoints({ dataPoints: dpsToPush });
        }, this.dpDelay);
      }
    }
  }

  public newPageView(opts?: PageViewOpts) {
    if (!!this.pageView) {
      this.endPageView();
    }

    this.pageView = {
      url: !!opts && !!opts.url ? opts.url : window.location.href,
      enter: new Date().toISOString()
    };

    if (!!this.dpDelayTimerId && window) {
      window.clearInterval(this.dpDelayTimerId);
    }

    this.readMeta();
  }

  private async handlePersonalizations() {
    try {
      if (!this.personalize) {
        return;
      }

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
      }
    } catch (error) {
      console.error(error);
    }
  }

  private async network(
    endpoint: string,
    data: RequestData,
    asJSON?: boolean
  ): Promise<any> {
    if (typeof this.pid === 'string') {
      data['ref'] = this.pid;
    }

    let url = `${PROFILER_URL}/${endpoint}`;

    if (!asJSON) {
      url = url + `?${qs.stringify(data)}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: asJSON ? JSON.stringify(data) : null
    });

    const responseJSON = await response.json();

    if (!!responseJSON && 'ref' in responseJSON) {
      this.setPid(responseJSON.ref as string);
    }

    return responseJSON;
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

  private setPid(pid?: string) {
    if (pid) {
      this.pid = pid;

      cookies.set(COOKIE_PID_KEY, pid, {
        expires: 365
      });
    }
  }

  private setSid(sid?: string) {
    if (sid) {
      this.sid = sid;

      cookies.set(COOKIE_SID_KEY, sid);
    }
  }

  private readPidFromCookie() {
    const pid = cookies.get(COOKIE_PID_KEY);

    if (typeof pid === 'string') {
      this.pid = pid;
    }
  }

  private readSidFromCookie() {
    const sid = cookies.get(COOKIE_SID_KEY);

    if (typeof sid === 'string') {
      this.sid = sid;
    }
  }

  private endPageView() {
    if (!!this.pageView) {
      this.pageView.exit = new Date().toISOString();

      if (
        !!navigator &&
        'sendBeacon' in navigator &&
        typeof this.pid === 'string'
      ) {
        const endpoint =
          PROFILER_URL +
          '/organizations/' +
          this.organization +
          '/page-views/push';

        const data = new FormData();

        data.append('ref', this.pid);

        if (this.sid) {
          data.append('sessionId', this.sid);
        }

        for (const key in this.pageView) {
          if (this.pageView.hasOwnProperty(key)) {
            data.append(key, this.pageView[key]);
          }
        }

        navigator.sendBeacon(endpoint, data);
      }

      this.pageView = undefined;
    }
  }

  private listenForPageUnload() {
    if (window && 'addEventListener' in window) {
      window.addEventListener('unload', () => this.endPageView());
    }
  }
}

export default Profiler;
