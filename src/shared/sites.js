// Where Margin underlines terms. By default only on school and learning sites, so a term like
// "mean" or "set" doesn't light up your email or YouTube. Users can turn any site on or off,
// or switch to "everywhere" in Settings.

// School domains: wisc.edu, ox.ac.uk, unimelb.edu.au, k12 districts, …
const SCHOOL_SUFFIX = /(^|\.)(edu|ac\.[a-z]{2}|edu\.[a-z]{2}|k12\.[a-z]{2}\.us|sch\.[a-z]{2})$/;

// Learning sites, matched on the domain or any subdomain (canvas.wisc.edu is covered by .edu;
// wisc.instructure.com by instructure.com).
const STUDY_DOMAINS = [
  // Course platforms
  "instructure.com", "canvas.net", "blackboard.com", "d2l.com", "brightspace.com", "desire2learn.com",
  "moodlecloud.com", "schoology.com", "classroom.google.com",
  // Course tools, lecture video and homework
  "gradescope.com", "piazza.com", "edstem.org", "tophat.com", "perusall.com", "hypothes.is",
  "kaltura.com", "panopto.com", "yuja.com", "echo360.com", "echo360.org",
  "mheducation.com", "pearson.com", "cengage.com", "wileyplus.com", "macmillanlearning.com",
  "webassign.net", "zybooks.com", "vitalsource.com", "quizlet.com", "chegg.com", "coursehero.com", "studocu.com",
  // Open courses and textbooks
  "openstax.org", "libretexts.org", "khanacademy.org", "coursera.org", "edx.org", "ck12.org",
  "brilliant.org", "codecademy.com", "freecodecamp.org",
  // Reference and research
  "wikipedia.org", "wikibooks.org", "britannica.com", "scholar.google.com", "jstor.org", "arxiv.org",
  "ncbi.nlm.nih.gov", "nih.gov", "nist.gov", "sciencedirect.com", "springer.com", "nature.com",
  "researchgate.net", "semanticscholar.org", "investopedia.com", "wolfram.com", "desmos.com",
  // Programming docs
  "developer.mozilla.org", "docs.python.org", "cppreference.com", "cplusplus.com", "docs.oracle.com",
  "w3schools.com", "geeksforgeeks.org", "stackoverflow.com",
];

// Sites Margin never runs on (it can't highlight inside their editors yet).
export const BLOCKED_HOSTS = new Set(["docs.google.com"]);

const onDomain = (host, d) => host === d || host.endsWith("." + d);

export function isStudySite(host) {
  host = (host || "").toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  return SCHOOL_SUFFIX.test(host) || STUDY_DOMAINS.some((d) => onDomain(host, d));
}

/**
 * Should Margin underline terms on this host?
 * @param {object} settings  Margin settings (enabled, scope, allowedHosts, disabledHosts)
 * @param {string} host      location.hostname ("" for file:// pages)
 * @param {string} [protocol] location.protocol
 */
export function siteActive(settings, host, protocol = "https:") {
  if (!settings.enabled) return false;
  if (protocol === "file:") return true; // your own notes and PDFs
  if (BLOCKED_HOSTS.has(host)) return false;
  if (settings.disabledHosts?.includes(host)) return false;
  if (settings.scope === "everywhere") return true;
  return isStudySite(host) || !!settings.allowedHosts?.includes(host);
}

/** Settings patch that turns Margin on or off for one host. */
export function setSiteOn(settings, host, on) {
  const disabled = new Set(settings.disabledHosts || []);
  const allowed = new Set(settings.allowedHosts || []);
  if (on) {
    disabled.delete(host);
    if (settings.scope !== "everywhere" && !isStudySite(host)) allowed.add(host);
  } else {
    allowed.delete(host);
    disabled.add(host);
  }
  return { disabledHosts: [...disabled], allowedHosts: [...allowed] };
}
