// Where "Send feedback" goes. A page on Margin's website, so the destination (form, GitHub) can
// change without an extension update. Only the version number is passed along.
export const feedbackUrl = () => `https://margin.prayushdesai.com/feedback?v=${encodeURIComponent(chrome.runtime.getManifest().version)}`;
