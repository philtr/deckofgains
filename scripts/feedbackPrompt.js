const FEEDBACK_COOKIE_NAME = "deckOfGainsFeedback";
const FEEDBACK_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export function hasSubmittedFeedback() {
  return document.cookie
    .split(";")
    .some((cookie) => cookie.trim().startsWith(`${FEEDBACK_COOKIE_NAME}=`));
}

export function rememberFeedbackSubmission() {
  document.cookie = [
    `${FEEDBACK_COOKIE_NAME}=1`,
    `Max-Age=${FEEDBACK_COOKIE_MAX_AGE_SECONDS}`,
    "Path=/",
    "SameSite=Lax",
  ].join("; ");
}

export function createFeedbackPrompt({
  onDismiss,
  onRating,
  onSubmit,
  onSkip,
}) {
  const prompt = document.createElement("section");
  prompt.id = "workout-feedback";
  prompt.className = "workout-feedback";
  prompt.setAttribute("aria-labelledby", "feedback-heading");

  const heading = document.createElement("h2");
  heading.id = "feedback-heading";
  heading.textContent = "What do you think of Deck of Gains?";
  prompt.appendChild(heading);

  const ratingControls = document.createElement("div");
  ratingControls.className = "feedback-rating-controls";
  const thumbsUp = document.createElement("button");
  thumbsUp.id = "feedback-thumbs-up";
  thumbsUp.type = "button";
  thumbsUp.textContent = "👍 Thumbs up";
  const thumbsDown = document.createElement("button");
  thumbsDown.id = "feedback-thumbs-down";
  thumbsDown.type = "button";
  thumbsDown.textContent = "👎 Thumbs down";
  ratingControls.append(thumbsUp, thumbsDown);
  prompt.appendChild(ratingControls);

  const skip = document.createElement("button");
  skip.id = "feedback-skip";
  skip.type = "button";
  skip.className = "feedback-skip";
  skip.textContent = "Skip, and start a new workout";
  prompt.appendChild(skip);

  function showFeedbackForm(rating) {
    ratingControls.remove();
    skip.remove();

    const followUp = document.createElement("p");
    followUp.textContent = "Is there any specific feedback you'd like to send?";
    prompt.appendChild(followUp);

    const form = document.createElement("form");
    form.className = "feedback-form";
    const label = document.createElement("label");
    label.htmlFor = "feedback-text";
    label.textContent = "Your feedback";
    const text = document.createElement("textarea");
    text.id = "feedback-text";
    text.name = "feedback";
    text.rows = 3;
    const submit = document.createElement("button");
    submit.id = "feedback-submit";
    submit.type = "submit";
    submit.textContent = "Send feedback";
    const cancel = document.createElement("button");
    cancel.id = "feedback-cancel";
    cancel.type = "button";
    cancel.className = "feedback-cancel";
    cancel.textContent = "Cancel";
    const actions = document.createElement("div");
    actions.className = "feedback-form-actions";
    actions.append(submit, cancel);
    form.append(label, text, actions);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const feedback = text.value.trim();
      if (!feedback) {
        text.focus();
        return;
      }
      onSubmit({ rating, feedback });
      onDismiss();
    });
    cancel.addEventListener("click", onDismiss);
    prompt.appendChild(form);
  }

  function chooseRating(rating) {
    onRating({ rating });
    showFeedbackForm(rating);
  }

  thumbsUp.addEventListener("click", () => chooseRating("up"));
  thumbsDown.addEventListener("click", () => chooseRating("down"));
  skip.addEventListener("click", () => {
    onSkip();
    onDismiss();
  });

  return prompt;
}
