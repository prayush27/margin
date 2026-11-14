// Creates Margin's beta feedback form in your Google account.
// 1. Go to https://script.google.com → New project, paste this file, click Run.
// 2. Allow access when Google asks (it only needs to create a form).
// 3. Copy the "Share link for the website" from the log at the bottom.

function createMarginFeedbackForm() {
  const form = FormApp.create("Margin beta feedback");
  form
    .setDescription(
      "Thanks for trying Margin! Short answers are fine. Please don't include private links or anything from a course you can't share.",
    )
    .setConfirmationMessage("Thanks! This really helps make Margin better.")
    .setCollectEmail(false)
    .setAcceptingResponses(true);
  if (typeof form.setPublished === "function") form.setPublished(true);

  form
    .addMultipleChoiceItem()
    .setTitle("How did it go?")
    .setChoiceValues(["Something broke", "Something was confusing", "I have an idea", "It worked well"])
    .setRequired(true);
  form
    .addParagraphTextItem()
    .setTitle("What were you doing?")
    .setHelpText("For example: reading a lecture PDF from Canvas, or saving a term on Wikipedia.");
  form.addParagraphTextItem().setTitle("What happened, or what felt confusing?").setRequired(true);
  form.addParagraphTextItem().setTitle("Anything you wish Margin did?");
  const version = form
    .addTextItem()
    .setTitle("Margin version")
    .setHelpText("Filled in for you when you come from the extension.");
  form.addTextItem().setTitle("Email (optional)").setHelpText("Only if you'd like a reply.");

  // A link that pre-fills the version; the website swaps VERSION for the real number.
  const prefilled = form.createResponse().withItemResponse(version.createResponse("VERSION")).toPrefilledUrl();

  Logger.log("Share link for the website: " + prefilled);
  Logger.log("Edit the form / see responses: " + form.getEditUrl());
}
