import * as cookies from "js-cookie";

interface Opts {
  organization: string;
  trackSession?: boolean;
  trackPageView?: boolean;
  contactEmail?: string;
  hasConsent?: boolean;
}

interface DataPoint {
  dataPoint: string;
  value?: any;
}

interface PushDataPointOpts extends DataPoint {
  contactEmail?: string;
}

interface RequestData {
  [key: string]: any;
}

interface PageViewOpts {
  url?: string;
}

interface PageView {
  url: string;
  enter: string;
  exit?: string;
}

const PROFILER_URL = "https://api.profiler.marketing";
const COOKIE_PID_KEY = "__pid";
const COOKIE_SID_KEY = "__psid";

class Profiler {
  private organization: string;
  private hasConsent: boolean;
  private trackSession: boolean;
  private trackPageView: boolean;
  private pid?: string;
  private sid?: string;
  private pageView?: PageView;
  private dpDelayTimerId?: number;
  private contactEmail?: string;

  constructor(opts: Opts) {
    this.organization = opts.organization;
    this.hasConsent = opts.hasConsent || false;
    this.trackSession = opts.trackSession || false;
    this.trackPageView = opts.trackPageView || false;
    this.contactEmail = opts.contactEmail;
    this.readPidFromCookie();
    this.readSidFromCookie();
    this.newSession();
    this.newPageView();
    this.listenForPageUnload();
  }

  public async pushDataPoint(opts: PushDataPointOpts) {
    try {
      const endpoint =
        "organizations/" +
        this.organization +
        "/data-points/" +
        opts.dataPoint +
        "/set";

      await this.network(endpoint, {
        value: opts.value,
        email: opts.contactEmail || this.contactEmail,
      });
    } catch (error) {
      console.error(error);
    }
  }

  public async newSession() {
    try {
      if (
        this.trackSession &&
        document &&
        "referrer" in document &&
        window &&
        "location" in window &&
        !this.sid
      ) {
        const firstParty = window.location.href;
        const thirdParty = document.referrer;

        const json = await this.network(
          "contacts/new-session",
          {
            organization: this.organization,
            email: this.contactEmail,
            firstParty,
            thirdParty,
          },
          true
        );

        if (json && "sessionId" in json) {
          this.setSid(json.sessionId);
        }
      }
    } catch (error) {
      console.error(error);
    }
  }

  public newPageView(opts?: PageViewOpts) {
    if (!!this.pageView) {
      this.endPageView();
    }

    this.pageView = {
      url: !!opts && !!opts.url ? opts.url : window.location.href,
      enter: new Date().toISOString(),
    };

    if (!!this.dpDelayTimerId && window) {
      window.clearInterval(this.dpDelayTimerId);
    }
  }

  private async network(
    endpoint: string,
    data: RequestData,
    asJSON?: boolean
  ): Promise<any> {
    if (!this.hasConsent) {
      return;
    }

    if (typeof this.pid === "string") {
      data["ref"] = this.pid;
    }

    let url = `${PROFILER_URL}/${endpoint}`;

    if (!asJSON) {
      url = url + `?${new URLSearchParams(data).toString()}`;
    }

    const response = await fetch(url, {
      method: "POST",
      mode: "cors",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: asJSON ? JSON.stringify(data) : null,
    });

    const responseJSON = await response.json();

    if (!!responseJSON && "ref" in responseJSON) {
      this.setPid(responseJSON.ref as string);
    }

    return responseJSON;
  }

  private setPid(pid?: string) {
    if (pid) {
      this.pid = pid;

      cookies.set(COOKIE_PID_KEY, pid, {
        expires: 365,
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

    if (typeof pid === "string") {
      this.pid = pid;
    }
  }

  private readSidFromCookie() {
    const sid = cookies.get(COOKIE_SID_KEY);

    if (typeof sid === "string") {
      this.sid = sid;
    }
  }

  private endPageView() {
    if (!!this.pageView) {
      this.pageView.exit = new Date().toISOString();

      if (
        this.trackPageView &&
        !!navigator &&
        "sendBeacon" in navigator &&
        typeof this.pid === "string"
      ) {
        const endpoint =
          PROFILER_URL +
          "/organizations/" +
          this.organization +
          "/page-views/push";

        const data = new FormData();

        data.append("ref", this.pid);

        if (this.sid) {
          data.append("sessionId", this.sid);
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
    if (window && "addEventListener" in window) {
      window.addEventListener("unload", () => this.endPageView());
    }
  }
}

export default Profiler;
